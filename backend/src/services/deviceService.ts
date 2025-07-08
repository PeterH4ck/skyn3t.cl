// backend/src/services/deviceService.ts
import mqtt, { MqttClient } from 'mqtt';
import { EventEmitter } from 'events';
import { Op } from 'sequelize';
import { Device, DeviceStatus, DeviceCommand, AccessLog } from '../models';
import { websocketService } from './websocketService';
import { auditService } from './auditService';
import logger from '../utils/logger';
import { AppError } from '../utils/AppError';

interface DeviceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  temperature: number;
  uptime: number;
  signalStrength: number;
  batteryLevel?: number;
}

interface DeviceCommandPayload {
  command: string;
  parameters?: any;
  timeout?: number;
  retries?: number;
}

interface MQTTMessage {
  deviceId: string;
  timestamp: Date;
  type: 'status' | 'metrics' | 'event' | 'response';
  payload: any;
}

export class DeviceService extends EventEmitter {
  private mqttClient: MqttClient | null = null;
  private connectedDevices: Map<string, Date> = new Map();
  private pendingCommands: Map<string, any> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectInterval: number = 5000;

  constructor() {
    super();
    this.setupEventHandlers();
  }

  /**
   * Initialize MQTT connection
   */
  public async initialize(): Promise<void> {
    try {
      const mqttUrl = process.env.MQTT_URL || 'mqtt://localhost:1883';
      const options = {
        clientId: `skyn3t-backend-${Date.now()}`,
        username: process.env.MQTT_USERNAME || 'admin',
        password: process.env.MQTT_PASSWORD || 'admin',
        keepalive: 60,
        reconnectPeriod: this.reconnectInterval,
        connectTimeout: 30000,
        will: {
          topic: 'skyn3t/system/backend/status',
          payload: JSON.stringify({ status: 'offline', timestamp: new Date() }),
          qos: 1,
          retain: true
        }
      };

      this.mqttClient = mqtt.connect(mqttUrl, options);

      this.mqttClient.on('connect', this.onMQTTConnect.bind(this));
      this.mqttClient.on('message', this.onMQTTMessage.bind(this));
      this.mqttClient.on('error', this.onMQTTError.bind(this));
      this.mqttClient.on('close', this.onMQTTClose.bind(this));
      this.mqttClient.on('reconnect', this.onMQTTReconnect.bind(this));

      logger.info('DeviceService MQTT client initialized');

    } catch (error) {
      logger.error('Failed to initialize MQTT client:', error);
      throw new AppError('MQTT connection failed', 500);
    }
  }

  /**
   * MQTT Event Handlers
   */
  private onMQTTConnect(): void {
    logger.info('Connected to MQTT broker');
    this.reconnectAttempts = 0;

    // Subscribe to all device topics
    this.subscribeToTopics();

    // Publish backend online status
    this.publishBackendStatus('online');

    // Request status from all devices
    this.requestAllDeviceStatus();
  }

  private async onMQTTMessage(topic: string, message: Buffer): Promise<void> {
    try {
      const messageStr = message.toString();
      const parsedMessage: MQTTMessage = JSON.parse(messageStr);

      logger.debug(`MQTT message received on topic: ${topic}`, parsedMessage);

      // Parse topic to extract information
      const topicParts = topic.split('/');
      if (topicParts[0] !== 'skyn3t' || topicParts.length < 4) {
        logger.warn(`Invalid topic format: ${topic}`);
        return;
      }

      const [, communityId, category, deviceId, messageType] = topicParts;

      switch (category) {
        case 'devices':
          await this.handleDeviceMessage(communityId, deviceId, messageType, parsedMessage);
          break;
        case 'access-points':
          await this.handleAccessPointMessage(communityId, deviceId, messageType, parsedMessage);
          break;
        case 'alerts':
          await this.handleAlertMessage(communityId, deviceId, messageType, parsedMessage);
          break;
        default:
          logger.warn(`Unknown category: ${category}`);
      }

    } catch (error) {
      logger.error(`Error processing MQTT message from topic ${topic}:`, error);
    }
  }

  private onMQTTError(error: Error): void {
    logger.error('MQTT connection error:', error);
    this.emit('mqtt_error', error);
  }

  private onMQTTClose(): void {
    logger.warn('MQTT connection closed');
    this.publishBackendStatus('offline');
  }

  private onMQTTReconnect(): void {
    this.reconnectAttempts++;
    logger.info(`MQTT reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max MQTT reconnection attempts reached');
      this.mqttClient?.end();
    }
  }

  /**
   * Subscribe to MQTT topics
   */
  private subscribeToTopics(): void {
    if (!this.mqttClient) return;

    const topics = [
      'skyn3t/+/devices/+/status',
      'skyn3t/+/devices/+/metrics',
      'skyn3t/+/devices/+/events',
      'skyn3t/+/devices/+/response',
      'skyn3t/+/access-points/+/events',
      'skyn3t/+/alerts/+',
      'skyn3t/system/+/status'
    ];

    topics.forEach(topic => {
      this.mqttClient!.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          logger.error(`Failed to subscribe to ${topic}:`, err);
        } else {
          logger.debug(`Subscribed to topic: ${topic}`);
        }
      });
    });
  }

  /**
   * Message Handlers
   */
  private async handleDeviceMessage(communityId: string, deviceId: string, messageType: string, message: MQTTMessage): Promise<void> {
    try {
      switch (messageType) {
        case 'status':
          await this.updateDeviceStatus(deviceId, message.payload);
          break;
        case 'metrics':
          await this.updateDeviceMetrics(deviceId, message.payload);
          break;
        case 'events':
          await this.handleDeviceEvent(deviceId, message.payload);
          break;
        case 'response':
          await this.handleCommandResponse(deviceId, message.payload);
          break;
        default:
          logger.warn(`Unknown message type: ${messageType}`);
      }

      // Update last seen timestamp
      this.connectedDevices.set(deviceId, new Date());

      // Emit real-time event to WebSocket clients
      websocketService.emitToRoom(`community_${communityId}`, 'device.update', {
        deviceId,
        messageType,
        payload: message.payload,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error(`Error handling device message for ${deviceId}:`, error);
    }
  }

  private async handleAccessPointMessage(communityId: string, deviceId: string, messageType: string, message: MQTTMessage): Promise<void> {
    try {
      if (messageType === 'events') {
        const { userId, accessMethod, granted, reason, metadata } = message.payload;

        // Log access attempt
        await AccessLog.create({
          userId: userId || null,
          deviceId,
          communityId,
          accessMethod,
          accessGranted: granted,
          failureReason: granted ? null : reason,
          metadata: metadata || {},
          ipAddress: metadata?.ipAddress || null,
          userAgent: metadata?.userAgent || null
        });

        // Emit real-time access event
        websocketService.emitToRoom(`community_${communityId}`, 'access.attempt', {
          deviceId,
          userId,
          accessMethod,
          granted,
          reason,
          timestamp: new Date(),
          location: metadata?.location
        });

        // If access denied, emit security alert
        if (!granted) {
          websocketService.emitToRoom(`community_${communityId}`, 'security.alert', {
            type: 'access_denied',
            deviceId,
            userId,
            reason,
            timestamp: new Date(),
            severity: this.calculateAlertSeverity(reason)
          });
        }

        logger.info(`Access ${granted ? 'granted' : 'denied'} for user ${userId} at device ${deviceId}`, {
          communityId,
          deviceId,
          userId,
          accessMethod,
          granted,
          reason
        });
      }

    } catch (error) {
      logger.error(`Error handling access point message for ${deviceId}:`, error);
    }
  }

  private async handleAlertMessage(communityId: string, deviceId: string, messageType: string, message: MQTTMessage): Promise<void> {
    try {
      const { alertType, severity, description, metadata } = message.payload;

      // Log alert in audit system
      await auditService.logEvent({
        type: 'device_alert',
        userId: null,
        communityId,
        details: {
          deviceId,
          alertType,
          severity,
          description,
          metadata
        },
        ipAddress: null,
        userAgent: 'MQTT Device'
      });

      // Emit real-time alert
      websocketService.emitToRoom(`community_${communityId}`, 'device.alert', {
        deviceId,
        alertType,
        severity,
        description,
        metadata,
        timestamp: new Date()
      });

      // Handle critical alerts
      if (severity === 'critical') {
        await this.handleCriticalAlert(communityId, deviceId, message.payload);
      }

      logger.warn(`Device alert received from ${deviceId}:`, {
        communityId,
        deviceId,
        alertType,
        severity,
        description
      });

    } catch (error) {
      logger.error(`Error handling alert message for ${deviceId}:`, error);
    }
  }

  /**
   * Device Management Methods
   */
  public async sendCommand(deviceId: string, command: DeviceCommandPayload, userId?: string): Promise<string> {
    try {
      if (!this.mqttClient) {
        throw new AppError('MQTT client not connected', 500);
      }

      const device = await Device.findByPk(deviceId);
      if (!device) {
        throw new AppError('Device not found', 404);
      }

      const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const payload = {
        commandId,
        command: command.command,
        parameters: command.parameters || {},
        timestamp: new Date(),
        timeout: command.timeout || 30000,
        userId
      };

      // Store pending command
      this.pendingCommands.set(commandId, {
        deviceId,
        payload,
        sentAt: new Date(),
        timeout: setTimeout(() => {
          this.handleCommandTimeout(commandId);
        }, command.timeout || 30000)
      });

      // Log command in database
      await DeviceCommand.create({
        id: commandId,
        deviceId,
        communityId: device.communityId,
        command: command.command,
        parameters: command.parameters || {},
        status: 'pending',
        sentBy: userId || null,
        sentAt: new Date()
      });

      // Publish command to device
      const topic = `skyn3t/${device.communityId}/devices/${deviceId}/commands`;
      this.mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 });

      logger.info(`Command sent to device ${deviceId}:`, {
        commandId,
        command: command.command,
        userId
      });

      return commandId;

    } catch (error) {
      logger.error(`Error sending command to device ${deviceId}:`, error);
      throw error;
    }
  }

  public async bulkCommand(deviceIds: string[], command: DeviceCommandPayload, userId?: string): Promise<string[]> {
    try {
      const commandIds: string[] = [];

      for (const deviceId of deviceIds) {
        try {
          const commandId = await this.sendCommand(deviceId, command, userId);
          commandIds.push(commandId);
        } catch (error) {
          logger.error(`Failed to send command to device ${deviceId}:`, error);
        }
      }

      logger.info(`Bulk command sent to ${commandIds.length}/${deviceIds.length} devices:`, {
        command: command.command,
        userId,
        successCount: commandIds.length,
        totalCount: deviceIds.length
      });

      return commandIds;

    } catch (error) {
      logger.error('Error in bulk command operation:', error);
      throw error;
    }
  }

  public async registerDevice(deviceData: any): Promise<Device> {
    try {
      const device = await Device.create({
        ...deviceData,
        status: 'offline',
        lastSeen: new Date()
      });

      // Subscribe to device-specific topics
      if (this.mqttClient) {
        const topics = [
          `skyn3t/${device.communityId}/devices/${device.id}/status`,
          `skyn3t/${device.communityId}/devices/${device.id}/metrics`,
          `skyn3t/${device.communityId}/devices/${device.id}/events`,
          `skyn3t/${device.communityId}/devices/${device.id}/response`
        ];

        topics.forEach(topic => {
          this.mqttClient!.subscribe(topic, { qos: 1 });
        });
      }

      // Send device configuration
      await this.sendDeviceConfiguration(device.id);

      logger.info(`Device registered: ${device.id}`, deviceData);

      return device;

    } catch (error) {
      logger.error('Error registering device:', error);
      throw error;
    }
  }

  public async removeDevice(deviceId: string): Promise<void> {
    try {
      const device = await Device.findByPk(deviceId);
      if (!device) {
        throw new AppError('Device not found', 404);
      }

      // Send shutdown command
      await this.sendCommand(deviceId, { command: 'shutdown' });

      // Unsubscribe from device topics
      if (this.mqttClient) {
        const topics = [
          `skyn3t/${device.communityId}/devices/${deviceId}/+`
        ];

        topics.forEach(topic => {
          this.mqttClient!.unsubscribe(topic);
        });
      }

      // Remove from connected devices
      this.connectedDevices.delete(deviceId);

      // Soft delete device
      await device.update({ status: 'decommissioned', lastSeen: new Date() });

      logger.info(`Device removed: ${deviceId}`);

    } catch (error) {
      logger.error(`Error removing device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Device Status and Metrics Methods
   */
  private async updateDeviceStatus(deviceId: string, statusData: any): Promise<void> {
    try {
      const device = await Device.findByPk(deviceId);
      if (!device) {
        logger.warn(`Status update for unknown device: ${deviceId}`);
        return;
      }

      await device.update({
        status: statusData.status || 'online',
        lastSeen: new Date(),
        firmware: statusData.firmware || device.firmware,
        ipAddress: statusData.ipAddress || device.ipAddress
      });

      // Update or create device status record
      await DeviceStatus.upsert({
        deviceId,
        status: statusData.status || 'online',
        cpuUsage: statusData.cpuUsage || 0,
        memoryUsage: statusData.memoryUsage || 0,
        diskUsage: statusData.diskUsage || 0,
        temperature: statusData.temperature || 0,
        uptimeHours: statusData.uptimeHours || 0,
        signalStrength: statusData.signalStrength || 100,
        batteryLevel: statusData.batteryLevel || null,
        lastHeartbeat: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });

    } catch (error) {
      logger.error(`Error updating device status for ${deviceId}:`, error);
    }
  }

  private async updateDeviceMetrics(deviceId: string, metrics: DeviceMetrics): Promise<void> {
    try {
      await DeviceStatus.upsert({
        deviceId,
        cpuUsage: metrics.cpuUsage,
        memoryUsage: metrics.memoryUsage,
        diskUsage: metrics.diskUsage,
        temperature: metrics.temperature,
        uptimeHours: metrics.uptime,
        signalStrength: metrics.signalStrength,
        batteryLevel: metrics.batteryLevel || null,
        lastHeartbeat: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Check for threshold alerts
      await this.checkMetricThresholds(deviceId, metrics);

    } catch (error) {
      logger.error(`Error updating device metrics for ${deviceId}:`, error);
    }
  }

  private async checkMetricThresholds(deviceId: string, metrics: DeviceMetrics): Promise<void> {
    const thresholds = {
      cpuUsage: 85,
      memoryUsage: 90,
      temperature: 70,
      batteryLevel: 20
    };

    const alerts: any[] = [];

    if (metrics.cpuUsage > thresholds.cpuUsage) {
      alerts.push({
        type: 'high_cpu_usage',
        severity: 'warning',
        value: metrics.cpuUsage,
        threshold: thresholds.cpuUsage
      });
    }

    if (metrics.memoryUsage > thresholds.memoryUsage) {
      alerts.push({
        type: 'high_memory_usage',
        severity: 'critical',
        value: metrics.memoryUsage,
        threshold: thresholds.memoryUsage
      });
    }

    if (metrics.temperature > thresholds.temperature) {
      alerts.push({
        type: 'high_temperature',
        severity: 'warning',
        value: metrics.temperature,
        threshold: thresholds.temperature
      });
    }

    if (metrics.batteryLevel && metrics.batteryLevel < thresholds.batteryLevel) {
      alerts.push({
        type: 'low_battery',
        severity: 'warning',
        value: metrics.batteryLevel,
        threshold: thresholds.batteryLevel
      });
    }

    // Process alerts
    for (const alert of alerts) {
      await this.processThresholdAlert(deviceId, alert);
    }
  }

  /**
   * Event Handlers
   */
  private async handleDeviceEvent(deviceId: string, eventData: any): Promise<void> {
    try {
      const { eventType, data, metadata } = eventData;

      switch (eventType) {
        case 'device_startup':
          await this.handleDeviceStartup(deviceId, data);
          break;
        case 'device_shutdown':
          await this.handleDeviceShutdown(deviceId, data);
          break;
        case 'connection_lost':
          await this.handleConnectionLost(deviceId, data);
          break;
        case 'maintenance_mode':
          await this.handleMaintenanceMode(deviceId, data);
          break;
        default:
          logger.info(`Unknown device event: ${eventType}`, { deviceId, data });
      }

    } catch (error) {
      logger.error(`Error handling device event for ${deviceId}:`, error);
    }
  }

  private async handleCommandResponse(deviceId: string, responseData: any): Promise<void> {
    try {
      const { commandId, status, result, error } = responseData;

      const pendingCommand = this.pendingCommands.get(commandId);
      if (!pendingCommand) {
        logger.warn(`Received response for unknown command: ${commandId}`);
        return;
      }

      // Clear timeout
      clearTimeout(pendingCommand.timeout);
      this.pendingCommands.delete(commandId);

      // Update command status in database
      await DeviceCommand.update({
        status,
        result: result || null,
        error: error || null,
        completedAt: new Date()
      }, {
        where: { id: commandId }
      });

      // Emit command completion event
      this.emit('command_completed', {
        commandId,
        deviceId,
        status,
        result,
        error
      });

      logger.info(`Command ${commandId} completed with status: ${status}`, {
        deviceId,
        result,
        error
      });

    } catch (error) {
      logger.error(`Error handling command response for ${deviceId}:`, error);
    }
  }

  private handleCommandTimeout(commandId: string): void {
    const pendingCommand = this.pendingCommands.get(commandId);
    if (!pendingCommand) return;

    this.pendingCommands.delete(commandId);

    // Update command as timed out
    DeviceCommand.update({
      status: 'timeout',
      error: 'Command timed out',
      completedAt: new Date()
    }, {
      where: { id: commandId }
    }).catch(error => {
      logger.error(`Error updating timed out command ${commandId}:`, error);
    });

    logger.warn(`Command ${commandId} timed out`, {
      deviceId: pendingCommand.deviceId,
      command: pendingCommand.payload.command
    });
  }

  /**
   * Utility Methods
   */
  private async sendDeviceConfiguration(deviceId: string): Promise<void> {
    try {
      const device = await Device.findByPk(deviceId);
      if (!device) return;

      const config = {
        heartbeatInterval: 30000, // 30 seconds
        metricsInterval: 60000,   // 1 minute
        reconnectAttempts: 5,
        timezone: 'America/Santiago',
        features: device.features || [],
        thresholds: {
          cpuUsage: 85,
          memoryUsage: 90,
          temperature: 70
        }
      };

      await this.sendCommand(deviceId, {
        command: 'configure',
        parameters: config
      });

    } catch (error) {
      logger.error(`Error sending configuration to device ${deviceId}:`, error);
    }
  }

  private async requestAllDeviceStatus(): Promise<void> {
    try {
      const devices = await Device.findAll({
        where: {
          status: {
            [Op.ne]: 'decommissioned'
          }
        }
      });

      for (const device of devices) {
        await this.sendCommand(device.id, { command: 'status' });
      }

      logger.info(`Status requested from ${devices.length} devices`);

    } catch (error) {
      logger.error('Error requesting device status:', error);
    }
  }

  private publishBackendStatus(status: 'online' | 'offline'): void {
    if (!this.mqttClient) return;

    const payload = {
      status,
      timestamp: new Date(),
      version: process.env.npm_package_version || '1.0.0',
      pid: process.pid
    };

    this.mqttClient.publish(
      'skyn3t/system/backend/status',
      JSON.stringify(payload),
      { qos: 1, retain: true }
    );
  }

  private calculateAlertSeverity(reason: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalReasons = ['unauthorized_access', 'forced_entry', 'tampering'];
    const highReasons = ['invalid_credentials', 'expired_access', 'blacklisted_user'];
    const mediumReasons = ['device_error', 'network_issue'];

    if (criticalReasons.includes(reason)) return 'critical';
    if (highReasons.includes(reason)) return 'high';
    if (mediumReasons.includes(reason)) return 'medium';
    return 'low';
  }

  private async handleCriticalAlert(communityId: string, deviceId: string, alertData: any): Promise<void> {
    // Implement critical alert handling logic
    // - Send notifications to administrators
    // - Log to external monitoring systems
    // - Trigger emergency protocols if needed
    
    logger.error(`CRITICAL ALERT from device ${deviceId}:`, alertData);
  }

  private async handleDeviceStartup(deviceId: string, data: any): Promise<void> {
    await Device.update({
      status: 'online',
      lastSeen: new Date()
    }, {
      where: { id: deviceId }
    });

    logger.info(`Device ${deviceId} started up`);
  }

  private async handleDeviceShutdown(deviceId: string, data: any): Promise<void> {
    await Device.update({
      status: 'offline',
      lastSeen: new Date()
    }, {
      where: { id: deviceId }
    });

    logger.info(`Device ${deviceId} shut down`);
  }

  private async handleConnectionLost(deviceId: string, data: any): Promise<void> {
    await Device.update({
      status: 'offline',
      lastSeen: new Date()
    }, {
      where: { id: deviceId }
    });

    logger.warn(`Connection lost to device ${deviceId}`);
  }

  private async handleMaintenanceMode(deviceId: string, data: any): Promise<void> {
    await Device.update({
      status: 'maintenance',
      lastSeen: new Date()
    }, {
      where: { id: deviceId }
    });

    logger.info(`Device ${deviceId} entered maintenance mode`);
  }

  private async processThresholdAlert(deviceId: string, alert: any): Promise<void> {
    const device = await Device.findByPk(deviceId);
    if (!device) return;

    // Emit real-time alert
    websocketService.emitToRoom(`community_${device.communityId}`, 'device.threshold_alert', {
      deviceId,
      alertType: alert.type,
      severity: alert.severity,
      value: alert.value,
      threshold: alert.threshold,
      timestamp: new Date()
    });

    logger.warn(`Threshold alert for device ${deviceId}:`, alert);
  }

  private setupEventHandlers(): void {
    this.on('command_completed', (data) => {
      // Handle completed commands
      logger.debug('Command completed:', data);
    });

    this.on('mqtt_error', (error) => {
      // Handle MQTT errors
      logger.error('MQTT error:', error);
    });
  }

  /**
   * Cleanup
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.mqttClient) {
        this.publishBackendStatus('offline');
        this.mqttClient.end();
        this.mqttClient = null;
      }

      // Clear all pending commands
      this.pendingCommands.clear();
      this.connectedDevices.clear();

      logger.info('DeviceService disconnected');

    } catch (error) {
      logger.error('Error disconnecting DeviceService:', error);
    }
  }
}

// Export singleton instance
export const deviceService = new DeviceService();
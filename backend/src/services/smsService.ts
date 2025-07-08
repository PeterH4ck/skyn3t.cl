// backend/src/services/smsService.ts
import twilio from 'twilio';
import axios from 'axios';
import { Queue, Worker } from 'bullmq';
import { Op } from 'sequelize';
import { SmsLog, SmsTemplate, User } from '../models';
import { cacheService } from './cacheService';
import logger from '../utils/logger';
import { AppError } from '../utils/AppError';

interface SmsOptions {
  to: string | string[];
  message: string;
  template?: string;
  templateData?: any;
  priority?: 'high' | 'normal' | 'low';
  provider?: 'twilio' | 'cmtelecom' | 'simple_texting' | 'auto';
  scheduleAt?: Date;
  tracking?: boolean;
  tags?: string[];
}

interface BulkSmsOptions {
  recipients: Array<{
    phone: string;
    personalData?: any;
  }>;
  template: string;
  globalData?: any;
  provider?: 'twilio' | 'cmtelecom' | 'simple_texting' | 'auto';
  sendAt?: Date;
  batchSize?: number;
  priority?: 'high' | 'normal' | 'low';
}

interface SmsProvider {
  name: string;
  enabled: boolean;
  priority: number;
  costPerSms: number;
  maxLength: number;
  supportedCountries: string[];
  rateLimitPerSecond: number;
  sendSms(to: string, message: string, options?: any): Promise<any>;
  checkBalance?(): Promise<number>;
  getDeliveryStatus?(messageId: string): Promise<string>;
}

interface SmsStats {
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
  cost: number;
}

export class SmsService {
  private providers: Map<string, SmsProvider> = new Map();
  private smsQueue: Queue | null = null;
  private templates: Map<string, (data: any) => string> = new Map();
  private isInitialized: boolean = false;
  private rateLimiters: Map<string, { requests: number; resetTime: number }> = new Map();

  constructor() {
    // Initialize providers will be called during initialize()
  }

  /**
   * Initialize SMS Service
   */
  public async initialize(): Promise<void> {
    try {
      await this.initializeProviders();
      await this.setupSmsQueue();
      await this.loadTemplates();
      
      this.isInitialized = true;
      logger.info('SmsService initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize SmsService:', error);
      throw new AppError('SMS service initialization failed', 500);
    }
  }

  /**
   * Initialize SMS Providers
   */
  private async initializeProviders(): Promise<void> {
    // Twilio Provider
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const twilioProvider = new TwilioProvider();
      await twilioProvider.initialize();
      this.providers.set('twilio', twilioProvider);
    }

    // CM Telecom Provider (Chile)
    if (process.env.CMTELECOM_API_KEY) {
      const cmProvider = new CMTelecomProvider();
      await cmProvider.initialize();
      this.providers.set('cmtelecom', cmProvider);
    }

    // Simple Texting Provider
    if (process.env.SIMPLE_TEXTING_API_KEY) {
      const stProvider = new SimpleTextingProvider();
      await stProvider.initialize();
      this.providers.set('simple_texting', stProvider);
    }

    if (this.providers.size === 0) {
      throw new AppError('No SMS providers configured', 500);
    }

    logger.info(`Initialized ${this.providers.size} SMS providers`);
  }

  /**
   * Setup SMS Queue
   */
  private async setupSmsQueue(): Promise<void> {
    this.smsQueue = new Queue('sms-queue', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });

    // Setup worker to process SMS jobs
    new Worker('sms-queue', async (job) => {
      const { type, data } = job.data;

      switch (type) {
        case 'single_sms':
          return await this.processSingleSms(data);
        case 'bulk_sms':
          return await this.processBulkSms(data);
        case 'scheduled_sms':
          return await this.processScheduledSms(data);
        default:
          throw new Error(`Unknown SMS job type: ${type}`);
      }
    }, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      },
      concurrency: 3
    });

    logger.info('SMS queue setup completed');
  }

  /**
   * Load SMS Templates
   */
  private async loadTemplates(): Promise<void> {
    try {
      const dbTemplates = await SmsTemplate.findAll({
        where: { active: true }
      });

      for (const template of dbTemplates) {
        const compiledTemplate = this.compileTemplate(template.content);
        this.templates.set(template.name, compiledTemplate);
      }

      logger.info(`Loaded ${this.templates.size} SMS templates`);

    } catch (error) {
      logger.error('Error loading SMS templates:', error);
    }
  }

  private compileTemplate(templateContent: string): (data: any) => string {
    return (data: any) => {
      let message = templateContent;
      
      // Simple template engine - replace {{variable}} with data values
      Object.keys(data).forEach(key => {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        message = message.replace(regex, data[key] || '');
      });

      return message;
    };
  }

  /**
   * Send Single SMS
   */
  public async sendSms(options: SmsOptions): Promise<string> {
    try {
      if (!this.isInitialized) {
        throw new AppError('SMS service not initialized', 500);
      }

      const trackingId = `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Validate phone numbers
      const phoneNumbers = Array.isArray(options.to) ? options.to : [options.to];
      const validatedNumbers = phoneNumbers.map(phone => this.validatePhoneNumber(phone));

      // Prepare message content
      let message = options.message;
      if (options.template) {
        const template = this.templates.get(options.template);
        if (!template) {
          throw new AppError(`SMS template '${options.template}' not found`, 404);
        }
        message = template(options.templateData || {});
      }

      // Validate message length
      this.validateMessageLength(message, options.provider);

      // Queue SMS for processing
      if (options.scheduleAt) {
        await this.smsQueue!.add('scheduled_sms', {
          type: 'single_sms',
          data: { 
            phoneNumbers: validatedNumbers, 
            message, 
            trackingId, 
            options 
          }
        }, {
          delay: options.scheduleAt.getTime() - Date.now()
        });
      } else {
        await this.smsQueue!.add('single_sms', {
          type: 'single_sms',
          data: { 
            phoneNumbers: validatedNumbers, 
            message, 
            trackingId, 
            options 
          }
        }, {
          priority: this.getPriority(options.priority)
        });
      }

      logger.info(`SMS queued for sending: ${trackingId}`, {
        to: options.to,
        template: options.template,
        provider: options.provider
      });

      return trackingId;

    } catch (error) {
      logger.error('Error sending SMS:', error);
      throw error;
    }
  }

  /**
   * Send Bulk SMS
   */
  public async sendBulkSms(options: BulkSmsOptions): Promise<string[]> {
    try {
      if (!this.isInitialized) {
        throw new AppError('SMS service not initialized', 500);
      }

      const batchSize = options.batchSize || 50;
      const trackingIds: string[] = [];

      // Split recipients into batches
      for (let i = 0; i < options.recipients.length; i += batchSize) {
        const batch = options.recipients.slice(i, i + batchSize);
        const batchId = `bulk_sms_${Date.now()}_${i}`;

        await this.smsQueue!.add('bulk_sms', {
          type: 'bulk_sms',
          data: {
            recipients: batch,
            template: options.template,
            globalData: options.globalData,
            provider: options.provider,
            batchId
          }
        }, {
          delay: options.sendAt ? options.sendAt.getTime() - Date.now() : 0,
          priority: this.getPriority(options.priority)
        });

        trackingIds.push(batchId);
      }

      logger.info(`Bulk SMS queued: ${options.recipients.length} recipients in ${trackingIds.length} batches`, {
        template: options.template,
        provider: options.provider
      });

      return trackingIds;

    } catch (error) {
      logger.error('Error sending bulk SMS:', error);
      throw error;
    }
  }

  /**
   * Process Single SMS
   */
  private async processSingleSms(data: any): Promise<void> {
    try {
      const { phoneNumbers, message, trackingId, options } = data;

      for (const phoneNumber of phoneNumbers) {
        const individualTrackingId = `${trackingId}_${phoneNumber.replace(/\D/g, '')}`;

        // Log SMS attempt
        await SmsLog.create({
          trackingId: individualTrackingId,
          recipient: phoneNumber,
          message,
          template: options.template || null,
          status: 'sending',
          sentAt: new Date(),
          tags: options.tags || [],
          provider: options.provider
        });

        try {
          // Select provider and send SMS
          const provider = await this.selectProvider(phoneNumber, options.provider);
          const result = await provider.sendSms(phoneNumber, message, {
            trackingId: individualTrackingId
          });

          // Update log with success
          await SmsLog.update({
            status: 'sent',
            providerMessageId: result.messageId,
            cost: result.cost || 0,
            provider: provider.name
          }, {
            where: { trackingId: individualTrackingId }
          });

          logger.info(`SMS sent successfully: ${individualTrackingId}`, {
            recipient: phoneNumber,
            provider: provider.name,
            messageId: result.messageId
          });

        } catch (error) {
          // Update log with error
          await SmsLog.update({
            status: 'failed',
            error: error.message
          }, {
            where: { trackingId: individualTrackingId }
          });

          logger.error(`SMS sending failed: ${individualTrackingId}`, error);
        }
      }

    } catch (error) {
      logger.error(`SMS processing failed: ${data.trackingId}`, error);
      throw error;
    }
  }

  /**
   * Process Bulk SMS
   */
  private async processBulkSms(data: any): Promise<void> {
    try {
      const { recipients, template, globalData, provider, batchId } = data;

      const compiledTemplate = this.templates.get(template);
      if (!compiledTemplate) {
        throw new AppError(`SMS template '${template}' not found`, 404);
      }

      for (const recipient of recipients) {
        const trackingId = `${batchId}_${recipient.phone.replace(/\D/g, '')}`;

        const templateData = {
          ...globalData,
          ...recipient.personalData
        };

        const message = compiledTemplate(templateData);

        try {
          // Log SMS attempt
          await SmsLog.create({
            trackingId,
            recipient: recipient.phone,
            message,
            template,
            status: 'sending',
            sentAt: new Date(),
            batchId
          });

          // Select provider and send SMS
          const selectedProvider = await this.selectProvider(recipient.phone, provider);
          const result = await selectedProvider.sendSms(recipient.phone, message, {
            trackingId
          });

          // Update log with success
          await SmsLog.update({
            status: 'sent',
            providerMessageId: result.messageId,
            cost: result.cost || 0,
            provider: selectedProvider.name
          }, {
            where: { trackingId }
          });

        } catch (error) {
          // Update log with error
          await SmsLog.update({
            status: 'failed',
            error: error.message
          }, {
            where: { trackingId }
          });

          logger.error(`Bulk SMS failed for ${recipient.phone}:`, error);
        }

        // Add small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      logger.info(`Bulk SMS batch completed: ${batchId}`, {
        recipientCount: recipients.length,
        template,
        provider
      });

    } catch (error) {
      logger.error(`Bulk SMS batch failed: ${data.batchId}`, error);
      throw error;
    }
  }

  /**
   * Process Scheduled SMS
   */
  private async processScheduledSms(data: any): Promise<void> {
    return await this.processSingleSms(data);
  }

  /**
   * Provider Selection Logic
   */
  private async selectProvider(phoneNumber: string, preferredProvider?: string): Promise<SmsProvider> {
    const countryCode = this.extractCountryCode(phoneNumber);

    if (preferredProvider && this.providers.has(preferredProvider)) {
      const provider = this.providers.get(preferredProvider)!;
      if (provider.enabled && provider.supportedCountries.includes(countryCode)) {
        return provider;
      }
    }

    // Auto-select best provider based on country and cost
    const availableProviders = Array.from(this.providers.values())
      .filter(p => p.enabled && p.supportedCountries.includes(countryCode))
      .sort((a, b) => {
        // Sort by priority first, then by cost
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.costPerSms - b.costPerSms;
      });

    if (availableProviders.length === 0) {
      throw new AppError(`No SMS provider available for country code ${countryCode}`, 500);
    }

    return availableProviders[0];
  }

  /**
   * Utility Methods
   */
  private validatePhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');

    // Add Chile country code if missing
    if (cleaned.length === 9 && cleaned.startsWith('9')) {
      return '+56' + cleaned;
    }

    if (cleaned.length === 11 && cleaned.startsWith('569')) {
      return '+' + cleaned;
    }

    if (cleaned.startsWith('56') && cleaned.length === 11) {
      return '+' + cleaned;
    }

    // International format
    if (cleaned.length > 10) {
      return '+' + cleaned;
    }

    throw new AppError(`Invalid phone number format: ${phone}`, 400);
  }

  private validateMessageLength(message: string, provider?: string): void {
    const maxLength = provider ? 
      (this.providers.get(provider)?.maxLength || 160) : 
      160; // Default SMS length

    if (message.length > maxLength) {
      throw new AppError(`Message too long: ${message.length} chars (max: ${maxLength})`, 400);
    }
  }

  private extractCountryCode(phoneNumber: string): string {
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    if (cleaned.startsWith('56')) {
      return 'CL'; // Chile
    }
    if (cleaned.startsWith('1')) {
      return 'US'; // USA/Canada
    }
    if (cleaned.startsWith('54')) {
      return 'AR'; // Argentina
    }
    if (cleaned.startsWith('57')) {
      return 'CO'; // Colombia
    }
    
    return 'CL'; // Default to Chile
  }

  private getPriority(priority?: 'high' | 'normal' | 'low'): number {
    switch (priority) {
      case 'high': return 10;
      case 'low': return 1;
      default: return 5;
    }
  }

  /**
   * SMS Analytics
   */
  public async getSmsStats(filters?: any): Promise<SmsStats> {
    try {
      const where: any = {};
      
      if (filters?.startDate && filters?.endDate) {
        where.sentAt = {
          [Op.between]: [filters.startDate, filters.endDate]
        };
      }
      
      if (filters?.provider) {
        where.provider = filters.provider;
      }

      const stats = await SmsLog.findAll({
        attributes: [
          [literal('COUNT(*)'), 'sent'],
          [literal('COUNT(CASE WHEN status = \'delivered\' THEN 1 END)'), 'delivered'],
          [literal('COUNT(CASE WHEN status = \'failed\' THEN 1 END)'), 'failed'],
          [literal('COUNT(CASE WHEN status = \'pending\' THEN 1 END)'), 'pending'],
          [literal('COALESCE(SUM(cost), 0)'), 'cost']
        ],
        where,
        raw: true
      });

      return stats[0] as any;

    } catch (error) {
      logger.error('Error getting SMS stats:', error);
      throw error;
    }
  }

  /**
   * Template Management
   */
  public async createTemplate(name: string, content: string): Promise<void> {
    try {
      // Save to database
      await SmsTemplate.create({
        name,
        content,
        active: true
      });

      // Compile and cache template
      const compiledTemplate = this.compileTemplate(content);
      this.templates.set(name, compiledTemplate);

      logger.info(`SMS template created: ${name}`);

    } catch (error) {
      logger.error(`Error creating SMS template: ${name}`, error);
      throw error;
    }
  }

  /**
   * Cleanup
   */
  public async shutdown(): Promise<void> {
    try {
      if (this.smsQueue) {
        await this.smsQueue.close();
      }

      logger.info('SmsService shutdown completed');

    } catch (error) {
      logger.error('Error shutting down SmsService:', error);
    }
  }
}

/**
 * Twilio Provider Implementation
 */
class TwilioProvider implements SmsProvider {
  name = 'twilio';
  enabled = true;
  priority = 8;
  costPerSms = 0.0075; // $0.0075 USD per SMS
  maxLength = 1600; // Twilio supports long messages
  supportedCountries = ['CL', 'US', 'CA', 'AR', 'CO', 'MX', 'PE', 'BR'];
  rateLimitPerSecond = 1; // 1 message per second for free tier

  private client: any;

  async initialize(): Promise<void> {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  async sendSms(to: string, message: string, options?: any): Promise<any> {
    try {
      const result = await this.client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to,
        statusCallback: `${process.env.API_URL}/api/v1/sms/webhook/twilio/${options?.trackingId}`
      });

      return {
        messageId: result.sid,
        cost: this.costPerSms,
        status: result.status
      };

    } catch (error) {
      logger.error('Twilio SMS sending failed:', error);
      throw error;
    }
  }

  async checkBalance(): Promise<number> {
    try {
      const account = await this.client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
      return parseFloat(account.balance);
    } catch (error) {
      logger.error('Error checking Twilio balance:', error);
      return 0;
    }
  }

  async getDeliveryStatus(messageId: string): Promise<string> {
    try {
      const message = await this.client.messages(messageId).fetch();
      return message.status;
    } catch (error) {
      logger.error('Error getting Twilio delivery status:', error);
      return 'unknown';
    }
  }
}

/**
 * CM Telecom Provider (Popular in Chile)
 */
class CMTelecomProvider implements SmsProvider {
  name = 'cmtelecom';
  enabled = true;
  priority = 9; // Higher priority for Chile
  costPerSms = 0.05; // Cheaper for local Chile SMS
  maxLength = 160;
  supportedCountries = ['CL', 'AR', 'PE', 'CO'];
  rateLimitPerSecond = 10;

  async initialize(): Promise<void> {
    // CM Telecom initialization
  }

  async sendSms(to: string, message: string, options?: any): Promise<any> {
    try {
      const response = await axios.post('https://gw.cmtelecom.com/v1.0/message', {
        messages: {
          authentication: {
            producttoken: process.env.CMTELECOM_API_KEY
          },
          msg: [{
            from: process.env.CMTELECOM_SENDER_ID,
            to: [{
              number: to
            }],
            body: {
              content: message
            }
          }]
        }
      });

      return {
        messageId: response.data.messages[0].id,
        cost: this.costPerSms,
        status: 'sent'
      };

    } catch (error) {
      logger.error('CM Telecom SMS sending failed:', error);
      throw error;
    }
  }
}

/**
 * Simple Texting Provider
 */
class SimpleTextingProvider implements SmsProvider {
  name = 'simple_texting';
  enabled = true;
  priority = 6;
  costPerSms = 0.02;
  maxLength = 160;
  supportedCountries = ['US', 'CA'];
  rateLimitPerSecond = 5;

  async initialize(): Promise<void> {
    // Simple Texting initialization
  }

  async sendSms(to: string, message: string, options?: any): Promise<any> {
    try {
      const response = await axios.post('https://app.simpletexting.com/v2/api/messages', {
        accountId: process.env.SIMPLE_TEXTING_ACCOUNT_ID,
        message,
        phone: to
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.SIMPLE_TEXTING_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        messageId: response.data.id,
        cost: this.costPerSms,
        status: 'sent'
      };

    } catch (error) {
      logger.error('Simple Texting SMS sending failed:', error);
      throw error;
    }
  }
}

// Import literal for Sequelize
import { literal } from 'sequelize';

// Export singleton instance
export const smsService = new SmsService();
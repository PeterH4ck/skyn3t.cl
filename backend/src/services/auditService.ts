import { AuditLog } from '../models/AuditLog';
import { User } from '../models/User';
import { logger } from '../utils/logger';

export interface AuditEntry {
  entity_type: string;
  entity_id: string;
  action: string;
  old_values?: any;
  new_values?: any;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  metadata?: any;
}

class AuditService {
  /**
   * Log an audit entry
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await AuditLog.create({
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        action: entry.action,
        old_values: entry.old_values,
        new_values: entry.new_values,
        user_id: entry.user_id,
        ip_address: entry.ip_address,
        user_agent: entry.user_agent,
        session_id: entry.session_id,
        metadata: entry.metadata,
        created_at: new Date()
      });

      // Also log to application logger for critical actions
      if (this.isCriticalAction(entry.action)) {
        logger.warn('Critical audit action', {
          ...entry,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      logger.error('Failed to log audit entry', {
        error: (error as Error).message,
        entry
      });
    }
  }

  /**
   * Get audit trail for an entity
   */
  async getAuditTrail(
    entityType: string,
    entityId: string,
    limit: number = 50
  ): Promise<AuditLog[]> {
    return AuditLog.findAll({
      where: {
        entity_type: entityType,
        entity_id: entityId
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'first_name', 'last_name']
      }],
      order: [['created_at', 'DESC']],
      limit
    });
  }

  /**
   * Get user activity
   */
  async getUserActivity(
    userId: string,
    dateFrom?: Date,
    dateTo?: Date,
    limit: number = 100
  ): Promise<AuditLog[]> {
    const where: any = { user_id: userId };

    if (dateFrom || dateTo) {
      where.created_at = {};
      if (dateFrom) where.created_at.$gte = dateFrom;
      if (dateTo) where.created_at.$lte = dateTo;
    }

    return AuditLog.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit
    });
  }

  /**
   * Get system-wide audit summary
   */
  async getAuditSummary(
    dateFrom: Date,
    dateTo: Date
  ): Promise<{
    totalActions: number;
    actionsByType: Record<string, number>;
    actionsByUser: Array<{ userId: string; username: string; count: number }>;
    criticalActions: number;
  }> {
    const where = {
      created_at: {
        $gte: dateFrom,
        $lte: dateTo
      }
    };

    const totalActions = await AuditLog.count({ where });

    // Get actions by type
    const actionTypes = await AuditLog.findAll({
      where,
      attributes: [
        'action',
        [AuditLog.sequelize!.fn('COUNT', AuditLog.sequelize!.col('id')), 'count']
      ],
      group: ['action'],
      raw: true
    });

    const actionsByType: Record<string, number> = {};
    actionTypes.forEach((item: any) => {
      actionsByType[item.action] = parseInt(item.count);
    });

    // Get actions by user
    const userActions = await AuditLog.findAll({
      where,
      attributes: [
        'user_id',
        [AuditLog.sequelize!.fn('COUNT', AuditLog.sequelize!.col('audit_log.id')), 'count']
      ],
      include: [{
        model: User,
        as: 'user',
        attributes: ['username']
      }],
      group: ['user_id', 'user.id', 'user.username'],
      order: [[AuditLog.sequelize!.fn('COUNT', AuditLog.sequelize!.col('audit_log.id')), 'DESC']],
      limit: 10,
      raw: true
    });

    const actionsByUser = userActions.map((item: any) => ({
      userId: item.user_id,
      username: item['user.username'],
      count: parseInt(item.count)
    }));

    // Count critical actions
    const criticalActions = await AuditLog.count({
      where: {
        ...where,
        action: {
          $in: this.getCriticalActions()
        }
      }
    });

    return {
      totalActions,
      actionsByType,
      actionsByUser,
      criticalActions
    };
  }

  /**
   * Search audit logs
   */
  async searchAuditLogs(
    searchParams: {
      entityType?: string;
      entityId?: string;
      action?: string;
      userId?: string;
      ipAddress?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
    page: number = 1,
    limit: number = 50
  ): Promise<{
    logs: AuditLog[];
    total: number;
    pages: number;
  }> {
    const where: any = {};

    if (searchParams.entityType) where.entity_type = searchParams.entityType;
    if (searchParams.entityId) where.entity_id = searchParams.entityId;
    if (searchParams.action) where.action = searchParams.action;
    if (searchParams.userId) where.user_id = searchParams.userId;
    if (searchParams.ipAddress) where.ip_address = searchParams.ipAddress;

    if (searchParams.dateFrom || searchParams.dateTo) {
      where.created_at = {};
      if (searchParams.dateFrom) where.created_at.$gte = searchParams.dateFrom;
      if (searchParams.dateTo) where.created_at.$lte = searchParams.dateTo;
    }

    const offset = (page - 1) * limit;

    const { rows: logs, count: total } = await AuditLog.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'first_name', 'last_name']
      }],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    const pages = Math.ceil(total / limit);

    return { logs, total, pages };
  }

  /**
   * Clean up old audit logs
   */
  async cleanup(daysToKeep: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const deletedCount = await AuditLog.destroy({
      where: {
        created_at: {
          $lt: cutoffDate
        },
        // Keep critical actions longer
        action: {
          $notIn: this.getCriticalActions()
        }
      }
    });

    logger.info('Audit log cleanup completed', {
      deletedCount,
      cutoffDate: cutoffDate.toISOString()
    });

    return deletedCount;
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(
    searchParams: any,
    format: 'csv' | 'json' = 'csv'
  ): Promise<string> {
    const { logs } = await this.searchAuditLogs(searchParams, 1, 10000);

    if (format === 'csv') {
      const headers = [
        'Timestamp',
        'Entity Type',
        'Entity ID',
        'Action',
        'User',
        'IP Address',
        'User Agent'
      ];

      const rows = logs.map(log => [
        log.created_at.toISOString(),
        log.entity_type,
        log.entity_id,
        log.action,
        log.user?.username || 'System',
        log.ip_address || '',
        log.user_agent || ''
      ]);

      return [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
    }

    return JSON.stringify(logs, null, 2);
  }

  /**
   * Check if action is critical
   */
  private isCriticalAction(action: string): boolean {
    return this.getCriticalActions().includes(action);
  }

  /**
   * Get list of critical actions
   */
  private getCriticalActions(): string[] {
    return [
      'delete',
      'permission_grant',
      'permission_revoke',
      'role_assign',
      'role_revoke',
      'password_change',
      'admin_login',
      'system_shutdown',
      'database_restore',
      'security_breach',
      'emergency_override',
      'data_export'
    ];
  }

  /**
   * Log authentication events
   */
  async logAuth(
    action: 'login' | 'logout' | 'login_failed' | 'password_reset',
    userId?: string,
    metadata?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      entity_type: 'auth',
      entity_id: userId || 'anonymous',
      action,
      metadata,
      user_id: userId,
      ip_address: ipAddress,
      user_agent: userAgent
    });
  }

  /**
   * Log permission changes
   */
  async logPermissionChange(
    action: 'grant' | 'revoke' | 'modify',
    targetUserId: string,
    permissionCode: string,
    granterUserId?: string,
    metadata?: any
  ): Promise<void> {
    await this.log({
      entity_type: 'permission',
      entity_id: targetUserId,
      action: `permission_${action}`,
      new_values: { permission: permissionCode },
      metadata,
      user_id: granterUserId
    });
  }

  /**
   * Log access control events
   */
  async logAccess(
    accessPointId: string,
    userId: string,
    granted: boolean,
    method: string,
    metadata?: any
  ): Promise<void> {
    await this.log({
      entity_type: 'access',
      entity_id: accessPointId,
      action: granted ? 'access_granted' : 'access_denied',
      new_values: { method, granted },
      metadata,
      user_id: userId
    });
  }
}

export const auditService = new AuditService();
// backend/src/controllers/reportController.ts
import { Request, Response } from 'express';
import { Op, QueryTypes } from 'sequelize';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { Parser } from 'json2csv';
import sequelize from '../config/database';
import { 
  User, 
  AccessLog, 
  Community, 
  Device, 
  PaymentTransaction,
  MaintenanceRequest 
} from '../models';
import { validationResult } from 'express-validator';
import logger from '../utils/logger';
import { AppError } from '../utils/AppError';

interface ReportFilters {
  startDate?: Date;
  endDate?: Date;
  communityId?: string;
  buildingId?: string;
  deviceType?: string;
  status?: string;
  userId?: string;
}

interface ReportMetrics {
  totalAccess: number;
  uniqueUsers: number;
  deviceUptime: number;
  revenue: number;
  expenses: number;
  incidents: number;
}

export class ReportController {
  /**
   * Generate Financial Report
   * GET /api/v1/reports/financial
   */
  public static async generateFinancialReport(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
        return;
      }

      const { 
        startDate, 
        endDate, 
        communityId, 
        format = 'json' 
      } = req.query as any;

      const filters: any = {};
      
      if (startDate && endDate) {
        filters.createdAt = {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        };
      }
      
      if (communityId) {
        filters.communityId = communityId;
      }

      // Financial metrics query
      const financialMetrics = await sequelize.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as totalIncome,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as totalExpenses,
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as netBalance,
          COUNT(CASE WHEN type = 'income' THEN 1 END) as incomeTransactions,
          COUNT(CASE WHEN type = 'expense' THEN 1 END) as expenseTransactions,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingPayments,
          EXTRACT(MONTH FROM created_at) as month,
          EXTRACT(YEAR FROM created_at) as year
        FROM payment_transactions 
        WHERE ${communityId ? 'community_id = :communityId AND' : ''} 
              created_at BETWEEN :startDate AND :endDate
        GROUP BY EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at)
        ORDER BY year DESC, month DESC
      `, {
        replacements: { 
          communityId, 
          startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: endDate || new Date()
        },
        type: QueryTypes.SELECT
      });

      // Payment methods analysis
      const paymentMethodsAnalysis = await sequelize.query(`
        SELECT 
          payment_method,
          COUNT(*) as transactionCount,
          SUM(amount) as totalAmount,
          AVG(amount) as averageAmount,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successfulPayments,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedPayments
        FROM payment_transactions 
        WHERE ${communityId ? 'community_id = :communityId AND' : ''} 
              created_at BETWEEN :startDate AND :endDate
        GROUP BY payment_method
        ORDER BY totalAmount DESC
      `, {
        replacements: { communityId, startDate, endDate },
        type: QueryTypes.SELECT
      });

      // Late payments analysis
      const latePaymentsAnalysis = await sequelize.query(`
        SELECT 
          u.id as user_id,
          u.name as user_name,
          u.email as user_email,
          pt.amount,
          pt.due_date,
          pt.created_at,
          EXTRACT(DAY FROM NOW() - pt.due_date) as days_overdue
        FROM payment_transactions pt
        JOIN users u ON pt.user_id = u.id
        WHERE pt.status = 'pending' 
          AND pt.due_date < NOW()
          ${communityId ? 'AND pt.community_id = :communityId' : ''}
        ORDER BY days_overdue DESC
        LIMIT 50
      `, {
        replacements: { communityId },
        type: QueryTypes.SELECT
      });

      const reportData = {
        metadata: {
          generatedAt: new Date(),
          generatedBy: req.user?.id,
          period: { startDate, endDate },
          communityId,
          reportType: 'financial'
        },
        summary: {
          totalIncome: financialMetrics.reduce((sum: number, m: any) => sum + parseFloat(m.totalincome || 0), 0),
          totalExpenses: financialMetrics.reduce((sum: number, m: any) => sum + parseFloat(m.totalexpenses || 0), 0),
          netBalance: financialMetrics.reduce((sum: number, m: any) => sum + parseFloat(m.netbalance || 0), 0),
          pendingPayments: financialMetrics.reduce((sum: number, m: any) => sum + parseInt(m.pendingpayments || 0), 0)
        },
        monthlyBreakdown: financialMetrics,
        paymentMethods: paymentMethodsAnalysis,
        latePayments: latePaymentsAnalysis,
        insights: {
          mostUsedPaymentMethod: paymentMethodsAnalysis[0]?.payment_method || null,
          averageTransactionValue: paymentMethodsAnalysis.reduce((sum: number, m: any) => sum + parseFloat(m.averageamount || 0), 0) / paymentMethodsAnalysis.length,
          paymentSuccessRate: paymentMethodsAnalysis.reduce((sum: number, m: any) => sum + parseInt(m.successfulpayments || 0), 0) / paymentMethodsAnalysis.reduce((sum: number, m: any) => sum + parseInt(m.transactioncount || 0), 0) * 100
        }
      };

      // Handle different output formats
      if (format === 'pdf') {
        const pdfBuffer = await ReportController.generateFinancialPDF(reportData);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="financial-report-${Date.now()}.pdf"`);
        res.send(pdfBuffer);
        return;
      }

      if (format === 'excel') {
        const excelBuffer = await ReportController.generateFinancialExcel(reportData);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="financial-report-${Date.now()}.xlsx"`);
        res.send(excelBuffer);
        return;
      }

      if (format === 'csv') {
        const csvData = ReportController.generateFinancialCSV(reportData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="financial-report-${Date.now()}.csv"`);
        res.send(csvData);
        return;
      }

      // Default JSON response
      res.status(200).json({
        success: true,
        data: reportData
      });

      logger.info(`Financial report generated for community ${communityId}`, {
        userId: req.user?.id,
        communityId,
        period: { startDate, endDate },
        format
      });

    } catch (error) {
      logger.error('Error generating financial report:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating financial report',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Generate Access Report
   * GET /api/v1/reports/access
   */
  public static async generateAccessReport(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, communityId, deviceId, format = 'json' } = req.query as any;

      const filters: any = {};
      
      if (startDate && endDate) {
        filters.createdAt = {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        };
      }
      
      if (communityId) filters.communityId = communityId;
      if (deviceId) filters.deviceId = deviceId;

      // Access statistics
      const accessStats = await sequelize.query(`
        SELECT 
          COUNT(*) as totalAccess,
          COUNT(DISTINCT user_id) as uniqueUsers,
          COUNT(CASE WHEN access_granted = true THEN 1 END) as successfulAccess,
          COUNT(CASE WHEN access_granted = false THEN 1 END) as deniedAccess,
          COUNT(CASE WHEN access_method = 'qr_code' THEN 1 END) as qrAccess,
          COUNT(CASE WHEN access_method = 'facial_recognition' THEN 1 END) as facialAccess,
          COUNT(CASE WHEN access_method = 'card' THEN 1 END) as cardAccess,
          EXTRACT(HOUR FROM created_at) as hour
        FROM access_logs 
        WHERE ${communityId ? 'community_id = :communityId AND' : ''} 
              ${deviceId ? 'device_id = :deviceId AND' : ''}
              created_at BETWEEN :startDate AND :endDate
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `, {
        replacements: { 
          communityId, 
          deviceId,
          startDate: startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endDate: endDate || new Date()
        },
        type: QueryTypes.SELECT
      });

      // Top users by access frequency
      const topUsers = await sequelize.query(`
        SELECT 
          u.id,
          u.name,
          u.email,
          COUNT(al.id) as accessCount,
          MAX(al.created_at) as lastAccess,
          COUNT(CASE WHEN al.access_granted = false THEN 1 END) as deniedAttempts
        FROM access_logs al
        JOIN users u ON al.user_id = u.id
        WHERE ${communityId ? 'al.community_id = :communityId AND' : ''} 
              al.created_at BETWEEN :startDate AND :endDate
        GROUP BY u.id, u.name, u.email
        ORDER BY accessCount DESC
        LIMIT 20
      `, {
        replacements: { communityId, startDate, endDate },
        type: QueryTypes.SELECT
      });

      // Device usage analysis
      const deviceUsage = await sequelize.query(`
        SELECT 
          d.id,
          d.name,
          d.location,
          d.type,
          COUNT(al.id) as accessCount,
          AVG(CASE WHEN al.access_granted THEN 1.0 ELSE 0.0 END) as successRate,
          MAX(al.created_at) as lastUsed
        FROM devices d
        LEFT JOIN access_logs al ON d.id = al.device_id 
          AND al.created_at BETWEEN :startDate AND :endDate
        WHERE ${communityId ? 'd.community_id = :communityId' : '1=1'}
        GROUP BY d.id, d.name, d.location, d.type
        ORDER BY accessCount DESC
      `, {
        replacements: { communityId, startDate, endDate },
        type: QueryTypes.SELECT
      });

      // Security incidents
      const securityIncidents = await sequelize.query(`
        SELECT 
          al.id,
          al.created_at,
          al.access_method,
          al.failure_reason,
          u.name as user_name,
          u.email as user_email,
          d.name as device_name,
          d.location as device_location
        FROM access_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN devices d ON al.device_id = d.id
        WHERE al.access_granted = false 
          ${communityId ? 'AND al.community_id = :communityId' : ''}
          AND al.created_at BETWEEN :startDate AND :endDate
        ORDER BY al.created_at DESC
        LIMIT 100
      `, {
        replacements: { communityId, startDate, endDate },
        type: QueryTypes.SELECT
      });

      const reportData = {
        metadata: {
          generatedAt: new Date(),
          generatedBy: req.user?.id,
          period: { startDate, endDate },
          communityId,
          deviceId,
          reportType: 'access'
        },
        summary: {
          totalAccess: accessStats.reduce((sum: number, s: any) => sum + parseInt(s.totalaccess || 0), 0),
          uniqueUsers: Math.max(...accessStats.map((s: any) => parseInt(s.uniqueusers || 0))),
          successRate: accessStats.reduce((sum: number, s: any) => sum + parseInt(s.successfulaccess || 0), 0) / accessStats.reduce((sum: number, s: any) => sum + parseInt(s.totalaccess || 0), 0) * 100,
          securityIncidents: securityIncidents.length
        },
        hourlyDistribution: accessStats,
        topUsers,
        deviceUsage,
        securityIncidents: securityIncidents.slice(0, 10), // Latest 10 incidents
        insights: {
          peakHour: accessStats.reduce((max: any, current: any) => 
            parseInt(current.totalaccess) > parseInt(max.totalaccess || 0) ? current : max, {}
          ).hour,
          mostUsedMethod: ReportController.getMostUsedAccessMethod(accessStats),
          averageAccessPerUser: accessStats.reduce((sum: number, s: any) => sum + parseInt(s.totalaccess || 0), 0) / Math.max(...accessStats.map((s: any) => parseInt(s.uniqueusers || 0)))
        }
      };

      // Handle different output formats
      if (format === 'pdf') {
        const pdfBuffer = await ReportController.generateAccessPDF(reportData);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="access-report-${Date.now()}.pdf"`);
        res.send(pdfBuffer);
        return;
      }

      if (format === 'excel') {
        const excelBuffer = await ReportController.generateAccessExcel(reportData);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="access-report-${Date.now()}.xlsx"`);
        res.send(excelBuffer);
        return;
      }

      if (format === 'csv') {
        const csvData = ReportController.generateAccessCSV(reportData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="access-report-${Date.now()}.csv"`);
        res.send(csvData);
        return;
      }

      res.status(200).json({
        success: true,
        data: reportData
      });

      logger.info(`Access report generated for community ${communityId}`, {
        userId: req.user?.id,
        communityId,
        deviceId,
        period: { startDate, endDate },
        format
      });

    } catch (error) {
      logger.error('Error generating access report:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating access report',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Generate Device Report
   * GET /api/v1/reports/devices
   */
  public static async generateDeviceReport(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, communityId, deviceType, format = 'json' } = req.query as any;

      const filters: any = {};
      if (communityId) filters.communityId = communityId;
      if (deviceType) filters.type = deviceType;

      // Device health metrics
      const deviceHealth = await sequelize.query(`
        SELECT 
          d.id,
          d.name,
          d.type,
          d.location,
          d.status,
          ds.cpu_usage,
          ds.memory_usage,
          ds.disk_usage,
          ds.temperature,
          ds.uptime_hours,
          ds.signal_strength,
          ds.last_heartbeat,
          COUNT(dc.id) as commandsExecuted,
          AVG(CASE WHEN dc.status = 'success' THEN 1.0 ELSE 0.0 END) as commandSuccessRate
        FROM devices d
        LEFT JOIN device_status ds ON d.id = ds.device_id
        LEFT JOIN device_commands dc ON d.id = dc.device_id 
          AND dc.created_at BETWEEN :startDate AND :endDate
        WHERE ${communityId ? 'd.community_id = :communityId' : '1=1'}
          ${deviceType ? 'AND d.type = :deviceType' : ''}
        GROUP BY d.id, d.name, d.type, d.location, d.status, ds.cpu_usage, ds.memory_usage, 
                 ds.disk_usage, ds.temperature, ds.uptime_hours, ds.signal_strength, ds.last_heartbeat
        ORDER BY d.name
      `, {
        replacements: { 
          communityId, 
          deviceType,
          startDate: startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endDate: endDate || new Date()
        },
        type: QueryTypes.SELECT
      });

      // Device alerts and incidents
      const deviceIncidents = await sequelize.query(`
        SELECT 
          d.name as device_name,
          d.type,
          d.location,
          'High CPU Usage' as incident_type,
          ds.cpu_usage as severity,
          ds.created_at as incident_time
        FROM devices d
        JOIN device_status ds ON d.id = ds.device_id
        WHERE ds.cpu_usage > 80 
          ${communityId ? 'AND d.community_id = :communityId' : ''}
          AND ds.created_at BETWEEN :startDate AND :endDate
        
        UNION ALL
        
        SELECT 
          d.name as device_name,
          d.type,
          d.location,
          'High Memory Usage' as incident_type,
          ds.memory_usage as severity,
          ds.created_at as incident_time
        FROM devices d
        JOIN device_status ds ON d.id = ds.device_id
        WHERE ds.memory_usage > 85 
          ${communityId ? 'AND d.community_id = :communityId' : ''}
          AND ds.created_at BETWEEN :startDate AND :endDate
        
        UNION ALL
        
        SELECT 
          d.name as device_name,
          d.type,
          d.location,
          'Offline Device' as incident_type,
          0 as severity,
          ds.last_heartbeat as incident_time
        FROM devices d
        JOIN device_status ds ON d.id = ds.device_id
        WHERE ds.last_heartbeat < NOW() - INTERVAL '5 minutes'
          ${communityId ? 'AND d.community_id = :communityId' : ''}
        
        ORDER BY incident_time DESC
        LIMIT 50
      `, {
        replacements: { communityId, startDate, endDate },
        type: QueryTypes.SELECT
      });

      // Performance trends
      const performanceTrends = await sequelize.query(`
        SELECT 
          DATE(ds.created_at) as date,
          AVG(ds.cpu_usage) as avg_cpu,
          AVG(ds.memory_usage) as avg_memory,
          AVG(ds.temperature) as avg_temperature,
          AVG(ds.uptime_hours) as avg_uptime,
          COUNT(DISTINCT d.id) as active_devices
        FROM device_status ds
        JOIN devices d ON ds.device_id = d.id
        WHERE ${communityId ? 'd.community_id = :communityId AND' : ''} 
              ds.created_at BETWEEN :startDate AND :endDate
        GROUP BY DATE(ds.created_at)
        ORDER BY date
      `, {
        replacements: { communityId, startDate, endDate },
        type: QueryTypes.SELECT
      });

      const reportData = {
        metadata: {
          generatedAt: new Date(),
          generatedBy: req.user?.id,
          period: { startDate, endDate },
          communityId,
          deviceType,
          reportType: 'devices'
        },
        summary: {
          totalDevices: deviceHealth.length,
          onlineDevices: deviceHealth.filter((d: any) => d.status === 'online').length,
          offlineDevices: deviceHealth.filter((d: any) => d.status === 'offline').length,
          avgUptime: deviceHealth.reduce((sum: number, d: any) => sum + parseFloat(d.uptime_hours || 0), 0) / deviceHealth.length,
          criticalIncidents: deviceIncidents.filter((i: any) => parseFloat(i.severity) > 90).length
        },
        deviceHealth,
        incidents: deviceIncidents,
        performanceTrends,
        insights: {
          mostReliableDevice: deviceHealth.reduce((max: any, current: any) => 
            parseFloat(current.uptime_hours || 0) > parseFloat(max.uptime_hours || 0) ? current : max, {}
          ),
          deviceWithMostIssues: ReportController.getDeviceWithMostIssues(deviceIncidents),
          averageResponseTime: deviceHealth.reduce((sum: number, d: any) => sum + parseFloat(d.commandsuccessrate || 0), 0) / deviceHealth.length * 100
        }
      };

      // Handle different output formats
      if (format === 'pdf') {
        const pdfBuffer = await ReportController.generateDevicePDF(reportData);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="device-report-${Date.now()}.pdf"`);
        res.send(pdfBuffer);
        return;
      }

      if (format === 'excel') {
        const excelBuffer = await ReportController.generateDeviceExcel(reportData);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="device-report-${Date.now()}.xlsx"`);
        res.send(excelBuffer);
        return;
      }

      res.status(200).json({
        success: true,
        data: reportData
      });

      logger.info(`Device report generated for community ${communityId}`, {
        userId: req.user?.id,
        communityId,
        deviceType,
        period: { startDate, endDate },
        format
      });

    } catch (error) {
      logger.error('Error generating device report:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating device report',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Generate User Activity Report
   * GET /api/v1/reports/user-activity
   */
  public static async generateUserActivityReport(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, communityId, userId, format = 'json' } = req.query as any;

      // User activity metrics
      const userActivity = await sequelize.query(`
        SELECT 
          u.id,
          u.name,
          u.email,
          u.last_login,
          COUNT(DISTINCT al.id) as totalAccess,
          COUNT(DISTINCT DATE(al.created_at)) as activeDays,
          MAX(al.created_at) as lastAccess,
          COUNT(CASE WHEN al.access_granted = false THEN 1 END) as failedAttempts,
          STRING_AGG(DISTINCT al.access_method, ', ') as usedMethods
        FROM users u
        LEFT JOIN access_logs al ON u.id = al.user_id 
          AND al.created_at BETWEEN :startDate AND :endDate
        WHERE ${communityId ? 'u.community_id = :communityId' : '1=1'}
          ${userId ? 'AND u.id = :userId' : ''}
        GROUP BY u.id, u.name, u.email, u.last_login
        ORDER BY totalAccess DESC
        LIMIT 100
      `, {
        replacements: { 
          communityId, 
          userId,
          startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: endDate || new Date()
        },
        type: QueryTypes.SELECT
      });

      // Login patterns
      const loginPatterns = await sequelize.query(`
        SELECT 
          EXTRACT(HOUR FROM last_login) as hour,
          EXTRACT(DOW FROM last_login) as day_of_week,
          COUNT(*) as login_count
        FROM users 
        WHERE last_login BETWEEN :startDate AND :endDate
          ${communityId ? 'AND community_id = :communityId' : ''}
        GROUP BY EXTRACT(HOUR FROM last_login), EXTRACT(DOW FROM last_login)
        ORDER BY login_count DESC
      `, {
        replacements: { communityId, startDate, endDate },
        type: QueryTypes.SELECT
      });

      const reportData = {
        metadata: {
          generatedAt: new Date(),
          generatedBy: req.user?.id,
          period: { startDate, endDate },
          communityId,
          userId,
          reportType: 'user_activity'
        },
        summary: {
          totalUsers: userActivity.length,
          activeUsers: userActivity.filter((u: any) => parseInt(u.totalaccess) > 0).length,
          averageAccessPerUser: userActivity.reduce((sum: number, u: any) => sum + parseInt(u.totalaccess || 0), 0) / userActivity.length,
          mostActiveUser: userActivity[0]?.name || null
        },
        userActivity,
        loginPatterns,
        insights: {
          peakLoginHour: loginPatterns.reduce((max: any, current: any) => 
            parseInt(current.login_count) > parseInt(max.login_count || 0) ? current : max, {}
          ).hour,
          peakLoginDay: loginPatterns.reduce((max: any, current: any) => 
            parseInt(current.login_count) > parseInt(max.login_count || 0) ? current : max, {}
          ).day_of_week
        }
      };

      res.status(200).json({
        success: true,
        data: reportData
      });

      logger.info(`User activity report generated for community ${communityId}`, {
        userId: req.user?.id,
        communityId,
        period: { startDate, endDate },
        format
      });

    } catch (error) {
      logger.error('Error generating user activity report:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating user activity report',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Schedule Report Generation
   * POST /api/v1/reports/schedule
   */
  public static async scheduleReport(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
        return;
      }

      const {
        reportType,
        schedule, // 'daily', 'weekly', 'monthly'
        recipients,
        filters,
        format = 'pdf'
      } = req.body;

      // Create scheduled report entry
      const scheduledReport = {
        id: `scheduled_${Date.now()}`,
        reportType,
        schedule,
        recipients,
        filters,
        format,
        createdBy: req.user?.id,
        createdAt: new Date(),
        nextRun: ReportController.calculateNextRun(schedule),
        active: true
      };

      // Store in database (you would have a ScheduledReports model)
      // await ScheduledReport.create(scheduledReport);

      res.status(201).json({
        success: true,
        message: 'Report scheduled successfully',
        data: scheduledReport
      });

      logger.info(`Report scheduled: ${reportType}`, {
        userId: req.user?.id,
        schedule,
        recipients
      });

    } catch (error) {
      logger.error('Error scheduling report:', error);
      res.status(500).json({
        success: false,
        message: 'Error scheduling report',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get Report History
   * GET /api/v1/reports/history
   */
  public static async getReportHistory(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 20, reportType, communityId } = req.query as any;

      const filters: any = {};
      if (reportType) filters.reportType = reportType;
      if (communityId) filters.communityId = communityId;

      // This would query a ReportHistory model
      const mockHistory = [
        {
          id: '1',
          reportType: 'financial',
          generatedAt: new Date(),
          generatedBy: req.user?.id,
          format: 'pdf',
          status: 'completed',
          downloadUrl: '/api/v1/reports/download/1',
          size: '2.5 MB'
        },
        {
          id: '2',
          reportType: 'access',
          generatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          generatedBy: req.user?.id,
          format: 'excel',
          status: 'completed',
          downloadUrl: '/api/v1/reports/download/2',
          size: '1.8 MB'
        }
      ];

      res.status(200).json({
        success: true,
        data: {
          reports: mockHistory,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: mockHistory.length,
            pages: Math.ceil(mockHistory.length / parseInt(limit))
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching report history:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching report history',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Helper methods for PDF/Excel generation
  private static async generateFinancialPDF(data: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // PDF Header
        doc.fontSize(20).text('Reporte Financiero', 50, 50);
        doc.fontSize(12).text(`Generado: ${data.metadata.generatedAt.toLocaleDateString()}`, 50, 80);
        
        // Summary section
        doc.fontSize(16).text('Resumen Ejecutivo', 50, 120);
        doc.fontSize(12)
           .text(`Ingresos Totales: $${data.summary.totalIncome.toLocaleString()}`, 50, 150)
           .text(`Gastos Totales: $${data.summary.totalExpenses.toLocaleString()}`, 50, 170)
           .text(`Balance Neto: $${data.summary.netBalance.toLocaleString()}`, 50, 190)
           .text(`Pagos Pendientes: ${data.summary.pendingPayments}`, 50, 210);

        // Add more sections as needed
        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }

  private static async generateFinancialExcel(data: any): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    
    // Summary sheet
    const summarySheet = workbook.addWorksheet('Resumen');
    summarySheet.addRow(['Métrica', 'Valor']);
    summarySheet.addRow(['Ingresos Totales', data.summary.totalIncome]);
    summarySheet.addRow(['Gastos Totales', data.summary.totalExpenses]);
    summarySheet.addRow(['Balance Neto', data.summary.netBalance]);
    summarySheet.addRow(['Pagos Pendientes', data.summary.pendingPayments]);

    // Monthly breakdown sheet
    const monthlySheet = workbook.addWorksheet('Desglose Mensual');
    monthlySheet.addRow(['Año', 'Mes', 'Ingresos', 'Gastos', 'Balance']);
    data.monthlyBreakdown.forEach((month: any) => {
      monthlySheet.addRow([month.year, month.month, month.totalincome, month.totalexpenses, month.netbalance]);
    });

    return await workbook.xlsx.writeBuffer() as Buffer;
  }

  private static generateFinancialCSV(data: any): string {
    const parser = new Parser({
      fields: ['period', 'totalIncome', 'totalExpenses', 'netBalance', 'pendingPayments']
    });

    const csvData = [{
      period: `${data.metadata.period.startDate} - ${data.metadata.period.endDate}`,
      totalIncome: data.summary.totalIncome,
      totalExpenses: data.summary.totalExpenses,
      netBalance: data.summary.netBalance,
      pendingPayments: data.summary.pendingPayments
    }];

    return parser.parse(csvData);
  }

  private static async generateAccessPDF(data: any): Promise<Buffer> {
    // Similar implementation to financial PDF
    return Buffer.from('Access PDF content');
  }

  private static async generateAccessExcel(data: any): Promise<Buffer> {
    // Similar implementation to financial Excel
    return Buffer.from('Access Excel content');
  }

  private static generateAccessCSV(data: any): string {
    // Similar implementation to financial CSV
    return 'Access CSV content';
  }

  private static async generateDevicePDF(data: any): Promise<Buffer> {
    // Similar implementation for device reports
    return Buffer.from('Device PDF content');
  }

  private static async generateDeviceExcel(data: any): Promise<Buffer> {
    // Similar implementation for device reports
    return Buffer.from('Device Excel content');
  }

  // Helper utility methods
  private static getMostUsedAccessMethod(stats: any[]): string {
    let maxMethod = '';
    let maxCount = 0;

    stats.forEach(stat => {
      ['qrAccess', 'facialAccess', 'cardAccess'].forEach(method => {
        const count = parseInt(stat[method.toLowerCase()] || 0);
        if (count > maxCount) {
          maxCount = count;
          maxMethod = method.replace('Access', '').replace(/([A-Z])/g, ' $1').trim();
        }
      });
    });

    return maxMethod;
  }

  private static getDeviceWithMostIssues(incidents: any[]): any {
    const deviceIssueCount = incidents.reduce((acc, incident) => {
      acc[incident.device_name] = (acc[incident.device_name] || 0) + 1;
      return acc;
    }, {});

    const maxDevice = Object.keys(deviceIssueCount).reduce((max, device) =>
      deviceIssueCount[device] > deviceIssueCount[max] ? device : max
    );

    return { name: maxDevice, issueCount: deviceIssueCount[maxDevice] };
  }

  private static calculateNextRun(schedule: string): Date {
    const now = new Date();
    switch (schedule) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return nextMonth;
      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  }
}

export default ReportController;
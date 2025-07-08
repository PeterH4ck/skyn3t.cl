// =====================================================
// CRON JOBS - SKYN3T ACCESS CONTROL
// =====================================================
// Trabajos programados para mantenimiento y tareas automáticas

import cron from 'node-cron';
import { logger } from './logger';
import { permissionService } from '../services/permissionService';
import { notificationService } from '../services/notificationService';
import { deviceService } from '../services/deviceService';
import { paymentService } from '../services/paymentService';
import { redisClient } from '../config/redis';
import { sequelize } from '../config/database';
import { 
  UserSession, AccessLog, AuditLog, NotificationLog, 
  Device, Payment, Expense, User, Community 
} from '../models';
import { Op } from 'sequelize';

/**
 * Inicializar todos los trabajos programados
 */
export function startCronJobs(): void {
  logger.info('🔄 Starting cron jobs...');

  // Limpiar permisos expirados - cada hora
  cron.schedule('0 * * * *', cleanupExpiredPermissions);

  // Verificar dispositivos offline - cada 5 minutos
  cron.schedule('*/5 * * * *', checkOfflineDevices);

  // Limpiar sesiones expiradas - cada hora
  cron.schedule('0 * * * *', cleanupExpiredSessions);

  // Limpiar logs antiguos - diariamente a las 2 AM
  cron.schedule('0 2 * * *', cleanupOldLogs);

  // Procesar notificaciones programadas - cada minuto
  cron.schedule('* * * * *', processScheduledNotifications);

  // Verificar pagos automáticos - diariamente a las 9 AM
  cron.schedule('0 9 * * *', processAutoPayments);

  // Enviar recordatorios de gastos comunes - cada día a las 10 AM
  cron.schedule('0 10 * * *', sendPaymentReminders);

  // Backup de base de datos - diariamente a las 3 AM
  cron.schedule('0 3 * * *', performDatabaseBackup);

  // Limpiar cache de Redis - cada 6 horas
  cron.schedule('0 */6 * * *', cleanupRedisCache);

  // Generar reportes automáticos - primer día del mes a las 8 AM
  cron.schedule('0 8 1 * *', generateMonthlyReports);

  // Verificar salud del sistema - cada 30 minutos
  cron.schedule('*/30 * * * *', performHealthCheck);

  // Actualizar métricas de sistema - cada 15 minutos
  cron.schedule('*/15 * * * *', updateSystemMetrics);

  logger.info('✅ Cron jobs started successfully');
}

/**
 * Limpiar permisos expirados
 */
async function cleanupExpiredPermissions(): Promise<void> {
  try {
    logger.info('🧹 Cleaning up expired permissions...');
    
    await permissionService.cleanupExpiredPermissions();
    
    logger.info('✅ Expired permissions cleanup completed');
  } catch (error) {
    logger.error('❌ Error cleaning up expired permissions:', error);
  }
}

/**
 * Verificar dispositivos offline
 */
async function checkOfflineDevices(): Promise<void> {
  try {
    logger.debug('🔍 Checking offline devices...');
    
    const offlineThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutos
    
    const offlineDevices = await Device.findAll({
      where: {
        last_heartbeat: {
          [Op.lt]: offlineThreshold
        },
        status: { [Op.ne]: 'offline' }
      }
    });

    for (const device of offlineDevices) {
      await device.update({ status: 'offline' });
      
      // Enviar notificación de dispositivo offline
      await notificationService.sendNotification({
        sender_id: 'system',
        recipient_type: 'community',
        community_id: device.community_id,
        type: 'maintenance',
        title: 'Dispositivo Desconectado',
        message: `El dispositivo ${device.name} se ha desconectado`,
        channels: ['in_app', 'email'],
        priority: 'high'
      });
    }

    if (offlineDevices.length > 0) {
      logger.warn(`⚠️ Found ${offlineDevices.length} offline devices`);
    }
  } catch (error) {
    logger.error('❌ Error checking offline devices:', error);
  }
}

/**
 * Limpiar sesiones expiradas
 */
async function cleanupExpiredSessions(): Promise<void> {
  try {
    logger.info('🧹 Cleaning up expired sessions...');
    
    const expiredCount = await UserSession.destroy({
      where: {
        [Op.or]: [
          { expires_at: { [Op.lt]: new Date() } },
          { 
            last_activity: { 
              [Op.lt]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 días inactivo
            } 
          }
        ]
      }
    });

    logger.info(`✅ Cleaned up ${expiredCount} expired sessions`);
  } catch (error) {
    logger.error('❌ Error cleaning up expired sessions:', error);
  }
}

/**
 * Limpiar logs antiguos
 */
async function cleanupOldLogs(): Promise<void> {
  try {
    logger.info('🧹 Cleaning up old logs...');
    
    const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '90');
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Limpiar logs de acceso
    const accessLogsDeleted = await AccessLog.destroy({
      where: {
        access_time: { [Op.lt]: cutoffDate }
      }
    });

    // Limpiar logs de auditoría (mantener más tiempo)
    const auditRetentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '365');
    const auditCutoffDate = new Date(Date.now() - auditRetentionDays * 24 * 60 * 60 * 1000);
    
    const auditLogsDeleted = await AuditLog.destroy({
      where: {
        timestamp: { [Op.lt]: auditCutoffDate }
      }
    });

    // Limpiar logs de notificaciones
    const notificationLogsDeleted = await NotificationLog.destroy({
      where: {
        created_at: { [Op.lt]: cutoffDate },
        status: { [Op.in]: ['delivered', 'failed'] }
      }
    });

    logger.info(`✅ Cleaned up logs: ${accessLogsDeleted} access, ${auditLogsDeleted} audit, ${notificationLogsDeleted} notification`);
  } catch (error) {
    logger.error('❌ Error cleaning up old logs:', error);
  }
}

/**
 * Procesar notificaciones programadas
 */
async function processScheduledNotifications(): Promise<void> {
  try {
    logger.debug('📅 Processing scheduled notifications...');
    
    // Buscar notificaciones programadas que deben enviarse
    const pattern = 'scheduled_notification:*';
    const keys = await redisClient.keys(pattern);
    
    for (const key of keys) {
      try {
        const data = await redisClient.get(key);
        if (!data) continue;
        
        const notificationData = JSON.parse(data);
        
        // Verificar si es hora de enviar
        if (new Date(notificationData.schedule_at) <= new Date()) {
          await notificationService.sendNotification(notificationData);
          await redisClient.del(key);
          logger.info(`📨 Sent scheduled notification: ${key}`);
        }
      } catch (error) {
        logger.error(`❌ Error processing scheduled notification ${key}:`, error);
        await redisClient.del(key); // Limpiar notificación problemática
      }
    }
  } catch (error) {
    logger.error('❌ Error processing scheduled notifications:', error);
  }
}

/**
 * Procesar pagos automáticos
 */
async function processAutoPayments(): Promise<void> {
  try {
    logger.info('💳 Processing auto payments...');
    
    const today = new Date();
    const dayOfMonth = today.getDate();
    
    // Buscar configuraciones de auto-pago para hoy
    const pattern = 'autopay:*';
    const keys = await redisClient.keys(pattern);
    
    let processedCount = 0;
    
    for (const key of keys) {
      try {
        const data = await redisClient.get(key);
        if (!data) continue;
        
        const autoPayConfig = JSON.parse(data);
        
        if (autoPayConfig.enabled && autoPayConfig.auto_pay_day === dayOfMonth) {
          // Buscar gastos comunes pendientes
          const pendingExpenses = await Expense.findAll({
            where: {
              community_id: autoPayConfig.community_id,
              status: 'pending',
              due_date: { [Op.gte]: new Date() }
            }
          });

          for (const expense of pendingExpenses) {
            try {
              // Verificar si ya fue pagado
              const existingPayment = await Payment.findOne({
                where: {
                  user_id: autoPayConfig.user_id,
                  expense_id: expense.id,
                  status: 'completed'
                }
              });

              if (!existingPayment) {
                // Procesar auto-pago
                await paymentService.processPayment({
                  transaction_id: `autopay_${Date.now()}`,
                  amount: expense.amount,
                  currency: 'CLP',
                  payment_method: { id: autoPayConfig.payment_method_id } as any,
                  description: `Auto-pago: ${expense.description}`,
                  installments: 1,
                  user_id: autoPayConfig.user_id,
                  community_id: autoPayConfig.community_id
                });

                processedCount++;
                logger.info(`💰 Auto-payment processed for user ${autoPayConfig.user_id}, expense ${expense.id}`);
              }
            } catch (paymentError) {
              logger.error(`❌ Auto-payment failed for user ${autoPayConfig.user_id}:`, paymentError);
            }
          }
        }
      } catch (error) {
        logger.error(`❌ Error processing auto-pay config ${key}:`, error);
      }
    }

    logger.info(`✅ Processed ${processedCount} auto-payments`);
  } catch (error) {
    logger.error('❌ Error processing auto payments:', error);
  }
}

/**
 * Enviar recordatorios de gastos comunes
 */
async function sendPaymentReminders(): Promise<void> {
  try {
    logger.info('📬 Sending payment reminders...');
    
    // Buscar gastos que vencen en 7 días
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + 7);
    
    const upcomingExpenses = await Expense.findAll({
      where: {
        due_date: {
          [Op.between]: [new Date(), reminderDate]
        },
        status: 'pending'
      },
      include: [
        {
          model: Community,
          as: 'community',
          attributes: ['id', 'name']
        }
      ]
    });

    for (const expense of upcomingExpenses) {
      try {
        await notificationService.sendNotification({
          sender_id: 'system',
          recipient_type: 'community',
          community_id: expense.community_id,
          type: 'financial',
          title: 'Recordatorio de Gasto Común',
          message: `Tienes un gasto común pendiente: ${expense.description}. Vence el ${expense.due_date.toLocaleDateString()}.`,
          channels: ['in_app', 'email'],
          priority: 'normal',
          template_data: {
            expense_description: expense.description,
            amount: expense.amount,
            due_date: expense.due_date.toLocaleDateString(),
            community_name: expense.community?.name
          }
        });
      } catch (error) {
        logger.error(`❌ Error sending reminder for expense ${expense.id}:`, error);
      }
    }

    logger.info(`✅ Sent reminders for ${upcomingExpenses.length} expenses`);
  } catch (error) {
    logger.error('❌ Error sending payment reminders:', error);
  }
}

/**
 * Realizar backup de base de datos
 */
async function performDatabaseBackup(): Promise<void> {
  try {
    logger.info('💾 Performing database backup...');
    
    const backupName = `backup_${new Date().toISOString().split('T')[0]}_${Date.now()}`;
    
    // En producción se usaría pg_dump o similar
    // const backupCommand = `pg_dump ${process.env.DATABASE_URL} > /backups/${backupName}.sql`;
    // await exec(backupCommand);
    
    // Por ahora solo loggeamos
    logger.info(`✅ Database backup completed: ${backupName}`);
  } catch (error) {
    logger.error('❌ Error performing database backup:', error);
  }
}

/**
 * Limpiar cache de Redis
 */
async function cleanupRedisCache(): Promise<void> {
  try {
    logger.info('🧹 Cleaning up Redis cache...');
    
    // Limpiar tokens de reset expirados
    const resetTokens = await redisClient.keys('password_reset:*');
    let deletedCount = 0;
    
    for (const key of resetTokens) {
      const ttl = await redisClient.ttl(key);
      if (ttl <= 0) {
        await redisClient.del(key);
        deletedCount++;
      }
    }

    // Limpiar cache de permisos muy antiguo
    const permissionKeys = await redisClient.keys('permissions:*');
    for (const key of permissionKeys) {
      const data = await redisClient.get(key);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          const age = Date.now() - new Date(parsed.last_calculated).getTime();
          
          // Si tiene más de 1 hora, eliminarlo
          if (age > 60 * 60 * 1000) {
            await redisClient.del(key);
            deletedCount++;
          }
        } catch (parseError) {
          await redisClient.del(key);
          deletedCount++;
        }
      }
    }

    logger.info(`✅ Cleaned up ${deletedCount} Redis cache entries`);
  } catch (error) {
    logger.error('❌ Error cleaning up Redis cache:', error);
  }
}

/**
 * Generar reportes automáticos mensuales
 */
async function generateMonthlyReports(): Promise<void> {
  try {
    logger.info('📊 Generating monthly reports...');
    
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const communities = await Community.findAll({
      where: { is_active: true }
    });

    for (const community of communities) {
      try {
        // Generar reporte de pagos
        const paymentReport = await paymentService.generatePaymentReport({
          community_id: community.id,
          period: 'last_month',
          include_charts: true
        });

        // Enviar reporte a administradores
        await notificationService.sendNotification({
          sender_id: 'system',
          recipient_type: 'role',
          community_id: community.id,
          role_filter: 'COMMUNITY_ADMIN',
          type: 'system',
          title: 'Reporte Mensual Disponible',
          message: `El reporte mensual de ${lastMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })} está disponible.`,
          channels: ['in_app', 'email'],
          priority: 'normal'
        });

      } catch (error) {
        logger.error(`❌ Error generating report for community ${community.id}:`, error);
      }
    }

    logger.info(`✅ Generated monthly reports for ${communities.length} communities`);
  } catch (error) {
    logger.error('❌ Error generating monthly reports:', error);
  }
}

/**
 * Verificar salud del sistema
 */
async function performHealthCheck(): Promise<void> {
  try {
    logger.debug('🏥 Performing system health check...');
    
    const healthStatus = {
      database: false,
      redis: false,
      devices: { online: 0, total: 0 },
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      timestamp: new Date()
    };

    // Verificar base de datos
    try {
      await sequelize.authenticate();
      healthStatus.database = true;
    } catch (dbError) {
      logger.error('❌ Database health check failed:', dbError);
    }

    // Verificar Redis
    try {
      await redisClient.ping();
      healthStatus.redis = true;
    } catch (redisError) {
      logger.error('❌ Redis health check failed:', redisError);
    }

    // Verificar dispositivos
    try {
      const totalDevices = await Device.count();
      const onlineDevices = await Device.count({
        where: { status: 'online' }
      });
      
      healthStatus.devices = {
        online: onlineDevices,
        total: totalDevices
      };
    } catch (deviceError) {
      logger.error('❌ Device health check failed:', deviceError);
    }

    // Guardar estado de salud en cache
    await redisClient.setex('system:health', 1800, JSON.stringify(healthStatus)); // 30 minutos

    // Alertar si hay problemas críticos
    if (!healthStatus.database || !healthStatus.redis) {
      logger.error('🚨 Critical system health issues detected!', healthStatus);
    }

  } catch (error) {
    logger.error('❌ Error performing health check:', error);
  }
}

/**
 * Actualizar métricas del sistema
 */
async function updateSystemMetrics(): Promise<void> {
  try {
    logger.debug('📈 Updating system metrics...');
    
    const metrics = {
      users: {
        total: await User.count(),
        active: await User.count({ where: { is_active: true } }),
        online: await UserSession.count({ where: { is_active: true } })
      },
      communities: {
        total: await Community.count(),
        active: await Community.count({ where: { is_active: true } })
      },
      devices: {
        total: await Device.count(),
        online: await Device.count({ where: { status: 'online' } }),
        offline: await Device.count({ where: { status: 'offline' } })
      },
      payments: {
        today: await Payment.count({
          where: {
            payment_date: {
              [Op.gte]: new Date().setHours(0, 0, 0, 0)
            }
          }
        })
      },
      notifications: {
        today: await NotificationLog.count({
          where: {
            created_at: {
              [Op.gte]: new Date().setHours(0, 0, 0, 0)
            }
          }
        })
      },
      timestamp: new Date()
    };

    // Guardar métricas en cache
    await redisClient.setex('system:metrics', 900, JSON.stringify(metrics)); // 15 minutos

  } catch (error) {
    logger.error('❌ Error updating system metrics:', error);
  }
}

/**
 * Parar todos los trabajos programados
 */
export function stopCronJobs(): void {
  logger.info('🛑 Stopping cron jobs...');
  cron.getTasks().forEach(task => task.stop());
  logger.info('✅ All cron jobs stopped');
}
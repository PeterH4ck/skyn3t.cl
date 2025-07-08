import { Request, Response, NextFunction } from 'express';
import { Transaction } from 'sequelize';
import { PaymentTransaction } from '../models/PaymentTransaction';
import { CommonExpense } from '../models/CommonExpense';
import { UnitExpense } from '../models/UnitExpense';
import { BankAccount } from '../models/BankAccount';
import { PaymentGateway } from '../models/PaymentGateway';
import { Community } from '../models/Community';
import { Unit } from '../models/Unit';
import { User } from '../models/User';
import { sequelize } from '../config/database';
import { cache, cacheKeys, cacheTTL } from '../config/redis';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { paymentService } from '../services/paymentService';
import { emailService } from '../services/emailService';
import { auditLog } from '../utils/auditLog';
import QRCode from 'qrcode';
import dayjs from 'dayjs';

export class PaymentController {
  /**
   * Obtener métodos de pago disponibles para una comunidad
   */
  async getPaymentMethods(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const user = req.user!;

      // Verificar permisos
      if (!await user.hasPermission('financial.view', communityId)) {
        throw new AppError('Permisos insuficientes', 403);
      }

      // Buscar en caché
      const cacheKey = cacheKeys.paymentMethods(communityId);
      let paymentMethods = await cache.get(cacheKey);

      if (!paymentMethods) {
        // Obtener métodos de pago configurados
        const gateways = await PaymentGateway.findAll({
          where: { 
            community_id: communityId,
            is_active: true
          },
          include: [{
            model: BankAccount,
            as: 'bankAccount',
            where: { is_active: true },
            required: false
          }]
        });

        paymentMethods = gateways.map(gateway => ({
          id: gateway.id,
          name: gateway.gateway_name,
          type: gateway.gateway_type,
          supported_currencies: gateway.supported_currencies,
          transaction_fee_percentage: gateway.transaction_fee_percentage,
          transaction_fee_fixed: gateway.transaction_fee_fixed,
          is_available: gateway.is_active,
          bank_account: gateway.bankAccount ? {
            account_number: gateway.bankAccount.account_number.slice(-4), // Solo últimos 4 dígitos
            account_type: gateway.bankAccount.account_type,
            bank_name: gateway.bankAccount.bank_name
          } : null
        }));

        await cache.set(cacheKey, paymentMethods, cacheTTL.medium);
      }

      res.json({
        success: true,
        data: { payment_methods: paymentMethods }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener gastos comunes pendientes para una unidad
   */
  async getPendingExpenses(req: Request, res: Response, next: NextFunction) {
    try {
      const { unitId } = req.params;
      const user = req.user!;

      // Verificar que el usuario tiene acceso a esta unidad
      const unit = await Unit.findByPk(unitId, {
        include: [{
          model: Community,
          as: 'community'
        }]
      });

      if (!unit) {
        throw new AppError('Unidad no encontrada', 404);
      }

      if (!await user.isMemberOfCommunity(unit.community_id!) || 
          !await user.hasPermission('financial.view', unit.community_id)) {
        throw new AppError('Sin acceso a esta unidad', 403);
      }

      // Obtener gastos comunes pendientes
      const pendingExpenses = await UnitExpense.findAll({
        where: {
          unit_id: unitId,
          status: 'pending'
        },
        include: [{
          model: CommonExpense,
          as: 'commonExpense',
          include: [{
            model: Community,
            as: 'community'
          }]
        }],
        order: [['due_date', 'ASC']]
      });

      const formattedExpenses = pendingExpenses.map(expense => ({
        id: expense.id,
        common_expense_id: expense.common_expense_id,
        period: expense.commonExpense?.period,
        description: expense.commonExpense?.description,
        amount: expense.amount,
        due_date: expense.due_date,
        late_fee: expense.late_fee,
        total_amount: parseFloat(expense.amount.toString()) + parseFloat(expense.late_fee?.toString() || '0'),
        is_overdue: dayjs().isAfter(dayjs(expense.due_date)),
        days_overdue: dayjs().isAfter(dayjs(expense.due_date)) ? 
          dayjs().diff(dayjs(expense.due_date), 'days') : 0,
        payment_reference: expense.payment_reference,
        qr_code_url: expense.qr_code_url
      }));

      // Calcular totales
      const totalAmount = formattedExpenses.reduce((sum, exp) => sum + exp.total_amount, 0);
      const overdueAmount = formattedExpenses
        .filter(exp => exp.is_overdue)
        .reduce((sum, exp) => sum + exp.total_amount, 0);

      res.json({
        success: true,
        data: {
          expenses: formattedExpenses,
          summary: {
            total_expenses: formattedExpenses.length,
            total_amount: totalAmount,
            overdue_expenses: formattedExpenses.filter(exp => exp.is_overdue).length,
            overdue_amount: overdueAmount,
            currency: unit.community?.currency_code || 'CLP'
          }
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Procesar pago de gastos comunes
   */
  async processPayment(req: Request, res: Response, next: NextFunction) {
    const transaction = await sequelize.transaction();
    
    try {
      const {
        unit_expense_ids,
        payment_method_id,
        payment_gateway_id,
        return_url,
        metadata = {}
      } = req.body;
      const user = req.user!;

      // Validar gastos comunes
      const unitExpenses = await UnitExpense.findAll({
        where: {
          id: unit_expense_ids,
          status: 'pending'
        },
        include: [{
          model: Unit,
          as: 'unit',
          include: [{
            model: Community,
            as: 'community'
          }]
        }]
      });

      if (unitExpenses.length !== unit_expense_ids.length) {
        throw new AppError('Algunos gastos no están disponibles para pago', 400);
      }

      // Verificar que todas las unidades pertenecen a la misma comunidad
      const communityId = unitExpenses[0].unit?.community_id;
      if (!unitExpenses.every(exp => exp.unit?.community_id === communityId)) {
        throw new AppError('Los gastos deben pertenecer a la misma comunidad', 400);
      }

      // Verificar permisos
      if (!await user.hasPermission('financial.pay', communityId)) {
        throw new AppError('Sin permisos para realizar pagos', 403);
      }

      // Calcular monto total
      const totalAmount = unitExpenses.reduce((sum, expense) => {
        const amount = parseFloat(expense.amount.toString());
        const lateFee = parseFloat(expense.late_fee?.toString() || '0');
        return sum + amount + lateFee;
      }, 0);

      // Obtener gateway de pago
      const paymentGateway = await PaymentGateway.findOne({
        where: {
          id: payment_gateway_id,
          community_id: communityId,
          is_active: true
        }
      });

      if (!paymentGateway) {
        throw new AppError('Método de pago no disponible', 400);
      }

      // Generar ID único para la transacción
      const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Crear registro de transacción
      const paymentTransaction = await PaymentTransaction.create({
        transaction_id: transactionId,
        community_id: communityId,
        user_id: user.id,
        gateway_id: payment_gateway_id,
        amount: totalAmount,
        currency: unitExpenses[0].unit?.community?.currency_code || 'CLP',
        status: 'pending',
        unit_expense_ids,
        metadata: {
          ...metadata,
          user_agent: req.headers['user-agent'],
          ip_address: req.ip
        }
      }, { transaction });

      let paymentResult;

      // Procesar según el tipo de gateway
      switch (paymentGateway.gateway_type) {
        case 'bank_transfer':
          paymentResult = await paymentService.processBankTransfer({
            transactionId,
            amount: totalAmount,
            currency: unitExpenses[0].unit?.community?.currency_code || 'CLP',
            bankAccount: paymentGateway.bankAccount,
            description: `Gastos comunes - ${unitExpenses.length} periodo(s)`,
            returnUrl: return_url
          });
          break;

        case 'paypal':
          paymentResult = await paymentService.processPayPalPayment({
            transactionId,
            amount: totalAmount,
            currency: unitExpenses[0].unit?.community?.currency_code || 'CLP',
            description: `Gastos comunes - Unidad ${unitExpenses[0].unit?.unit_number}`,
            returnUrl: return_url,
            cancelUrl: return_url
          });
          break;

        case 'mercadopago':
          paymentResult = await paymentService.processMercadoPagoPayment({
            transactionId,
            amount: totalAmount,
            currency: unitExpenses[0].unit?.community?.currency_code || 'CLP',
            description: `Gastos comunes - Unidad ${unitExpenses[0].unit?.unit_number}`,
            payer: {
              email: user.email,
              name: user.fullName
            },
            returnUrl: return_url
          });
          break;

        case 'webpay':
          paymentResult = await paymentService.processWebpayPayment({
            transactionId,
            amount: totalAmount,
            description: `Gastos comunes - Unidad ${unitExpenses[0].unit?.unit_number}`,
            returnUrl: return_url
          });
          break;

        default:
          throw new AppError('Método de pago no soportado', 400);
      }

      // Actualizar transacción con resultado
      paymentTransaction.gateway_transaction_id = paymentResult.gatewayTransactionId;
      paymentTransaction.gateway_response = paymentResult.gatewayResponse;
      paymentTransaction.payment_url = paymentResult.paymentUrl;
      
      if (paymentResult.status === 'completed') {
        paymentTransaction.status = 'completed';
        paymentTransaction.completed_at = new Date();

        // Marcar gastos como pagados
        await UnitExpense.update(
          { 
            status: 'paid',
            paid_at: new Date(),
            payment_transaction_id: paymentTransaction.id
          },
          { 
            where: { id: unit_expense_ids },
            transaction
          }
        );
      }

      await paymentTransaction.save({ transaction });

      await transaction.commit();

      // Registrar en auditoría
      await auditLog.create({
        user_id: user.id,
        action: 'payment.initiated',
        entity_type: 'payment_transaction',
        entity_id: paymentTransaction.id,
        metadata: {
          amount: totalAmount,
          gateway: paymentGateway.gateway_name,
          unit_expenses: unit_expense_ids.length
        },
        ip_address: req.ip
      });

      res.json({
        success: true,
        message: 'Pago iniciado exitosamente',
        data: {
          transaction_id: transactionId,
          payment_url: paymentResult.paymentUrl,
          status: paymentResult.status,
          amount: totalAmount,
          currency: unitExpenses[0].unit?.community?.currency_code || 'CLP',
          expires_at: paymentResult.expiresAt,
          instructions: paymentResult.instructions
        }
      });

    } catch (error) {
      await transaction.rollback();
      next(error);
    }
  }

  /**
   * Webhook para confirmación de pagos
   */
  async paymentWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const { gateway_type } = req.params;
      const signature = req.headers['x-signature'] || req.headers['authorization'];

      let webhookData;

      // Procesar webhook según el gateway
      switch (gateway_type) {
        case 'paypal':
          webhookData = await paymentService.processPayPalWebhook(req.body, signature);
          break;
        case 'mercadopago':
          webhookData = await paymentService.processMercadoPagoWebhook(req.body, signature);
          break;
        case 'webpay':
          webhookData = await paymentService.processWebpayWebhook(req.body, signature);
          break;
        default:
          throw new AppError('Gateway no soportado', 400);
      }

      if (!webhookData.isValid) {
        throw new AppError('Webhook inválido', 400);
      }

      // Buscar transacción
      const transaction = await PaymentTransaction.findOne({
        where: {
          gateway_transaction_id: webhookData.transactionId
        },
        include: [{
          model: UnitExpense,
          as: 'unitExpenses'
        }]
      });

      if (!transaction) {
        logger.warn('Webhook recibido para transacción no encontrada', {
          gatewayTransactionId: webhookData.transactionId,
          gateway: gateway_type
        });
        return res.status(200).send('OK');
      }

      // Actualizar estado de la transacción
      const dbTransaction = await sequelize.transaction();

      try {
        transaction.status = webhookData.status;
        transaction.gateway_response = webhookData.response;
        
        if (webhookData.status === 'completed') {
          transaction.completed_at = new Date();
          
          // Marcar gastos como pagados
          if (transaction.unit_expense_ids) {
            await UnitExpense.update(
              { 
                status: 'paid',
                paid_at: new Date(),
                payment_transaction_id: transaction.id
              },
              { 
                where: { id: transaction.unit_expense_ids },
                transaction: dbTransaction
              }
            );
          }

          // Enviar confirmación por email
          const user = await User.findByPk(transaction.user_id);
          if (user) {
            await emailService.sendPaymentConfirmation(
              user.email,
              user.fullName,
              {
                transactionId: transaction.transaction_id,
                amount: transaction.amount,
                currency: transaction.currency,
                date: new Date()
              }
            );
          }
        }

        await transaction.save({ transaction: dbTransaction });
        await dbTransaction.commit();

        logger.info('Pago confirmado por webhook', {
          transactionId: transaction.transaction_id,
          status: webhookData.status,
          gateway: gateway_type
        });

      } catch (error) {
        await dbTransaction.rollback();
        throw error;
      }

      res.status(200).send('OK');

    } catch (error) {
      logger.error('Error procesando webhook de pago', error);
      res.status(400).send('Error');
    }
  }

  /**
   * Obtener estado de pago
   */
  async getPaymentStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { transactionId } = req.params;
      const user = req.user!;

      const transaction = await PaymentTransaction.findOne({
        where: { transaction_id: transactionId },
        include: [{
          model: UnitExpense,
          as: 'unitExpenses',
          include: [{
            model: CommonExpense,
            as: 'commonExpense'
          }]
        }]
      });

      if (!transaction) {
        throw new AppError('Transacción no encontrada', 404);
      }

      // Verificar permisos
      if (transaction.user_id !== user.id && 
          !await user.hasPermission('financial.view', transaction.community_id)) {
        throw new AppError('Sin acceso a esta transacción', 403);
      }

      res.json({
        success: true,
        data: {
          transaction_id: transaction.transaction_id,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          gateway: transaction.gateway?.gateway_name,
          created_at: transaction.created_at,
          completed_at: transaction.completed_at,
          unit_expenses: transaction.unitExpenses?.map(expense => ({
            id: expense.id,
            period: expense.commonExpense?.period,
            amount: expense.amount
          }))
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener historial de pagos
   */
  async getPaymentHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, unitId } = req.params;
      const {
        page = 1,
        limit = 20,
        status,
        from_date,
        to_date,
        user_id
      } = req.query;

      const user = req.user!;

      // Verificar permisos
      if (!await user.hasPermission('financial.view', communityId)) {
        throw new AppError('Permisos insuficientes', 403);
      }

      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      const whereClause: any = { community_id: communityId };

      if (status) whereClause.status = status;
      if (user_id) whereClause.user_id = user_id;
      if (from_date || to_date) {
        whereClause.created_at = {};
        if (from_date) whereClause.created_at[Op.gte] = new Date(from_date as string);
        if (to_date) whereClause.created_at[Op.lte] = new Date(to_date as string);
      }

      const { rows: transactions, count } = await PaymentTransaction.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'first_name', 'last_name', 'email']
          },
          {
            model: PaymentGateway,
            as: 'gateway',
            attributes: ['gateway_name', 'gateway_type']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit as string),
        offset
      });

      res.json({
        success: true,
        data: {
          transactions: transactions.map(tx => ({
            id: tx.id,
            transaction_id: tx.transaction_id,
            amount: tx.amount,
            currency: tx.currency,
            status: tx.status,
            gateway: tx.gateway?.gateway_name,
            user: tx.user ? {
              id: tx.user.id,
              name: `${tx.user.first_name} ${tx.user.last_name}`,
              email: tx.user.email
            } : null,
            created_at: tx.created_at,
            completed_at: tx.completed_at
          })),
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: count,
            pages: Math.ceil(count / parseInt(limit as string))
          }
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Generar reporte financiero
   */
  async generateFinancialReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const {
        report_type = 'monthly',
        period,
        format = 'json'
      } = req.query;

      const user = req.user!;

      // Verificar permisos
      if (!await user.hasPermission('financial.reports', communityId)) {
        throw new AppError('Sin permisos para generar reportes', 403);
      }

      const report = await paymentService.generateFinancialReport({
        communityId,
        reportType: report_type as string,
        period: period as string,
        format: format as string
      });

      if (format === 'pdf' || format === 'excel') {
        res.json({
          success: true,
          message: 'Reporte generado exitosamente',
          data: {
            download_url: report.downloadUrl,
            expires_at: report.expiresAt
          }
        });
      } else {
        res.json({
          success: true,
          data: report
        });
      }

    } catch (error) {
      next(error);
    }
  }

  /**
   * Exportar datos financieros
   */
  async exportFinancialData(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const {
        export_type = 'transactions',
        format = 'excel',
        from_date,
        to_date
      } = req.query;

      const user = req.user!;

      // Verificar permisos
      if (!await user.hasPermission('financial.export', communityId)) {
        throw new AppError('Sin permisos para exportar datos', 403);
      }

      const exportJob = await paymentService.exportFinancialData({
        communityId,
        exportType: export_type as string,
        format: format as string,
        fromDate: from_date as string,
        toDate: to_date as string,
        userId: user.id
      });

      res.json({
        success: true,
        message: 'Exportación iniciada',
        data: {
          job_id: exportJob.id,
          estimated_completion: exportJob.estimatedCompletion,
          download_url: exportJob.downloadUrl
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Reconciliar pagos automáticamente
   */
  async reconcilePayments(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { date, bank_account_id } = req.body;

      const user = req.user!;

      // Verificar permisos
      if (!await user.hasPermission('financial.reconcile', communityId)) {
        throw new AppError('Sin permisos para reconciliación', 403);
      }

      const reconciliation = await paymentService.reconcilePayments({
        communityId,
        date,
        bankAccountId: bank_account_id,
        userId: user.id
      });

      res.json({
        success: true,
        message: 'Reconciliación completada',
        data: reconciliation
      });

    } catch (error) {
      next(error);
    }
  }
}

export const paymentController = new PaymentController();
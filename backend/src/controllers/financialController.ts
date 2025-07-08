import { Request, Response, NextFunction } from 'express';
import { CommonExpense } from '../models/CommonExpense';
import { UnitExpense } from '../models/UnitExpense';
import { PaymentTransaction } from '../models/PaymentTransaction';
import { BankAccount } from '../models/BankAccount';
import { BankConfiguration } from '../models/BankConfiguration';
import { PaymentGateway } from '../models/PaymentGateway';
import { Community } from '../models/Community';
import { Unit } from '../models/Unit';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { paymentService } from '../services/paymentService';
import { bankService } from '../services/bankService';
import { emailService } from '../services/emailService';
import { pdfService } from '../services/pdfService';
import { ocrService } from '../services/ocrService';
import { cache, cacheKeys, cacheTTL } from '../config/redis';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { Op, fn, col, literal } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';

export class FinancialController {
  /**
   * Crear gastos comunes para una comunidad
   */
  async createCommonExpenses(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        community_id,
        period_month,
        period_year,
        due_date,
        expenses = [], // Array de gastos individuales
        distribution_method = 'equal', // equal, by_area, by_units, custom
        late_fee_percentage = 2.0,
        discount_percentage = 0,
        early_payment_discount_days = 0,
        notes
      } = req.body;

      // Verificar permisos
      if (!req.user?.hasPermission('financial.expenses.create', community_id)) {
        throw new AppError('Sin permisos para crear gastos comunes', 403);
      }

      // Verificar que la comunidad existe
      const community = await Community.findByPk(community_id, {
        include: [
          {
            model: Unit,
            as: 'units',
            where: { is_occupied: true },
            include: [
              {
                model: User,
                as: 'owner'
              },
              {
                model: User,
                as: 'tenant'
              }
            ]
          }
        ]
      });

      if (!community) {
        throw new AppError('Comunidad no encontrada', 404);
      }

      // Verificar que no existan gastos para el mismo período
      const existingExpenses = await CommonExpense.findOne({
        where: {
          community_id,
          period_month,
          period_year
        }
      });

      if (existingExpenses) {
        throw new AppError('Ya existen gastos comunes para este período', 409);
      }

      // Calcular total de gastos
      const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

      // Crear gasto común principal
      const commonExpense = await CommonExpense.create({
        community_id,
        period_month,
        period_year,
        total_amount: totalExpenses,
        due_date: new Date(due_date),
        distribution_method,
        late_fee_percentage,
        discount_percentage,
        early_payment_discount_days,
        notes,
        status: 'draft',
        created_by: req.user!.id
      });

      // Calcular distribución por unidad
      const unitExpenses = await this.calculateUnitDistribution(
        community.units,
        totalExpenses,
        distribution_method,
        expenses
      );

      // Crear gastos por unidad
      const createdUnitExpenses = await Promise.all(
        unitExpenses.map(async (unitExpense) => {
          return await UnitExpense.create({
            common_expense_id: commonExpense.id,
            unit_id: unitExpense.unit_id,
            base_amount: unitExpense.base_amount,
            additional_charges: unitExpense.additional_charges || 0,
            discounts: unitExpense.discounts || 0,
            total_amount: unitExpense.total_amount,
            status: 'pending',
            expense_details: unitExpense.details || expenses
          });
        })
      );

      // Actualizar estado del gasto común
      commonExpense.status = 'issued';
      commonExpense.issued_at = new Date();
      await commonExpense.save();

      // Generar PDFs para cada unidad
      const pdfUrls = await Promise.all(
        createdUnitExpenses.map(async (unitExpense) => {
          const unit = community.units.find(u => u.id === unitExpense.unit_id);
          if (unit) {
            const pdfUrl = await pdfService.generateExpensePDF({
              commonExpense,
              unitExpense,
              unit,
              community
            });
            return { unit_id: unit.id, pdf_url: pdfUrl };
          }
          return null;
        })
      );

      // Enviar notificaciones por email
      await this.sendExpenseNotifications(community, createdUnitExpenses, pdfUrls.filter(p => p));

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'financial.expenses_created',
        entity_type: 'common_expense',
        entity_id: commonExpense.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        metadata: {
          community_id,
          period: `${period_year}-${period_month}`,
          total_amount: totalExpenses,
          unit_count: createdUnitExpenses.length
        }
      });

      res.status(201).json({
        success: true,
        message: 'Gastos comunes creados exitosamente',
        data: {
          common_expense: commonExpense,
          unit_expenses: createdUnitExpenses,
          pdf_urls: pdfUrls.filter(p => p)
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Listar gastos comunes con filtros
   */
  async getCommonExpenses(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        page = 1,
        limit = 20,
        community_id,
        period_year,
        period_month,
        status,
        sort = 'created_at',
        order = 'desc'
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      const whereConditions: any = {};

      if (community_id) whereConditions.community_id = community_id;
      if (period_year) whereConditions.period_year = period_year;
      if (period_month) whereConditions.period_month = period_month;
      if (status) whereConditions.status = status;

      // Verificar permisos multi-tenant
      if (!req.user?.hasPermission('financial.expenses.view.all')) {
        const userCommunities = await req.user!.getCommunities();
        const communityIds = userCommunities.map(c => c.id);
        whereConditions.community_id = { [Op.in]: communityIds };
      }

      const { count, rows: expenses } = await CommonExpense.findAndCountAll({
        where: whereConditions,
        include: [
          {
            model: Community,
            as: 'community',
            attributes: ['id', 'name', 'code']
          },
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'username', 'first_name', 'last_name']
          }
        ],
        order: [[sort as string, order as string]],
        limit: Number(limit),
        offset
      });

      // Obtener estadísticas de pago para cada gasto
      const expensesWithStats = await Promise.all(
        expenses.map(async (expense) => {
          const stats = await this.getExpensePaymentStats(expense.id);
          return {
            ...expense.toJSON(),
            payment_stats: stats
          };
        })
      );

      res.json({
        success: true,
        data: {
          expenses: expensesWithStats,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: count,
            pages: Math.ceil(count / Number(limit)),
            has_next: offset + Number(limit) < count,
            has_prev: Number(page) > 1
          }
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Procesar pago de gasto común
   */
  async processPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        unit_expense_id,
        payment_method, // bank_transfer, credit_card, paypal, cash
        amount,
        gateway_id,
        payment_data = {}, // Datos específicos del método de pago
        receipt_file,
        notes
      } = req.body;

      // Verificar que el gasto de unidad existe
      const unitExpense = await UnitExpense.findByPk(unit_expense_id, {
        include: [
          {
            model: CommonExpense,
            as: 'commonExpense',
            include: [
              {
                model: Community,
                as: 'community'
              }
            ]
          },
          {
            model: Unit,
            as: 'unit',
            include: [
              {
                model: User,
                as: 'owner'
              }
            ]
          }
        ]
      });

      if (!unitExpense) {
        throw new AppError('Gasto de unidad no encontrado', 404);
      }

      // Verificar permisos (propietario o administrador)
      const hasPermission = req.user?.hasPermission('financial.payments.create', unitExpense.commonExpense.community_id) ||
                           unitExpense.unit.owner?.id === req.user?.id;

      if (!hasPermission) {
        throw new AppError('Sin permisos para realizar este pago', 403);
      }

      // Verificar que el monto no exceda lo pendiente
      const pendingAmount = unitExpense.total_amount - (unitExpense.paid_amount || 0);
      if (amount > pendingAmount) {
        throw new AppError('El monto excede lo pendiente de pago', 400);
      }

      // Verificar fecha de vencimiento para descuentos/recargos
      const now = new Date();
      const dueDate = new Date(unitExpense.commonExpense.due_date);
      let finalAmount = amount;
      let appliedFees = [];

      // Aplicar descuento por pago anticipado
      if (unitExpense.commonExpense.early_payment_discount_days > 0) {
        const discountDeadline = new Date(dueDate);
        discountDeadline.setDate(discountDeadline.getDate() - unitExpense.commonExpense.early_payment_discount_days);
        
        if (now <= discountDeadline && unitExpense.commonExpense.discount_percentage > 0) {
          const discount = (amount * unitExpense.commonExpense.discount_percentage) / 100;
          finalAmount = amount - discount;
          appliedFees.push({
            type: 'early_payment_discount',
            percentage: unitExpense.commonExpense.discount_percentage,
            amount: -discount
          });
        }
      }

      // Aplicar recargo por mora
      if (now > dueDate && unitExpense.commonExpense.late_fee_percentage > 0) {
        const daysLate = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const lateFee = (amount * unitExpense.commonExpense.late_fee_percentage) / 100;
        finalAmount = amount + lateFee;
        appliedFees.push({
          type: 'late_fee',
          percentage: unitExpense.commonExpense.late_fee_percentage,
          amount: lateFee,
          days_late: daysLate
        });
      }

      // Crear transacción de pago
      const paymentTransaction = await PaymentTransaction.create({
        unit_expense_id,
        user_id: req.user!.id,
        payment_method,
        gateway_id,
        amount: finalAmount,
        original_amount: amount,
        currency: 'CLP',
        status: 'pending',
        payment_data,
        receipt_file,
        notes,
        applied_fees: appliedFees,
        community_id: unitExpense.commonExpense.community_id
      });

      let processingResult = null;

      // Procesar según método de pago
      switch (payment_method) {
        case 'bank_transfer':
          processingResult = await this.processBankTransfer(paymentTransaction, payment_data);
          break;
        
        case 'credit_card':
          processingResult = await this.processCreditCard(paymentTransaction, payment_data);
          break;
        
        case 'paypal':
          processingResult = await this.processPayPal(paymentTransaction, payment_data);
          break;
        
        case 'cash':
          // Pago en efectivo requiere aprobación manual
          paymentTransaction.status = 'pending_approval';
          await paymentTransaction.save();
          processingResult = { status: 'pending_approval', message: 'Pago en efectivo pendiente de aprobación' };
          break;
        
        default:
          throw new AppError('Método de pago no soportado', 400);
      }

      // Si el pago fue exitoso, actualizar el gasto de unidad
      if (processingResult.status === 'completed') {
        await this.updateUnitExpensePayment(unitExpense, finalAmount);
      }

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'financial.payment_processed',
        entity_type: 'payment_transaction',
        entity_id: paymentTransaction.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        metadata: {
          unit_expense_id,
          payment_method,
          amount: finalAmount,
          status: processingResult.status
        }
      });

      res.json({
        success: true,
        message: 'Pago procesado exitosamente',
        data: {
          transaction: paymentTransaction,
          processing_result: processingResult,
          updated_unit_expense: processingResult.status === 'completed' ? 
            await UnitExpense.findByPk(unit_expense_id) : null
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Procesar OCR de boletas/comprobantes
   */
  async processReceiptOCR(req: Request, res: Response, next: NextFunction) {
    try {
      const { receipt_file, community_id } = req.body;

      // Verificar permisos
      if (!req.user?.hasPermission('financial.ocr.process', community_id)) {
        throw new AppError('Sin permisos para procesar OCR', 403);
      }

      if (!receipt_file) {
        throw new AppError('Archivo de boleta requerido', 400);
      }

      // Procesar OCR
      const ocrResult = await ocrService.processReceipt(receipt_file);

      // Extraer información relevante
      const extractedData = {
        vendor_name: ocrResult.vendor || null,
        total_amount: ocrResult.total || null,
        date: ocrResult.date || null,
        invoice_number: ocrResult.invoice_number || null,
        rut: ocrResult.rut || null,
        items: ocrResult.items || [],
        confidence_score: ocrResult.confidence || 0
      };

      // Guardar resultado para auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'financial.ocr_processed',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        metadata: {
          community_id,
          receipt_file,
          extracted_data: extractedData,
          confidence_score: extractedData.confidence_score
        }
      });

      res.json({
        success: true,
        message: 'OCR procesado exitosamente',
        data: {
          extracted_data: extractedData,
          original_file: receipt_file,
          processing_time: ocrResult.processing_time || 0
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener resumen financiero de una comunidad
   */
  async getFinancialSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { community_id, year, month } = req.query;

      // Verificar permisos
      if (!req.user?.hasPermission('financial.summary.view', community_id as string)) {
        throw new AppError('Sin permisos para ver resumen financiero', 403);
      }

      const whereConditions: any = { community_id };
      if (year) whereConditions.period_year = year;
      if (month) whereConditions.period_month = month;

      // Obtener gastos comunes del período
      const commonExpenses = await CommonExpense.findAll({
        where: whereConditions,
        include: [
          {
            model: UnitExpense,
            as: 'unitExpenses'
          }
        ]
      });

      // Calcular totales
      let totalIssued = 0;
      let totalPaid = 0;
      let totalPending = 0;
      let totalOverdue = 0;

      for (const expense of commonExpenses) {
        for (const unitExpense of expense.unitExpenses) {
          totalIssued += unitExpense.total_amount;
          totalPaid += unitExpense.paid_amount || 0;
          
          const pending = unitExpense.total_amount - (unitExpense.paid_amount || 0);
          totalPending += pending;
          
          // Verificar si está vencido
          if (pending > 0 && new Date() > new Date(expense.due_date)) {
            totalOverdue += pending;
          }
        }
      }

      // Obtener transacciones del período
      const transactions = await PaymentTransaction.findAll({
        where: {
          community_id,
          created_at: {
            [Op.gte]: new Date(Number(year), Number(month) - 1, 1),
            [Op.lt]: new Date(Number(year), Number(month), 1)
          }
        }
      });

      // Agrupar por método de pago
      const paymentsByMethod = transactions.reduce((acc, transaction) => {
        const method = transaction.payment_method;
        if (!acc[method]) {
          acc[method] = { count: 0, total: 0 };
        }
        acc[method].count += 1;
        acc[method].total += transaction.amount;
        return acc;
      }, {} as any);

      // Calcular tasas
      const collectionRate = totalIssued > 0 ? (totalPaid / totalIssued) * 100 : 0;
      const delinquencyRate = totalIssued > 0 ? (totalOverdue / totalIssued) * 100 : 0;

      res.json({
        success: true,
        data: {
          period: { year, month },
          summary: {
            total_issued: totalIssued,
            total_paid: totalPaid,
            total_pending: totalPending,
            total_overdue: totalOverdue,
            collection_rate: Math.round(collectionRate * 100) / 100,
            delinquency_rate: Math.round(delinquencyRate * 100) / 100
          },
          payments_by_method: paymentsByMethod,
          expenses_count: commonExpenses.length,
          transactions_count: transactions.length
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
      const {
        community_id,
        report_type, // summary, detailed, delinquency
        format = 'pdf', // pdf, excel, csv
        period_from,
        period_to,
        include_charts = true
      } = req.body;

      // Verificar permisos
      if (!req.user?.hasPermission('financial.reports.generate', community_id)) {
        throw new AppError('Sin permisos para generar reportes', 403);
      }

      // Obtener datos para el reporte
      const reportData = await this.gatherReportData(
        community_id,
        report_type,
        period_from,
        period_to
      );

      // Generar reporte según formato
      let reportUrl: string;
      
      switch (format) {
        case 'pdf':
          reportUrl = await pdfService.generateFinancialReport({
            type: report_type,
            data: reportData,
            include_charts,
            generated_by: req.user!.fullName,
            generated_at: new Date()
          });
          break;
        
        case 'excel':
          reportUrl = await excelService.generateFinancialReport({
            type: report_type,
            data: reportData
          });
          break;
        
        case 'csv':
          reportUrl = await csvService.generateFinancialReport({
            type: report_type,
            data: reportData
          });
          break;
        
        default:
          throw new AppError('Formato de reporte no soportado', 400);
      }

      // Registrar generación de reporte
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'financial.report_generated',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        metadata: {
          community_id,
          report_type,
          format,
          period_from,
          period_to,
          report_url: reportUrl
        }
      });

      res.json({
        success: true,
        message: 'Reporte generado exitosamente',
        data: {
          report_url: reportUrl,
          report_type,
          format,
          generated_at: new Date(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 horas
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Configurar métodos de pago para una comunidad
   */
  async configurePaymentMethods(req: Request, res: Response, next: NextFunction) {
    try {
      const { community_id } = req.params;
      const { payment_methods = [] } = req.body;

      // Verificar permisos
      if (!req.user?.hasPermission('financial.config.update', community_id)) {
        throw new AppError('Sin permisos para configurar métodos de pago', 403);
      }

      // Validar y activar cada método de pago
      const configuredMethods = [];
      
      for (const method of payment_methods) {
        const { type, gateway_id, is_enabled, config } = method;
        
        if (is_enabled) {
          // Validar configuración según el tipo
          await this.validatePaymentMethodConfig(type, config);
          
          // Guardar configuración
          const paymentConfig = await PaymentGateway.upsert({
            community_id,
            gateway_type: type,
            gateway_id,
            is_enabled,
            config: config
          });
          
          configuredMethods.push(paymentConfig);
        }
      }

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'financial.payment_methods_configured',
        entity_type: 'community',
        entity_id: community_id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        metadata: {
          configured_methods: configuredMethods.map(m => m.gateway_type)
        }
      });

      res.json({
        success: true,
        message: 'Métodos de pago configurados exitosamente',
        data: {
          configured_methods: configuredMethods
        }
      });

    } catch (error) {
      next(error);
    }
  }

  // Métodos privados auxiliares

  private async calculateUnitDistribution(
    units: any[],
    totalAmount: number,
    distributionMethod: string,
    expenses: any[]
  ) {
    const distribution = [];
    
    switch (distributionMethod) {
      case 'equal':
        const amountPerUnit = totalAmount / units.length;
        units.forEach(unit => {
          distribution.push({
            unit_id: unit.id,
            base_amount: amountPerUnit,
            total_amount: amountPerUnit,
            details: expenses
          });
        });
        break;
      
      case 'by_area':
        const totalArea = units.reduce((sum, unit) => sum + (unit.area_sqm || 0), 0);
        units.forEach(unit => {
          const unitAmount = (unit.area_sqm || 0) / totalArea * totalAmount;
          distribution.push({
            unit_id: unit.id,
            base_amount: unitAmount,
            total_amount: unitAmount,
            details: expenses
          });
        });
        break;
      
      // Agregar más métodos de distribución según necesidad
      default:
        throw new AppError('Método de distribución no soportado', 400);
    }
    
    return distribution;
  }

  private async getExpensePaymentStats(expenseId: string) {
    const unitExpenses = await UnitExpense.findAll({
      where: { common_expense_id: expenseId }
    });

    const totalUnits = unitExpenses.length;
    const totalAmount = unitExpenses.reduce((sum, ue) => sum + ue.total_amount, 0);
    const paidAmount = unitExpenses.reduce((sum, ue) => sum + (ue.paid_amount || 0), 0);
    const paidUnits = unitExpenses.filter(ue => ue.status === 'paid').length;

    return {
      total_units: totalUnits,
      paid_units: paidUnits,
      pending_units: totalUnits - paidUnits,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      pending_amount: totalAmount - paidAmount,
      collection_rate: totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0
    };
  }

  private async processBankTransfer(transaction: PaymentTransaction, paymentData: any) {
    // Implementar integración con bancos chilenos
    try {
      const result = await bankService.processTransfer(transaction, paymentData);
      
      transaction.status = result.status;
      transaction.gateway_response = result;
      transaction.processed_at = new Date();
      await transaction.save();
      
      return result;
    } catch (error) {
      transaction.status = 'failed';
      transaction.error_message = error.message;
      await transaction.save();
      throw error;
    }
  }

  private async processCreditCard(transaction: PaymentTransaction, paymentData: any) {
    // Implementar procesamiento de tarjetas de crédito
    try {
      const result = await paymentService.processCreditCard(transaction, paymentData);
      
      transaction.status = result.status;
      transaction.gateway_response = result;
      transaction.processed_at = new Date();
      await transaction.save();
      
      return result;
    } catch (error) {
      transaction.status = 'failed';
      transaction.error_message = error.message;
      await transaction.save();
      throw error;
    }
  }

  private async processPayPal(transaction: PaymentTransaction, paymentData: any) {
    // Implementar integración con PayPal
    try {
      const result = await paymentService.processPayPal(transaction, paymentData);
      
      transaction.status = result.status;
      transaction.gateway_response = result;
      transaction.processed_at = new Date();
      await transaction.save();
      
      return result;
    } catch (error) {
      transaction.status = 'failed';
      transaction.error_message = error.message;
      await transaction.save();
      throw error;
    }
  }

  private async updateUnitExpensePayment(unitExpense: UnitExpense, amount: number) {
    const currentPaid = unitExpense.paid_amount || 0;
    const newPaidAmount = currentPaid + amount;
    
    unitExpense.paid_amount = newPaidAmount;
    
    if (newPaidAmount >= unitExpense.total_amount) {
      unitExpense.status = 'paid';
      unitExpense.paid_at = new Date();
    } else {
      unitExpense.status = 'partial';
    }
    
    await unitExpense.save();
  }

  private async sendExpenseNotifications(
    community: Community, 
    unitExpenses: UnitExpense[], 
    pdfUrls: any[]
  ) {
    // Enviar emails con PDFs de gastos comunes
    for (const unitExpense of unitExpenses) {
      const unit = community.units.find(u => u.id === unitExpense.unit_id);
      const pdfUrl = pdfUrls.find(p => p.unit_id === unitExpense.unit_id);
      
      if (unit && (unit.owner || unit.tenant)) {
        const recipient = unit.owner || unit.tenant;
        const emailData = {
          to: recipient.email,
          subject: `Gastos Comunes ${community.name} - ${new Date().toLocaleDateString()}`,
          template: 'common_expenses',
          data: {
            recipient_name: recipient.fullName,
            community_name: community.name,
            unit_number: unit.unit_number,
            amount: unitExpense.total_amount,
            due_date: unitExpense.commonExpense.due_date,
            pdf_url: pdfUrl?.pdf_url
          }
        };
        
        await emailService.sendEmail(emailData);
      }
    }
  }

  private async gatherReportData(
    communityId: string,
    reportType: string,
    periodFrom: string,
    periodTo: string
  ) {
    // Implementar recolección de datos para reportes
    const data: any = {};
    
    // Obtener gastos comunes del período
    data.expenses = await CommonExpense.findAll({
      where: {
        community_id: communityId,
        created_at: {
          [Op.between]: [new Date(periodFrom), new Date(periodTo)]
        }
      },
      include: [{ model: UnitExpense, as: 'unitExpenses' }]
    });
    
    // Obtener transacciones
    data.transactions = await PaymentTransaction.findAll({
      where: {
        community_id: communityId,
        created_at: {
          [Op.between]: [new Date(periodFrom), new Date(periodTo)]
        }
      }
    });
    
    return data;
  }

  private async validatePaymentMethodConfig(type: string, config: any) {
    // Validar configuración según el tipo de método de pago
    switch (type) {
      case 'bank_transfer':
        if (!config.bank_code || !config.account_number) {
          throw new AppError('Configuración de transferencia bancaria incompleta', 400);
        }
        break;
      
      case 'paypal':
        if (!config.client_id || !config.client_secret) {
          throw new AppError('Configuración de PayPal incompleta', 400);
        }
        break;
      
      // Agregar más validaciones según necesidad
    }
  }
}

export const financialController = new FinancialController();
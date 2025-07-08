import axios, { AxiosResponse } from 'axios';
import crypto from 'crypto';
import { PaymentTransaction } from '../models/PaymentTransaction';
import { BankConfiguration } from '../models/BankConfiguration';
import { PaymentGateway } from '../models/PaymentGateway';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { cache, cacheKeys, cacheTTL } from '../config/redis';

interface PaymentResult {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  transaction_id?: string;
  gateway_reference?: string;
  message: string;
  metadata?: any;
}

interface CreditCardData {
  card_number: string;
  expiry_month: number;
  expiry_year: number;
  cvv: string;
  card_holder_name: string;
}

interface BankTransferData {
  bank_code: string;
  account_number: string;
  rut: string;
  amount: number;
  reference: string;
}

interface PayPalData {
  amount: number;
  currency: string;
  return_url: string;
  cancel_url: string;
  description: string;
}

export class PaymentService {
  private bancoEstadoApi: BancoEstadoAPI;
  private santanderApi: SantanderAPI;
  private bciApi: BCIAPI;
  private bancoCbileApi: BancoChileAPI;
  private paypalApi: PayPalAPI;
  private mercadoPagoApi: MercadoPagoAPI;

  constructor() {
    this.bancoEstadoApi = new BancoEstadoAPI();
    this.santanderApi = new SantanderAPI();
    this.bciApi = new BCIAPI();
    this.bancoCbileApi = new BancoChileAPI();
    this.paypalApi = new PayPalAPI();
    this.mercadoPagoApi = new MercadoPagoAPI();
  }

  /**
   * Procesar transferencia bancaria chilena
   */
  async processBankTransfer(transaction: PaymentTransaction, transferData: BankTransferData): Promise<PaymentResult> {
    try {
      const { bank_code, account_number, rut, amount, reference } = transferData;

      // Obtener configuración del banco
      const bankConfig = await BankConfiguration.findOne({
        where: { bank_code, is_active: true }
      });

      if (!bankConfig) {
        throw new AppError(`Banco no configurado: ${bank_code}`, 400);
      }

      let result: PaymentResult;

      switch (bank_code) {
        case 'ESTADO':
          result = await this.bancoEstadoApi.processTransfer({
            transaction_id: transaction.id,
            account_number,
            rut,
            amount,
            reference,
            callback_url: `${process.env.API_URL}/webhooks/banco-estado`
          });
          break;

        case 'SANTANDER':
          result = await this.santanderApi.processTransfer({
            transaction_id: transaction.id,
            account_number,
            rut,
            amount,
            reference,
            callback_url: `${process.env.API_URL}/webhooks/santander`
          });
          break;

        case 'BCI':
          result = await this.bciApi.processTransfer({
            transaction_id: transaction.id,
            account_number,
            rut,
            amount,
            reference,
            callback_url: `${process.env.API_URL}/webhooks/bci`
          });
          break;

        case 'CHILE':
          result = await this.bancoCbileApi.processTransfer({
            transaction_id: transaction.id,
            account_number,
            rut,
            amount,
            reference,
            callback_url: `${process.env.API_URL}/webhooks/banco-chile`
          });
          break;

        default:
          throw new AppError(`Banco no soportado: ${bank_code}`, 400);
      }

      // Guardar referencia del gateway
      if (result.gateway_reference) {
        await cache.set(
          cacheKeys.paymentReference(transaction.id),
          result.gateway_reference,
          cacheTTL.day
        );
      }

      return result;

    } catch (error) {
      logger.error('Error processing bank transfer:', error);
      return {
        status: 'failed',
        message: error.message || 'Error procesando transferencia bancaria'
      };
    }
  }

  /**
   * Procesar pago con tarjeta de crédito
   */
  async processCreditCard(transaction: PaymentTransaction, cardData: CreditCardData): Promise<PaymentResult> {
    try {
      // Tokenizar tarjeta por seguridad
      const cardToken = this.tokenizeCard(cardData);

      // Procesar con Transbank (BCI) como procesador principal en Chile
      const result = await this.bciApi.processCreditCard({
        transaction_id: transaction.id,
        card_token: cardToken,
        amount: transaction.amount,
        currency: transaction.currency || 'CLP',
        installments: 1,
        callback_url: `${process.env.API_URL}/webhooks/transbank`
      });

      return result;

    } catch (error) {
      logger.error('Error processing credit card:', error);
      return {
        status: 'failed',
        message: error.message || 'Error procesando tarjeta de crédito'
      };
    }
  }

  /**
   * Procesar pago con PayPal
   */
  async processPayPal(transaction: PaymentTransaction, paypalData: PayPalData): Promise<PaymentResult> {
    try {
      const result = await this.paypalApi.createPayment({
        transaction_id: transaction.id,
        amount: paypalData.amount,
        currency: paypalData.currency,
        return_url: paypalData.return_url,
        cancel_url: paypalData.cancel_url,
        description: paypalData.description
      });

      return result;

    } catch (error) {
      logger.error('Error processing PayPal payment:', error);
      return {
        status: 'failed',
        message: error.message || 'Error procesando pago PayPal'
      };
    }
  }

  /**
   * Procesar pago con MercadoPago
   */
  async processMercadoPago(transaction: PaymentTransaction, mpData: any): Promise<PaymentResult> {
    try {
      const result = await this.mercadoPagoApi.createPayment({
        transaction_id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency || 'CLP',
        payment_method: mpData.payment_method,
        payer: mpData.payer,
        callback_url: `${process.env.API_URL}/webhooks/mercadopago`
      });

      return result;

    } catch (error) {
      logger.error('Error processing MercadoPago payment:', error);
      return {
        status: 'failed',
        message: error.message || 'Error procesando pago MercadoPago'
      };
    }
  }

  /**
   * Verificar estado de pago
   */
  async checkPaymentStatus(transactionId: string, bankCode: string): Promise<PaymentResult> {
    try {
      const cachedReference = await cache.get(cacheKeys.paymentReference(transactionId));
      
      if (!cachedReference) {
        throw new AppError('Referencia de pago no encontrada', 404);
      }

      let result: PaymentResult;

      switch (bankCode) {
        case 'ESTADO':
          result = await this.bancoEstadoApi.checkStatus(cachedReference);
          break;
        case 'SANTANDER':
          result = await this.santanderApi.checkStatus(cachedReference);
          break;
        case 'BCI':
          result = await this.bciApi.checkStatus(cachedReference);
          break;
        case 'CHILE':
          result = await this.bancoCbileApi.checkStatus(cachedReference);
          break;
        default:
          throw new AppError(`Banco no soportado: ${bankCode}`, 400);
      }

      return result;

    } catch (error) {
      logger.error('Error checking payment status:', error);
      throw error;
    }
  }

  /**
   * Procesar webhook de confirmación
   */
  async processWebhook(bankCode: string, webhookData: any): Promise<void> {
    try {
      logger.info(`Processing webhook from ${bankCode}:`, webhookData);

      // Verificar firma del webhook
      const isValid = this.verifyWebhookSignature(bankCode, webhookData);
      if (!isValid) {
        throw new AppError('Firma de webhook inválida', 400);
      }

      // Obtener ID de transacción
      const transactionId = this.extractTransactionId(bankCode, webhookData);
      if (!transactionId) {
        throw new AppError('ID de transacción no encontrado en webhook', 400);
      }

      // Buscar transacción
      const transaction = await PaymentTransaction.findByPk(transactionId);
      if (!transaction) {
        throw new AppError('Transacción no encontrada', 404);
      }

      // Actualizar estado según el webhook
      const newStatus = this.mapWebhookStatus(bankCode, webhookData.status);
      const previousStatus = transaction.status;

      transaction.status = newStatus;
      transaction.gateway_response = webhookData;
      transaction.processed_at = new Date();

      if (newStatus === 'completed') {
        transaction.confirmed_at = new Date();
      }

      await transaction.save();

      // Notificar cambio de estado si es diferente
      if (previousStatus !== newStatus) {
        await this.notifyPaymentStatusChange(transaction, previousStatus, newStatus);
      }

      logger.info(`Payment status updated: ${transactionId} - ${previousStatus} -> ${newStatus}`);

    } catch (error) {
      logger.error('Error processing webhook:', error);
      throw error;
    }
  }

  /**
   * Reembolsar pago
   */
  async refundPayment(transactionId: string, amount?: number): Promise<PaymentResult> {
    try {
      const transaction = await PaymentTransaction.findByPk(transactionId);
      if (!transaction) {
        throw new AppError('Transacción no encontrada', 404);
      }

      if (transaction.status !== 'completed') {
        throw new AppError('Solo se pueden reembolsar pagos completados', 400);
      }

      const refundAmount = amount || transaction.amount;
      if (refundAmount > transaction.amount) {
        throw new AppError('El monto de reembolso no puede ser mayor al pago original', 400);
      }

      // Determinar método de reembolso según el método de pago original
      let result: PaymentResult;

      if (transaction.payment_method === 'paypal') {
        result = await this.paypalApi.refundPayment(
          transaction.gateway_response.payment_id,
          refundAmount
        );
      } else if (transaction.payment_method === 'credit_card') {
        result = await this.bciApi.refundPayment(
          transaction.gateway_response.transaction_id,
          refundAmount
        );
      } else {
        // Para transferencias bancarias, crear proceso manual
        result = {
          status: 'pending',
          message: 'Reembolso manual requerido para transferencia bancaria'
        };
      }

      return result;

    } catch (error) {
      logger.error('Error processing refund:', error);
      throw error;
    }
  }

  // Métodos privados auxiliares

  private tokenizeCard(cardData: CreditCardData): string {
    // Implementar tokenización segura de tarjeta
    const token = crypto.randomBytes(32).toString('hex');
    
    // En producción, usar un vault seguro para almacenar tokens
    // Por ahora, usar caché con TTL corto
    cache.set(`card_token:${token}`, JSON.stringify({
      last_four: cardData.card_number.slice(-4),
      card_type: this.detectCardType(cardData.card_number),
      expiry: `${cardData.expiry_month}/${cardData.expiry_year}`
    }), 900); // 15 minutos

    return token;
  }

  private detectCardType(cardNumber: string): string {
    const number = cardNumber.replace(/\s/g, '');
    
    if (number.startsWith('4')) return 'visa';
    if (number.startsWith('5') || number.startsWith('2')) return 'mastercard';
    if (number.startsWith('3')) return 'amex';
    
    return 'unknown';
  }

  private verifyWebhookSignature(bankCode: string, webhookData: any): boolean {
    // Implementar verificación de firma específica por banco
    switch (bankCode) {
      case 'ESTADO':
        return this.bancoEstadoApi.verifySignature(webhookData);
      case 'SANTANDER':
        return this.santanderApi.verifySignature(webhookData);
      case 'BCI':
        return this.bciApi.verifySignature(webhookData);
      case 'CHILE':
        return this.bancoCbileApi.verifySignature(webhookData);
      default:
        return false;
    }
  }

  private extractTransactionId(bankCode: string, webhookData: any): string | null {
    // Extraer ID de transacción según formato del banco
    switch (bankCode) {
      case 'ESTADO':
        return webhookData.reference || webhookData.transaction_id;
      case 'SANTANDER':
        return webhookData.merchantTransactionId || webhookData.orderId;
      case 'BCI':
        return webhookData.buy_order || webhookData.transaction_id;
      case 'CHILE':
        return webhookData.external_id || webhookData.reference;
      default:
        return webhookData.transaction_id;
    }
  }

  private mapWebhookStatus(bankCode: string, status: string): string {
    // Mapear estados específicos del banco a estados estándar
    const statusMaps: { [key: string]: { [key: string]: string } } = {
      'ESTADO': {
        'APPROVED': 'completed',
        'REJECTED': 'failed',
        'PENDING': 'processing',
        'CANCELLED': 'cancelled'
      },
      'SANTANDER': {
        'AUTHORIZED': 'completed',
        'FAILED': 'failed',
        'PENDING': 'processing',
        'REVERSED': 'cancelled'
      },
      'BCI': {
        'AUTHORIZED': 'completed',
        'FAILED': 'failed',
        'NULLIFIED': 'cancelled'
      },
      'CHILE': {
        'SUCCESS': 'completed',
        'ERROR': 'failed',
        'PENDING': 'processing'
      }
    };

    return statusMaps[bankCode]?.[status] || 'pending';
  }

  private async notifyPaymentStatusChange(
    transaction: PaymentTransaction,
    previousStatus: string,
    newStatus: string
  ): Promise<void> {
    // Implementar notificaciones de cambio de estado
    // - WebSocket en tiempo real
    // - Email al usuario
    // - Webhook a sistemas externos
    
    logger.info(`Payment status notification: ${transaction.id} changed from ${previousStatus} to ${newStatus}`);
  }
}

// Implementaciones específicas de APIs bancarias

class BancoEstadoAPI {
  private baseUrl = process.env.BANCO_ESTADO_API_URL || 'https://api.bancoestado.cl/v1';
  private apiKey = process.env.BANCO_ESTADO_API_KEY;

  async processTransfer(data: any): Promise<PaymentResult> {
    try {
      const response = await axios.post(`${this.baseUrl}/transfers`, data, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        status: 'processing',
        gateway_reference: response.data.transfer_id,
        message: 'Transferencia en proceso'
      };
    } catch (error) {
      throw new AppError('Error en API Banco Estado', 500);
    }
  }

  async checkStatus(reference: string): Promise<PaymentResult> {
    try {
      const response = await axios.get(`${this.baseUrl}/transfers/${reference}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        status: this.mapStatus(response.data.status),
        gateway_reference: reference,
        message: response.data.message || 'Estado actualizado'
      };
    } catch (error) {
      throw new AppError('Error consultando estado Banco Estado', 500);
    }
  }

  verifySignature(webhookData: any): boolean {
    // Implementar verificación de firma específica de Banco Estado
    return true; // Placeholder
  }

  private mapStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      'APPROVED': 'completed',
      'REJECTED': 'failed',
      'PENDING': 'processing',
      'CANCELLED': 'cancelled'
    };
    return statusMap[status] || 'pending';
  }
}

class SantanderAPI {
  private baseUrl = process.env.SANTANDER_API_URL || 'https://api.santander.cl/v1';
  private clientId = process.env.SANTANDER_CLIENT_ID;
  private clientSecret = process.env.SANTANDER_CLIENT_SECRET;

  async processTransfer(data: any): Promise<PaymentResult> {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.post(`${this.baseUrl}/payments`, data, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        status: 'processing',
        gateway_reference: response.data.payment_id,
        message: 'Pago en proceso'
      };
    } catch (error) {
      throw new AppError('Error en API Santander', 500);
    }
  }

  async checkStatus(reference: string): Promise<PaymentResult> {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(`${this.baseUrl}/payments/${reference}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      return {
        status: this.mapStatus(response.data.status),
        gateway_reference: reference,
        message: response.data.description || 'Estado actualizado'
      };
    } catch (error) {
      throw new AppError('Error consultando estado Santander', 500);
    }
  }

  verifySignature(webhookData: any): boolean {
    // Implementar verificación de firma específica de Santander
    return true; // Placeholder
  }

  private async getAccessToken(): Promise<string> {
    // Implementar OAuth2 para Santander
    const cacheKey = 'santander_token';
    let token = await cache.get(cacheKey);
    
    if (!token) {
      const response = await axios.post(`${this.baseUrl}/oauth/token`, {
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret
      });
      
      token = response.data.access_token;
      await cache.set(cacheKey, token, response.data.expires_in - 60);
    }
    
    return token;
  }

  private mapStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      'AUTHORIZED': 'completed',
      'FAILED': 'failed',
      'PENDING': 'processing',
      'REVERSED': 'cancelled'
    };
    return statusMap[status] || 'pending';
  }
}

class BCIAPI {
  private baseUrl = process.env.BCI_API_URL || 'https://webpay3gint.transbank.cl';
  private apiToken = process.env.BCI_API_TOKEN;

  async processTransfer(data: any): Promise<PaymentResult> {
    // Implementar integración con Transbank
    return {
      status: 'processing',
      gateway_reference: `BCI_${Date.now()}`,
      message: 'Transferencia BCI en proceso'
    };
  }

  async processCreditCard(data: any): Promise<PaymentResult> {
    // Implementar Webpay Plus
    try {
      const response = await axios.post(`${this.baseUrl}/rswebpaytransaction/api/webpay/v1.0/transactions`, {
        buy_order: data.transaction_id,
        session_id: data.transaction_id,
        amount: data.amount,
        return_url: data.callback_url
      }, {
        headers: {
          'Tbk-Api-Key-Id': this.apiToken,
          'Content-Type': 'application/json'
        }
      });

      return {
        status: 'pending',
        gateway_reference: response.data.token,
        message: 'Redireccionar a Webpay',
        metadata: {
          webpay_url: response.data.url,
          token: response.data.token
        }
      };
    } catch (error) {
      throw new AppError('Error en Webpay', 500);
    }
  }

  async checkStatus(reference: string): Promise<PaymentResult> {
    return {
      status: 'pending',
      gateway_reference: reference,
      message: 'Consultando estado BCI'
    };
  }

  async refundPayment(transactionId: string, amount: number): Promise<PaymentResult> {
    return {
      status: 'processing',
      message: 'Reembolso BCI en proceso'
    };
  }

  verifySignature(webhookData: any): boolean {
    return true; // Placeholder
  }
}

class BancoChileAPI {
  private baseUrl = process.env.BANCO_CHILE_API_URL;
  private apiKey = process.env.BANCO_CHILE_API_KEY;

  async processTransfer(data: any): Promise<PaymentResult> {
    return {
      status: 'processing',
      gateway_reference: `CHILE_${Date.now()}`,
      message: 'Transferencia Banco de Chile en proceso'
    };
  }

  async checkStatus(reference: string): Promise<PaymentResult> {
    return {
      status: 'pending',
      gateway_reference: reference,
      message: 'Consultando estado Banco de Chile'
    };
  }

  verifySignature(webhookData: any): boolean {
    return true; // Placeholder
  }
}

class PayPalAPI {
  private baseUrl = process.env.PAYPAL_MODE === 'live' ? 
    'https://api.paypal.com' : 'https://api.sandbox.paypal.com';
  private clientId = process.env.PAYPAL_CLIENT_ID;
  private clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  async createPayment(data: any): Promise<PaymentResult> {
    try {
      const token = await this.getAccessToken();

      const response = await axios.post(`${this.baseUrl}/v1/payments/payment`, {
        intent: 'sale',
        payer: { payment_method: 'paypal' },
        transactions: [{
          amount: {
            total: data.amount,
            currency: data.currency
          },
          description: data.description
        }],
        redirect_urls: {
          return_url: data.return_url,
          cancel_url: data.cancel_url
        }
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const approvalUrl = response.data.links.find((link: any) => link.rel === 'approval_url')?.href;

      return {
        status: 'pending',
        gateway_reference: response.data.id,
        message: 'Redireccionar a PayPal',
        metadata: {
          approval_url: approvalUrl,
          payment_id: response.data.id
        }
      };
    } catch (error) {
      throw new AppError('Error en PayPal API', 500);
    }
  }

  async refundPayment(paymentId: string, amount: number): Promise<PaymentResult> {
    try {
      const token = await this.getAccessToken();

      const response = await axios.post(`${this.baseUrl}/v1/payments/sale/${paymentId}/refund`, {
        amount: {
          total: amount,
          currency: 'USD'
        }
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        status: response.data.state === 'completed' ? 'completed' : 'processing',
        gateway_reference: response.data.id,
        message: 'Reembolso PayPal procesado'
      };
    } catch (error) {
      throw new AppError('Error en reembolso PayPal', 500);
    }
  }

  private async getAccessToken(): Promise<string> {
    const cacheKey = 'paypal_token';
    let token = await cache.get(cacheKey);

    if (!token) {
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await axios.post(`${this.baseUrl}/v1/oauth2/token`, 
        'grant_type=client_credentials', {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      token = response.data.access_token;
      await cache.set(cacheKey, token, response.data.expires_in - 60);
    }

    return token;
  }
}

class MercadoPagoAPI {
  private baseUrl = 'https://api.mercadopago.com';
  private accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  async createPayment(data: any): Promise<PaymentResult> {
    try {
      const response = await axios.post(`${this.baseUrl}/v1/payments`, {
        transaction_amount: data.amount,
        description: data.description || 'Pago SKYN3T',
        payment_method_id: data.payment_method,
        payer: data.payer,
        external_reference: data.transaction_id,
        notification_url: data.callback_url
      }, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        status: this.mapStatus(response.data.status),
        gateway_reference: response.data.id,
        message: 'Pago MercadoPago creado'
      };
    } catch (error) {
      throw new AppError('Error en MercadoPago API', 500);
    }
  }

  private mapStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      'approved': 'completed',
      'rejected': 'failed',
      'pending': 'processing',
      'cancelled': 'cancelled'
    };
    return statusMap[status] || 'pending';
  }
}

// Singleton instance
export const paymentService = new PaymentService();
export default paymentService;
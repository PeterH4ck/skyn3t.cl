// backend/src/services/emailService.ts
import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';
import mjml from 'mjml';
import { Queue, Worker } from 'bullmq';
import { Op } from 'sequelize';
import { User, Community, EmailTemplate, EmailLog } from '../models';
import { cacheService } from './cacheService';
import logger from '../utils/logger';
import { AppError } from '../utils/AppError';

interface EmailOptions {
  to: string | string[];
  subject: string;
  template?: string;
  templateData?: any;
  html?: string;
  text?: string;
  attachments?: any[];
  priority?: 'high' | 'normal' | 'low';
  tags?: string[];
  tracking?: boolean;
  scheduleAt?: Date;
}

interface EmailStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
}

interface BulkEmailOptions {
  recipients: Array<{
    email: string;
    personalData?: any;
  }>;
  template: string;
  subject: string;
  globalData?: any;
  sendAt?: Date;
  batchSize?: number;
  priority?: 'high' | 'normal' | 'low';
}

export class EmailService {
  private transporter: Transporter | null = null;
  private emailQueue: Queue | null = null;
  private templates: Map<string, handlebars.TemplateDelegate> = new Map();
  private isInitialized: boolean = false;

  constructor() {
    this.setupHandlebarsHelpers();
  }

  /**
   * Initialize Email Service
   */
  public async initialize(): Promise<void> {
    try {
      await this.setupTransporter();
      await this.setupEmailQueue();
      await this.loadTemplates();
      
      this.isInitialized = true;
      logger.info('EmailService initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize EmailService:', error);
      throw new AppError('Email service initialization failed', 500);
    }
  }

  /**
   * Setup SMTP Transporter
   */
  private async setupTransporter(): Promise<void> {
    const config = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      pool: true,
      maxConnections: parseInt(process.env.SMTP_MAX_CONNECTIONS || '5'),
      maxMessages: parseInt(process.env.SMTP_MAX_MESSAGES || '100'),
      rateLimit: parseInt(process.env.SMTP_RATE_LIMIT || '10'), // emails per second
    };

    this.transporter = nodemailer.createTransporter(config);

    // Verify connection
    try {
      await this.transporter.verify();
      logger.info('SMTP connection verified successfully');
    } catch (error) {
      logger.error('SMTP connection verification failed:', error);
      throw error;
    }
  }

  /**
   * Setup Email Queue for Background Processing
   */
  private async setupEmailQueue(): Promise<void> {
    this.emailQueue = new Queue('email-queue', {
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

    // Setup worker to process email jobs
    new Worker('email-queue', async (job) => {
      const { type, data } = job.data;

      switch (type) {
        case 'single_email':
          return await this.processSingleEmail(data);
        case 'bulk_email':
          return await this.processBulkEmail(data);
        case 'scheduled_email':
          return await this.processScheduledEmail(data);
        default:
          throw new Error(`Unknown email job type: ${type}`);
      }
    }, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      },
      concurrency: 5
    });

    logger.info('Email queue setup completed');
  }

  /**
   * Load Email Templates
   */
  private async loadTemplates(): Promise<void> {
    try {
      const templatesDir = path.join(__dirname, '../templates/email');
      
      // Ensure templates directory exists
      await fs.mkdir(templatesDir, { recursive: true });

      const templateFiles = await fs.readdir(templatesDir);
      
      for (const file of templateFiles) {
        if (file.endsWith('.hbs') || file.endsWith('.mjml')) {
          const templateName = path.basename(file, path.extname(file));
          await this.loadTemplate(templateName, path.join(templatesDir, file));
        }
      }

      // Load templates from database
      await this.loadDatabaseTemplates();

      logger.info(`Loaded ${this.templates.size} email templates`);

    } catch (error) {
      logger.error('Error loading email templates:', error);
    }
  }

  private async loadTemplate(name: string, filePath: string): Promise<void> {
    try {
      const templateContent = await fs.readFile(filePath, 'utf-8');
      let compiledTemplate: handlebars.TemplateDelegate;

      if (filePath.endsWith('.mjml')) {
        // Convert MJML to HTML first
        const mjmlResult = mjml(templateContent);
        if (mjmlResult.errors.length > 0) {
          logger.warn(`MJML template ${name} has warnings:`, mjmlResult.errors);
        }
        compiledTemplate = handlebars.compile(mjmlResult.html);
      } else {
        compiledTemplate = handlebars.compile(templateContent);
      }

      this.templates.set(name, compiledTemplate);
      logger.debug(`Template loaded: ${name}`);

    } catch (error) {
      logger.error(`Error loading template ${name}:`, error);
    }
  }

  private async loadDatabaseTemplates(): Promise<void> {
    try {
      const dbTemplates = await EmailTemplate.findAll({
        where: { active: true }
      });

      for (const template of dbTemplates) {
        let compiledTemplate: handlebars.TemplateDelegate;

        if (template.type === 'mjml') {
          const mjmlResult = mjml(template.content);
          compiledTemplate = handlebars.compile(mjmlResult.html);
        } else {
          compiledTemplate = handlebars.compile(template.content);
        }

        this.templates.set(template.name, compiledTemplate);
      }

    } catch (error) {
      logger.error('Error loading database templates:', error);
    }
  }

  /**
   * Setup Handlebars Helpers
   */
  private setupHandlebarsHelpers(): void {
    handlebars.registerHelper('formatDate', (date: Date, format: string) => {
      return new Intl.DateTimeFormat('es-CL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(date));
    });

    handlebars.registerHelper('formatCurrency', (amount: number) => {
      return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP'
      }).format(amount);
    });

    handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
    handlebars.registerHelper('gt', (a: number, b: number) => a > b);
    handlebars.registerHelper('lt', (a: number, b: number) => a < b);

    handlebars.registerHelper('if_includes', (array: any[], value: any, options: any) => {
      if (array && array.includes(value)) {
        return options.fn(this);
      }
      return options.inverse(this);
    });
  }

  /**
   * Send Single Email
   */
  public async sendEmail(options: EmailOptions): Promise<string> {
    try {
      if (!this.isInitialized) {
        throw new AppError('Email service not initialized', 500);
      }

      // Generate tracking ID
      const trackingId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Prepare email content
      let html = options.html;
      let text = options.text;

      if (options.template) {
        const compiledTemplate = this.templates.get(options.template);
        if (!compiledTemplate) {
          throw new AppError(`Template '${options.template}' not found`, 404);
        }

        const templateData = {
          ...options.templateData,
          trackingId,
          unsubscribeUrl: `${process.env.FRONTEND_URL}/unsubscribe?token=${trackingId}`,
          preferencesUrl: `${process.env.FRONTEND_URL}/email-preferences?token=${trackingId}`
        };

        html = compiledTemplate(templateData);
        
        // Generate text version if not provided
        if (!text) {
          text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        }
      }

      // Add tracking pixel if enabled
      if (options.tracking !== false) {
        const trackingPixel = `<img src="${process.env.API_URL}/api/v1/emails/track/open/${trackingId}" width="1" height="1" style="display:none;" />`;
        html = html?.replace('</body>', `${trackingPixel}</body>`) || html;
      }

      const mailOptions: SendMailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'SKYN3T Access Control',
          address: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER!
        },
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html,
        text,
        attachments: options.attachments,
        priority: options.priority || 'normal',
        headers: {
          'X-Tracking-ID': trackingId,
          'X-Tags': options.tags?.join(',') || ''
        }
      };

      // Queue email for processing
      if (options.scheduleAt) {
        await this.emailQueue!.add('scheduled_email', {
          type: 'single_email',
          data: { mailOptions, trackingId, options }
        }, {
          delay: options.scheduleAt.getTime() - Date.now()
        });
      } else {
        await this.emailQueue!.add('single_email', {
          type: 'single_email',
          data: { mailOptions, trackingId, options }
        }, {
          priority: this.getPriority(options.priority)
        });
      }

      logger.info(`Email queued for sending: ${trackingId}`, {
        to: options.to,
        subject: options.subject,
        template: options.template
      });

      return trackingId;

    } catch (error) {
      logger.error('Error sending email:', error);
      throw error;
    }
  }

  /**
   * Send Bulk Emails
   */
  public async sendBulkEmail(options: BulkEmailOptions): Promise<string[]> {
    try {
      if (!this.isInitialized) {
        throw new AppError('Email service not initialized', 500);
      }

      const batchSize = options.batchSize || 100;
      const trackingIds: string[] = [];

      // Split recipients into batches
      for (let i = 0; i < options.recipients.length; i += batchSize) {
        const batch = options.recipients.slice(i, i + batchSize);
        const batchId = `bulk_${Date.now()}_${i}`;

        await this.emailQueue!.add('bulk_email', {
          type: 'bulk_email',
          data: {
            recipients: batch,
            template: options.template,
            subject: options.subject,
            globalData: options.globalData,
            batchId
          }
        }, {
          delay: options.sendAt ? options.sendAt.getTime() - Date.now() : 0,
          priority: this.getPriority(options.priority)
        });

        trackingIds.push(batchId);
      }

      logger.info(`Bulk email queued: ${options.recipients.length} recipients in ${trackingIds.length} batches`, {
        template: options.template,
        subject: options.subject
      });

      return trackingIds;

    } catch (error) {
      logger.error('Error sending bulk email:', error);
      throw error;
    }
  }

  /**
   * Process Single Email
   */
  private async processSingleEmail(data: any): Promise<void> {
    try {
      const { mailOptions, trackingId, options } = data;

      // Log email attempt
      await EmailLog.create({
        trackingId,
        recipient: mailOptions.to,
        subject: mailOptions.subject,
        template: options.template || null,
        status: 'sending',
        sentAt: new Date(),
        tags: options.tags || []
      });

      // Send email
      const info = await this.transporter!.sendMail(mailOptions);

      // Update log with success
      await EmailLog.update({
        status: 'sent',
        messageId: info.messageId,
        response: info.response
      }, {
        where: { trackingId }
      });

      logger.info(`Email sent successfully: ${trackingId}`, {
        messageId: info.messageId,
        recipient: mailOptions.to
      });

    } catch (error) {
      // Update log with error
      await EmailLog.update({
        status: 'failed',
        error: error.message
      }, {
        where: { trackingId: data.trackingId }
      });

      logger.error(`Email sending failed: ${data.trackingId}`, error);
      throw error;
    }
  }

  /**
   * Process Bulk Email
   */
  private async processBulkEmail(data: any): Promise<void> {
    try {
      const { recipients, template, subject, globalData, batchId } = data;

      const compiledTemplate = this.templates.get(template);
      if (!compiledTemplate) {
        throw new AppError(`Template '${template}' not found`, 404);
      }

      for (const recipient of recipients) {
        const trackingId = `${batchId}_${Math.random().toString(36).substr(2, 9)}`;
        
        const templateData = {
          ...globalData,
          ...recipient.personalData,
          trackingId,
          unsubscribeUrl: `${process.env.FRONTEND_URL}/unsubscribe?token=${trackingId}`,
          preferencesUrl: `${process.env.FRONTEND_URL}/email-preferences?token=${trackingId}`
        };

        const html = compiledTemplate(templateData);
        const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

        const mailOptions: SendMailOptions = {
          from: {
            name: process.env.EMAIL_FROM_NAME || 'SKYN3T Access Control',
            address: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER!
          },
          to: recipient.email,
          subject,
          html,
          text,
          headers: {
            'X-Tracking-ID': trackingId,
            'X-Batch-ID': batchId
          }
        };

        try {
          // Log email attempt
          await EmailLog.create({
            trackingId,
            recipient: recipient.email,
            subject,
            template,
            status: 'sending',
            sentAt: new Date(),
            batchId
          });

          // Send email
          const info = await this.transporter!.sendMail(mailOptions);

          // Update log with success
          await EmailLog.update({
            status: 'sent',
            messageId: info.messageId,
            response: info.response
          }, {
            where: { trackingId }
          });

        } catch (error) {
          // Update log with error
          await EmailLog.update({
            status: 'failed',
            error: error.message
          }, {
            where: { trackingId }
          });

          logger.error(`Bulk email failed for ${recipient.email}:`, error);
        }

        // Add small delay to avoid overwhelming SMTP server
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.info(`Bulk email batch completed: ${batchId}`, {
        recipientCount: recipients.length,
        template,
        subject
      });

    } catch (error) {
      logger.error(`Bulk email batch failed: ${data.batchId}`, error);
      throw error;
    }
  }

  /**
   * Process Scheduled Email
   */
  private async processScheduledEmail(data: any): Promise<void> {
    return await this.processSingleEmail(data);
  }

  /**
   * Email Analytics Methods
   */
  public async trackEmailOpen(trackingId: string, metadata?: any): Promise<void> {
    try {
      await EmailLog.update({
        openedAt: new Date(),
        openCount: literal('open_count + 1'),
        lastInteraction: new Date(),
        metadata: metadata || {}
      }, {
        where: { trackingId }
      });

      logger.debug(`Email opened: ${trackingId}`);

    } catch (error) {
      logger.error(`Error tracking email open: ${trackingId}`, error);
    }
  }

  public async trackEmailClick(trackingId: string, clickedUrl: string, metadata?: any): Promise<void> {
    try {
      await EmailLog.update({
        clickedAt: new Date(),
        clickCount: literal('click_count + 1'),
        lastInteraction: new Date(),
        clickedUrls: literal(`array_append(clicked_urls, '${clickedUrl}')`),
        metadata: metadata || {}
      }, {
        where: { trackingId }
      });

      logger.debug(`Email link clicked: ${trackingId}`, { clickedUrl });

    } catch (error) {
      logger.error(`Error tracking email click: ${trackingId}`, error);
    }
  }

  public async getEmailStats(filters?: any): Promise<EmailStats> {
    try {
      const where: any = {};
      
      if (filters?.startDate && filters?.endDate) {
        where.sentAt = {
          [Op.between]: [filters.startDate, filters.endDate]
        };
      }
      
      if (filters?.template) {
        where.template = filters.template;
      }

      const stats = await EmailLog.findAll({
        attributes: [
          [literal('COUNT(*)'), 'sent'],
          [literal('COUNT(CASE WHEN status = \'delivered\' THEN 1 END)'), 'delivered'],
          [literal('COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END)'), 'opened'],
          [literal('COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END)'), 'clicked'],
          [literal('COUNT(CASE WHEN status = \'bounced\' THEN 1 END)'), 'bounced'],
          [literal('COUNT(CASE WHEN status = \'complained\' THEN 1 END)'), 'complained']
        ],
        where,
        raw: true
      });

      return stats[0] as any;

    } catch (error) {
      logger.error('Error getting email stats:', error);
      throw error;
    }
  }

  /**
   * Template Management
   */
  public async createTemplate(name: string, content: string, type: 'html' | 'mjml' = 'html'): Promise<void> {
    try {
      // Save to database
      await EmailTemplate.create({
        name,
        content,
        type,
        active: true
      });

      // Compile and cache template
      let compiledTemplate: handlebars.TemplateDelegate;

      if (type === 'mjml') {
        const mjmlResult = mjml(content);
        compiledTemplate = handlebars.compile(mjmlResult.html);
      } else {
        compiledTemplate = handlebars.compile(content);
      }

      this.templates.set(name, compiledTemplate);

      logger.info(`Email template created: ${name}`);

    } catch (error) {
      logger.error(`Error creating email template: ${name}`, error);
      throw error;
    }
  }

  public async updateTemplate(name: string, content: string, type: 'html' | 'mjml' = 'html'): Promise<void> {
    try {
      // Update in database
      await EmailTemplate.update({
        content,
        type,
        updatedAt: new Date()
      }, {
        where: { name }
      });

      // Recompile and cache template
      let compiledTemplate: handlebars.TemplateDelegate;

      if (type === 'mjml') {
        const mjmlResult = mjml(content);
        compiledTemplate = handlebars.compile(mjmlResult.html);
      } else {
        compiledTemplate = handlebars.compile(content);
      }

      this.templates.set(name, compiledTemplate);

      logger.info(`Email template updated: ${name}`);

    } catch (error) {
      logger.error(`Error updating email template: ${name}`, error);
      throw error;
    }
  }

  /**
   * Utility Methods
   */
  private getPriority(priority?: 'high' | 'normal' | 'low'): number {
    switch (priority) {
      case 'high': return 10;
      case 'low': return 1;
      default: return 5;
    }
  }

  public async getQueueStats(): Promise<any> {
    if (!this.emailQueue) return null;

    return {
      waiting: await this.emailQueue.getWaiting(),
      active: await this.emailQueue.getActive(),
      completed: await this.emailQueue.getCompleted(),
      failed: await this.emailQueue.getFailed(),
      delayed: await this.emailQueue.getDelayed()
    };
  }

  /**
   * Cleanup and Shutdown
   */
  public async shutdown(): Promise<void> {
    try {
      if (this.emailQueue) {
        await this.emailQueue.close();
      }

      if (this.transporter) {
        this.transporter.close();
      }

      logger.info('EmailService shutdown completed');

    } catch (error) {
      logger.error('Error shutting down EmailService:', error);
    }
  }
}

// Import literal for Sequelize
import { literal } from 'sequelize';

// Export singleton instance
export const emailService = new EmailService();
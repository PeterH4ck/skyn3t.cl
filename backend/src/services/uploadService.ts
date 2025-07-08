import { Client as MinioClient } from 'minio';
import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import { logger } from '../utils/logger';

interface UploadOptions {
  bucket?: string;
  folder?: string;
  public?: boolean;
  metadata?: Record<string, string>;
}

interface ImageOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export class UploadService {
  private minioClient: MinioClient;
  private defaultBucket: string;

  constructor() {
    this.minioClient = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'admin',
      secretKey: process.env.MINIO_SECRET_KEY || 'password'
    });

    this.defaultBucket = process.env.MINIO_BUCKET || 'skyn3t';
    
    // Inicializar buckets
    this.initializeBuckets();
  }

  /**
   * Inicializar buckets necesarios
   */
  private async initializeBuckets() {
    try {
      const buckets = ['skyn3t', 'skyn3t-public', 'skyn3t-temp'];
      
      for (const bucket of buckets) {
        const exists = await this.minioClient.bucketExists(bucket);
        
        if (!exists) {
          await this.minioClient.makeBucket(bucket, 'us-east-1');
          logger.info(`Bucket created: ${bucket}`);
          
          // Configurar política pública para bucket público
          if (bucket === 'skyn3t-public') {
            const policy = {
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Principal: { AWS: ['*'] },
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${bucket}/*`]
              }]
            };
            
            await this.minioClient.setBucketPolicy(
              bucket,
              JSON.stringify(policy)
            );
          }
        }
      }
    } catch (error) {
      logger.error('Error initializing buckets:', error);
    }
  }

  /**
   * Generar nombre único para archivo
   */
  private generateFileName(originalName: string): string {
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    const hash = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    
    return `${name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}_${hash}${ext}`;
  }

  /**
   * Subir archivo
   */
  async uploadFile(
    file: Express.Multer.File,
    options: UploadOptions = {}
  ): Promise<string> {
    try {
      const bucket = options.public ? 'skyn3t-public' : (options.bucket || this.defaultBucket);
      const fileName = this.generateFileName(file.originalname);
      const folder = options.folder || 'uploads';
      const objectName = `${folder}/${fileName}`;

      const metadata = {
        'Content-Type': file.mimetype,
        'Original-Name': file.originalname,
        ...options.metadata
      };

      await this.minioClient.putObject(
        bucket,
        objectName,
        file.buffer,
        file.size,
        metadata
      );

      logger.info(`File uploaded: ${objectName} to bucket ${bucket}`);

      // Retornar URL
      if (options.public) {
        return this.getPublicUrl(bucket, objectName);
      } else {
        return this.getSignedUrl(bucket, objectName);
      }

    } catch (error) {
      logger.error('Error uploading file:', error);
      throw new Error('Error al subir archivo');
    }
  }

  /**
   * Subir imagen con procesamiento
   */
  async uploadImage(
    file: Express.Multer.File,
    options: UploadOptions & ImageOptions = {}
  ): Promise<string> {
    try {
      let imageBuffer = file.buffer;

      // Procesar imagen con Sharp
      if (options.width || options.height || options.quality || options.format) {
        const sharpInstance = sharp(file.buffer);

        // Redimensionar
        if (options.width || options.height) {
          sharpInstance.resize(options.width, options.height, {
            fit: options.fit || 'cover',
            withoutEnlargement: true
          });
        }

        // Cambiar formato
        if (options.format) {
          sharpInstance.toFormat(options.format, {
            quality: options.quality || 80
          });
        }

        // Optimizar calidad
        if (options.quality && !options.format) {
          const format = path.extname(file.originalname).substring(1) as any;
          sharpInstance.toFormat(format, {
            quality: options.quality
          });
        }

        imageBuffer = await sharpInstance.toBuffer();
      }

      // Crear nuevo objeto file con buffer procesado
      const processedFile: Express.Multer.File = {
        ...file,
        buffer: imageBuffer,
        size: imageBuffer.length
      };

      return this.uploadFile(processedFile, options);

    } catch (error) {
      logger.error('Error uploading image:', error);
      throw new Error('Error al procesar imagen');
    }
  }

  /**
   * Subir avatar de usuario
   */
  async uploadAvatar(file: Express.Multer.File, userId: string): Promise<string> {
    return this.uploadImage(file, {
      folder: `avatars/${userId}`,
      width: 200,
      height: 200,
      quality: 85,
      format: 'webp',
      public: true,
      metadata: {
        'User-Id': userId,
        'Type': 'avatar'
      }
    });
  }

  /**
   * Subir foto de vehículo
   */
  async uploadVehiclePhoto(file: Express.Multer.File, vehicleId: string): Promise<string> {
    return this.uploadImage(file, {
      folder: `vehicles/${vehicleId}`,
      width: 800,
      quality: 80,
      format: 'jpeg',
      metadata: {
        'Vehicle-Id': vehicleId,
        'Type': 'vehicle-photo'
      }
    });
  }

  /**
   * Subir documento
   */
  async uploadDocument(
    file: Express.Multer.File,
    documentType: string,
    entityId: string
  ): Promise<string> {
    return this.uploadFile(file, {
      folder: `documents/${documentType}/${entityId}`,
      metadata: {
        'Document-Type': documentType,
        'Entity-Id': entityId
      }
    });
  }

  /**
   * Obtener URL pública
   */
  getPublicUrl(bucket: string, objectName: string): string {
    const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
    const host = process.env.MINIO_ENDPOINT || 'localhost';
    const port = process.env.MINIO_PORT || '9000';
    
    return `${protocol}://${host}:${port}/${bucket}/${objectName}`;
  }

  /**
   * Obtener URL firmada (temporal)
   */
  async getSignedUrl(
    bucket: string,
    objectName: string,
    expiry: number = 3600
  ): Promise<string> {
    try {
      return await this.minioClient.presignedGetObject(bucket, objectName, expiry);
    } catch (error) {
      logger.error('Error generating signed URL:', error);
      throw new Error('Error al generar URL');
    }
  }

  /**
   * Eliminar archivo
   */
  async deleteFile(fileUrl: string): Promise<boolean> {
    try {
      // Extraer bucket y objectName de la URL
      const urlParts = fileUrl.split('/');
      const bucket = urlParts[3];
      const objectName = urlParts.slice(4).join('/');

      await this.minioClient.removeObject(bucket, objectName);
      
      logger.info(`File deleted: ${objectName} from bucket ${bucket}`);
      return true;

    } catch (error) {
      logger.error('Error deleting file:', error);
      return false;
    }
  }

  /**
   * Eliminar múltiples archivos
   */
  async deleteFiles(fileUrls: string[]): Promise<number> {
    let deleted = 0;

    for (const url of fileUrls) {
      if (await this.deleteFile(url)) {
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Copiar archivo
   */
  async copyFile(
    sourceUrl: string,
    destinationFolder: string,
    destinationBucket?: string
  ): Promise<string> {
    try {
      // Extraer información del archivo fuente
      const urlParts = sourceUrl.split('/');
      const sourceBucket = urlParts[3];
      const sourceObject = urlParts.slice(4).join('/');
      const fileName = path.basename(sourceObject);
      
      const destBucket = destinationBucket || sourceBucket;
      const destObject = `${destinationFolder}/${fileName}`;

      await this.minioClient.copyObject(
        destBucket,
        destObject,
        `/${sourceBucket}/${sourceObject}`
      );

      logger.info(`File copied from ${sourceObject} to ${destObject}`);

      if (destBucket === 'skyn3t-public') {
        return this.getPublicUrl(destBucket, destObject);
      } else {
        return this.getSignedUrl(destBucket, destObject);
      }

    } catch (error) {
      logger.error('Error copying file:', error);
      throw new Error('Error al copiar archivo');
    }
  }

  /**
   * Listar archivos en una carpeta
   */
  async listFiles(
    folder: string,
    bucket?: string
  ): Promise<Array<{ name: string; size: number; lastModified: Date }>> {
    try {
      const bucketName = bucket || this.defaultBucket;
      const stream = this.minioClient.listObjectsV2(bucketName, folder, true);
      const files: any[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => {
          files.push({
            name: obj.name,
            size: obj.size,
            lastModified: obj.lastModified
          });
        });

        stream.on('error', (err) => {
          logger.error('Error listing files:', err);
          reject(err);
        });

        stream.on('end', () => {
          resolve(files);
        });
      });

    } catch (error) {
      logger.error('Error listing files:', error);
      return [];
    }
  }

  /**
   * Obtener estadísticas de almacenamiento
   */
  async getStorageStats(communityId?: string): Promise<any> {
    try {
      const buckets = ['skyn3t', 'skyn3t-public'];
      const stats: any = {
        total_size: 0,
        file_count: 0,
        by_type: {}
      };

      for (const bucket of buckets) {
        const prefix = communityId ? `community/${communityId}/` : '';
        const stream = this.minioClient.listObjectsV2(bucket, prefix, true);

        await new Promise((resolve, reject) => {
          stream.on('data', (obj) => {
            stats.total_size += obj.size;
            stats.file_count++;

            const ext = path.extname(obj.name).toLowerCase();
            if (!stats.by_type[ext]) {
              stats.by_type[ext] = { count: 0, size: 0 };
            }
            stats.by_type[ext].count++;
            stats.by_type[ext].size += obj.size;
          });

          stream.on('error', reject);
          stream.on('end', resolve);
        });
      }

      return stats;

    } catch (error) {
      logger.error('Error getting storage stats:', error);
      return null;
    }
  }
}

// Instancia singleton
export const uploadService = new UploadService();
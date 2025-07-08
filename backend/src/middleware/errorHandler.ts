// backend/src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log del error
  logger.error('Error caught by error handler:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    user_id: req.user?.id
  });

  // Determinar si es un error operacional
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        details: err.details,
        statusCode: err.statusCode
      }
    });
  }

  // Errores de Sequelize
  if (err.name === 'SequelizeValidationError') {
    const errors = (err as any).errors.map((e: any) => ({
      field: e.path,
      message: e.message
    }));

    return res.status(400).json({
      success: false,
      error: {
        message: 'Error de validación',
        details: errors,
        statusCode: 400
      }
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    const errors = (err as any).errors.map((e: any) => ({
      field: e.path,
      message: `${e.path} ya existe`
    }));

    return res.status(409).json({
      success: false,
      error: {
        message: 'Conflicto de datos',
        details: errors,
        statusCode: 409
      }
    });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Error de referencia: el registro está siendo utilizado',
        statusCode: 400
      }
    });
  }

  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Token inválido',
        statusCode: 401
      }
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Token expirado',
        statusCode: 401
      }
    });
  }

  // Error de Multer
  if (err.name === 'MulterError') {
    let message = 'Error al subir archivo';
    
    switch ((err as any).code) {
      case 'LIMIT_FILE_SIZE':
        message = 'El archivo es demasiado grande';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Demasiados archivos';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Campo de archivo inesperado';
        break;
    }

    return res.status(400).json({
      success: false,
      error: {
        message,
        statusCode: 400
      }
    });
  }

  // Error genérico
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    success: false,
    error: {
      message: isDevelopment ? err.message : 'Error interno del servidor',
      statusCode: 500,
      ...(isDevelopment && { stack: err.stack })
    }
  });
};

// backend/src/middleware/notFoundHandler.ts
import { Request, Response } from 'express';

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Ruta no encontrada: ${req.method} ${req.url}`,
      statusCode: 404
    }
  });
};
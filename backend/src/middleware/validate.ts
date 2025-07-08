import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { AppError } from '../utils/AppError';

/**
 * Middleware para ejecutar validaciones y manejar errores
 */
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Ejecutar todas las validaciones
    await Promise.all(validations.map(validation => validation.run(req)));

    // Obtener errores
    const errors = validationResult(req);
    
    if (errors.isEmpty()) {
      return next();
    }

    // Formatear errores
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value
    }));

    // Crear mensaje de error
    const errorMessage = formattedErrors
      .map(err => `${err.field}: ${err.message}`)
      .join(', ');

    // Enviar respuesta de error
    next(new AppError(errorMessage, 400, formattedErrors));
  };
};
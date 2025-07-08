import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { json, urlencoded } from 'express';
import path from 'path';

// Importar rutas
import routes from './routes';

// Importar middlewares
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';

// Crear aplicación Express
const app: Application = express();

// Configuración de CORS
const corsOptions = {
  origin: function (origin: any, callback: any) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:80',
      process.env.FRONTEND_URL
    ].filter(Boolean);

    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // 24 horas
};

// Middlewares de seguridad
app.use(helmet({
  contentSecurityPolicy: false, // Configurar según necesidades
  crossOriginEmbedderPolicy: false
}));
app.use(cors(corsOptions));

// Compresión
app.use(compression());

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Rate limiting global
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de solicitudes
  message: 'Demasiadas solicitudes desde esta IP, intente nuevamente más tarde',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting específico para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos de login
  skipSuccessfulRequests: true,
  message: 'Demasiados intentos de login, intente nuevamente más tarde'
});

// Aplicar rate limiting
app.use('/api/', limiter);
app.use('/api/auth/login', loginLimiter);

// Body parsing
app.use(json({ limit: '10mb' }));
app.use(urlencoded({ extended: true, limit: '10mb' }));

// Archivos estáticos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api/v1', routes);

// Swagger documentation (en desarrollo)
if (process.env.NODE_ENV === 'development') {
  // TODO: Agregar Swagger UI
}

// Manejo de rutas no encontradas
app.use(notFoundHandler);

// Manejo de errores
app.use(errorHandler);

export default app;
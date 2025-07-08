import 'express-async-errors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { sequelize } from './config/database';
import { redisClient } from './config/redis';
import { logger } from './utils/logger';
import { WebSocketService } from './services/websocketService';
import { startCronJobs } from './utils/cronJobs';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.API_PORT || 8000;

// Crear servidor HTTP
const httpServer = createServer(app);

// Configurar Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Inicializar servicio WebSocket
const wsService = new WebSocketService(io);

// Función principal de inicio
async function startServer() {
  try {
    // Conectar a la base de datos
    await sequelize.authenticate();
    logger.info('✅ Database connection established successfully');

    // Sincronizar modelos (solo en desarrollo)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('✅ Database models synchronized');
    }

    // Conectar a Redis
    await redisClient.connect();
    logger.info('✅ Redis connection established successfully');

    // Iniciar trabajos programados
    startCronJobs();
    logger.info('✅ Cron jobs started');

    // Iniciar servidor HTTP
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
      logger.info(`📡 WebSocket server is ready`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔗 API URL: http://localhost:${PORT}`);
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Cerrar servidor de forma segura
  httpServer.close(() => {
    process.exit(1);
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Cerrar servidor de forma segura
  httpServer.close(() => {
    process.exit(1);
  });
});

// Manejo de señales de terminación
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(async () => {
    logger.info('HTTP server closed');
    
    // Cerrar conexiones
    await sequelize.close();
    await redisClient.quit();
    
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Iniciar servidor
startServer();

// Exportar para pruebas
export { httpServer, io };
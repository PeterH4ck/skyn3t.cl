import { Router } from 'express';
import authRoutes from './auth';
import usersRoutes from './users';
import permissionsRoutes from './permissions';
import communitiesRoutes from './communities';
import devicesRoutes from './devices';
import accessRoutes from './access';
import financialRoutes from './financial';
import notificationsRoutes from './notifications';
import reportsRoutes from './reports';
import systemRoutes from './system';

const router = Router();

// Rutas públicas
router.use('/auth', authRoutes);

// Rutas protegidas (requieren autenticación)
router.use('/users', usersRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/communities', communitiesRoutes);
router.use('/devices', devicesRoutes);
router.use('/access', accessRoutes);
router.use('/financial', financialRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/reports', reportsRoutes);
router.use('/system', systemRoutes);

// Ruta de prueba
router.get('/test', (req, res) => {
  res.json({
    message: 'API SKYN3T funcionando correctamente',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

export default router;
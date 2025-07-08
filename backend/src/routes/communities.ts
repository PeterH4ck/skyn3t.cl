import { Router } from 'express';
import { communityController } from '../controllers/communityController';
import { 
  authenticate, 
  requirePermission, 
  requireCommunityAdmin,
  userRateLimit 
} from '../middleware/auth';
import { validate } from '../middleware/validate';
import { body, param, query } from 'express-validator';

const router = Router();

// Aplicar autenticación a todas las rutas
router.use(authenticate);

// Validaciones
const createCommunityValidation = [
  body('code')
    .trim()
    .isLength({ min: 3, max: 50 })
    .matches(/^[A-Z0-9_-]+$/)
    .withMessage('El código debe contener solo mayúsculas, números, guiones y guiones bajos'),
  body('name')
    .trim()
    .notEmpty()
    .isLength({ max: 200 })
    .withMessage('El nombre es requerido y debe tener máximo 200 caracteres'),
  body('type')
    .isIn(['building', 'condominium', 'office', 'industrial', 'gated_community'])
    .withMessage('Tipo de comunidad inválido'),
  body('country_id')
    .isUUID()
    .withMessage('ID de país inválido'),
  body('address')
    .trim()
    .notEmpty()
    .withMessage('La dirección es requerida'),
  body('city')
    .trim()
    .notEmpty()
    .withMessage('La ciudad es requerida'),
  body('contact_email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email de contacto inválido'),
  body('contact_phone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Teléfono de contacto inválido'),
  body('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitud inválida'),
  body('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitud inválida')
];

const updateCommunityValidation = [
  param('id').isUUID().withMessage('ID de comunidad inválido'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .matches(/^[A-Z0-9_-]+$/),
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .isLength({ max: 200 }),
  body('contact_email')
    .optional()
    .isEmail()
    .normalizeEmail(),
  body('contact_phone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
];

const manageFeaturesValidation = [
  param('id').isUUID().withMessage('ID de comunidad inválido'),
  body('features')
    .isArray()
    .withMessage('Las features deben ser un array'),
  body('features.*.feature_id')
    .isUUID()
    .withMessage('feature_id debe ser un UUID válido'),
  body('features.*.enabled')
    .isBoolean()
    .withMessage('enabled debe ser booleano'),
  body('features.*.custom_settings')
    .optional()
    .isObject()
    .withMessage('custom_settings debe ser un objeto')
];

const addMemberValidation = [
  param('id').isUUID().withMessage('ID de comunidad inválido'),
  body('user_id')
    .isUUID()
    .withMessage('ID de usuario inválido'),
  body('member_type')
    .isIn(['owner', 'tenant', 'family', 'staff', 'visitor'])
    .withMessage('Tipo de miembro inválido'),
  body('unit_id')
    .optional()
    .isUUID()
    .withMessage('ID de unidad inválido'),
  body('relationship')
    .optional()
    .trim()
    .notEmpty(),
  body('valid_until')
    .optional()
    .isISO8601()
    .withMessage('Fecha de validez inválida')
];

const queryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La página debe ser un número entero positivo'),
  query('size')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('El tamaño debe ser entre 1 y 100'),
  query('search')
    .optional()
    .trim()
    .escape(),
  query('type')
    .optional()
    .isIn(['building', 'condominium', 'office', 'industrial', 'gated_community']),
  query('country_id')
    .optional()
    .isUUID(),
  query('is_active')
    .optional()
    .isBoolean()
];

// Rutas

// Listar comunidades
router.get(
  '/',
  requirePermission('communities.view'),
  validate(queryValidation),
  userRateLimit(60000, 100),
  communityController.getCommunities
);

// Obtener comunidad específica
router.get(
  '/:id',
  requirePermission('communities.view'),
  validate([param('id').isUUID()]),
  communityController.getCommunity
);

// Obtener estadísticas de la comunidad
router.get(
  '/:id/stats',
  requirePermission('communities.view'),
  validate([
    param('id').isUUID(),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601()
  ]),
  communityController.getCommunityStats
);

// Obtener miembros de la comunidad
router.get(
  '/:id/members',
  requirePermission('communities.members.manage'),
  validate([
    param('id').isUUID(),
    query('page').optional().isInt({ min: 1 }),
    query('size').optional().isInt({ min: 1, max: 100 }),
    query('member_type').optional().isIn(['owner', 'tenant', 'family', 'staff', 'visitor']),
    query('search').optional().trim().escape(),
    query('unit_id').optional().isUUID(),
    query('is_active').optional().isBoolean()
  ]),
  communityController.getCommunityMembers
);

// Exportar datos de la comunidad
router.get(
  '/:id/export',
  requirePermission('communities.view', 'reports.export'),
  validate([
    param('id').isUUID(),
    query('format').optional().isIn(['xlsx', 'csv', 'pdf']),
    query('include').optional().isArray()
  ]),
  communityController.exportCommunityData
);

// Crear comunidad (solo super admin o system admin)
router.post(
  '/',
  requirePermission('communities.create'),
  validate(createCommunityValidation),
  communityController.createCommunity
);

// Actualizar comunidad
router.put(
  '/:id',
  requirePermission('communities.edit'),
  validate(updateCommunityValidation),
  communityController.updateCommunity
);

// Gestionar features de la comunidad
router.put(
  '/:id/features',
  requirePermission('communities.features.manage'),
  validate(manageFeaturesValidation),
  communityController.manageCommunityFeatures
);

// Agregar miembro a la comunidad
router.post(
  '/:id/members',
  requirePermission('communities.members.manage'),
  validate(addMemberValidation),
  communityController.addCommunityMember
);

// Actualizar miembro de la comunidad
router.put(
  '/:id/members/:memberId',
  requirePermission('communities.members.manage'),
  validate([
    param('id').isUUID(),
    param('memberId').isUUID(),
    body('member_type').optional().isIn(['owner', 'tenant', 'family', 'staff', 'visitor']),
    body('unit_id').optional().isUUID(),
    body('is_active').optional().isBoolean()
  ]),
  async (req, res, next) => {
    // TODO: Implementar actualización de miembro
    res.json({ success: true, message: 'Funcionalidad en desarrollo' });
  }
);

// Eliminar miembro de la comunidad
router.delete(
  '/:id/members/:memberId',
  requirePermission('communities.members.manage'),
  validate([
    param('id').isUUID(),
    param('memberId').isUUID()
  ]),
  async (req, res, next) => {
    // TODO: Implementar eliminación de miembro
    res.json({ success: true, message: 'Funcionalidad en desarrollo' });
  }
);

// Rutas específicas para admin de comunidad
router.use('/:id/settings', requireCommunityAdmin, async (req, res, next) => {
  req.communityId = req.params.id;
  next();
});

router.get('/:id/settings', async (req, res) => {
  // TODO: Obtener configuración de la comunidad
  res.json({ success: true, message: 'Funcionalidad en desarrollo' });
});

router.put('/:id/settings', 
  validate([
    body('settings').isObject()
  ]),
  async (req, res) => {
    // TODO: Actualizar configuración de la comunidad
    res.json({ success: true, message: 'Funcionalidad en desarrollo' });
  }
);

export default router;
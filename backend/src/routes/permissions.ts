import { Router } from 'express';
import { permissionController } from '../controllers/permissionController';
import { 
  authenticate, 
  requirePermission,
  userRateLimit 
} from '../middleware/auth';
import { validate } from '../middleware/validate';
import { body, param, query } from 'express-validator';

const router = Router();

// Aplicar autenticación a todas las rutas
router.use(authenticate);

// Validaciones
const updatePermissionsValidation = [
  body('permissions')
    .isArray()
    .withMessage('Los permisos deben ser un array'),
  body('permissions.*')
    .isUUID()
    .withMessage('Cada permiso debe ser un UUID válido'),
  body('reason')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('La razón no puede estar vacía')
];

const updateUserPermissionsValidation = [
  body('permissions')
    .isArray()
    .withMessage('Los permisos deben ser un array'),
  body('permissions.*.permission_id')
    .isUUID()
    .withMessage('Cada permission_id debe ser un UUID válido'),
  body('permissions.*.granted')
    .optional()
    .isBoolean()
    .withMessage('granted debe ser booleano'),
  body('permissions.*.valid_from')
    .optional()
    .isISO8601()
    .withMessage('valid_from debe ser una fecha válida'),
  body('permissions.*.valid_until')
    .optional()
    .isISO8601()
    .withMessage('valid_until debe ser una fecha válida'),
  body('community_id')
    .optional()
    .isUUID()
    .withMessage('community_id debe ser un UUID válido'),
  body('reason')
    .optional()
    .trim()
    .notEmpty()
];

const previewChangesValidation = [
  body('type')
    .isIn(['role', 'user'])
    .withMessage('El tipo debe ser "role" o "user"'),
  body('target_id')
    .isUUID()
    .withMessage('target_id debe ser un UUID válido'),
  body('permissions')
    .isArray()
    .withMessage('Los permisos deben ser un array'),
  body('community_id')
    .optional()
    .isUUID()
];

// Rutas

// Obtener árbol de permisos para UI
router.get(
  '/tree',
  requirePermission('system.permissions.manage'),
  userRateLimit(60000, 60),
  permissionController.getPermissionTree
);

// Obtener todos los permisos con filtros
router.get(
  '/',
  requirePermission('system.permissions.manage'),
  validate([
    query('module').optional().trim(),
    query('risk_level').optional().isIn(['low', 'medium', 'high', 'critical']),
    query('search').optional().trim().escape()
  ]),
  permissionController.getPermissions
);

// Vista previa de cambios
router.post(
  '/preview',
  requirePermission('system.permissions.manage'),
  validate(previewChangesValidation),
  permissionController.previewPermissionChanges
);

// Obtener permisos de un rol
router.get(
  '/role/:roleId',
  requirePermission('system.permissions.manage'),
  validate([param('roleId').isUUID()]),
  permissionController.getRolePermissions
);

// Actualizar permisos de un rol
router.put(
  '/role/:roleId',
  requirePermission('system.permissions.manage'),
  validate([
    param('roleId').isUUID(),
    ...updatePermissionsValidation
  ]),
  permissionController.updateRolePermissions
);

// Obtener permisos de un usuario
router.get(
  '/user/:userId',
  requirePermission('system.permissions.manage'),
  validate([
    param('userId').isUUID(),
    query('community_id').optional().isUUID()
  ]),
  permissionController.getUserPermissions
);

// Actualizar permisos directos de un usuario
router.put(
  '/user/:userId',
  requirePermission('system.permissions.manage'),
  validate([
    param('userId').isUUID(),
    ...updateUserPermissionsValidation
  ]),
  permissionController.updateUserPermissions
);

// Obtener historial de cambios
router.get(
  '/history/:type/:id',
  requirePermission('system.permissions.manage', 'system.audit.view'),
  validate([
    param('type').isIn(['role', 'user']),
    param('id').isUUID(),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ]),
  permissionController.getPermissionHistory
);

// Plantillas de permisos
router.post(
  '/templates',
  requirePermission('system.permissions.manage'),
  validate([
    body('name').trim().notEmpty(),
    body('description').optional().trim(),
    body('permissions').isArray(),
    body('category').optional().trim()
  ]),
  permissionController.createPermissionTemplate
);

router.post(
  '/templates/:templateId/apply',
  requirePermission('system.permissions.manage'),
  validate([
    param('templateId').isUUID(),
    body('target_type').isIn(['role', 'user']),
    body('target_id').isUUID()
  ]),
  permissionController.applyPermissionTemplate
);

export default router;
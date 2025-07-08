import { Router } from 'express';
import { userController } from '../controllers/userController';
import { 
  authenticate, 
  requirePermission, 
  requireRole,
  userRateLimit 
} from '../middleware/auth';
import { validate } from '../middleware/validate';
import { body, param, query } from 'express-validator';
import multer from 'multer';

const router = Router();

// Configuración de multer para avatar
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'));
    }
  }
});

// Aplicar autenticación a todas las rutas
router.use(authenticate);

// Validaciones
const createUserValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('El username debe tener entre 3 y 50 caracteres')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('El username solo puede contener letras, números, guiones y guiones bajos'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una mayúscula, una minúscula y un número'),
  body('first_name')
    .trim()
    .notEmpty()
    .withMessage('El nombre es requerido'),
  body('last_name')
    .trim()
    .notEmpty()
    .withMessage('El apellido es requerido'),
  body('phone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Número de teléfono inválido'),
  body('country_id')
    .optional()
    .isUUID()
    .withMessage('ID de país inválido'),
  body('roles')
    .optional()
    .isArray()
    .withMessage('Los roles deben ser un array'),
  body('communities')
    .optional()
    .isArray()
    .withMessage('Las comunidades deben ser un array')
];

const updateUserValidation = [
  param('id').isUUID().withMessage('ID de usuario inválido'),
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('El username debe tener entre 3 y 50 caracteres')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('El username solo puede contener letras, números, guiones y guiones bajos'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  body('first_name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('El nombre no puede estar vacío'),
  body('last_name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('El apellido no puede estar vacío'),
  body('phone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Número de teléfono inválido')
];

const changeStatusValidation = [
  param('id').isUUID().withMessage('ID de usuario inválido'),
  body('status')
    .isIn(['active', 'inactive', 'suspended'])
    .withMessage('Estado inválido'),
  body('reason')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('La razón no puede estar vacía')
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
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'suspended', 'deleted'])
    .withMessage('Estado inválido'),
  query('role')
    .optional()
    .trim(),
  query('community_id')
    .optional()
    .isUUID()
    .withMessage('ID de comunidad inválido'),
  query('sort_by')
    .optional()
    .isIn(['created_at', 'updated_at', 'username', 'email', 'first_name', 'last_name'])
    .withMessage('Campo de ordenamiento inválido'),
  query('sort_order')
    .optional()
    .isIn(['ASC', 'DESC'])
    .withMessage('Orden inválido')
];

// Rutas

// Listar usuarios (requiere permiso de ver usuarios)
router.get(
  '/',
  requirePermission('users.view'),
  validate(queryValidation),
  userRateLimit(60000, 100), // 100 requests por minuto
  userController.getUsers
);

// Exportar usuarios a Excel
router.get(
  '/export',
  requirePermission('users.view', 'reports.export'),
  validate([
    query('community_id').optional().isUUID(),
    query('format').optional().isIn(['xlsx', 'csv'])
  ]),
  userController.exportUsers
);

// Obtener usuario específico
router.get(
  '/:id',
  requirePermission('users.view'),
  validate([param('id').isUUID()]),
  userController.getUser
);

// Obtener permisos del usuario
router.get(
  '/:id/permissions',
  requirePermission('users.view'),
  validate([
    param('id').isUUID(),
    query('community_id').optional().isUUID()
  ]),
  userController.getUserPermissions
);

// Obtener actividad del usuario
router.get(
  '/:id/activity',
  requirePermission('users.view', 'system.audit.view'),
  validate([
    param('id').isUUID(),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ]),
  userController.getUserActivity
);

// Crear usuario (requiere permiso de crear usuarios)
router.post(
  '/',
  requirePermission('users.create'),
  validate(createUserValidation),
  userController.createUser
);

// Actualizar usuario
router.put(
  '/:id',
  requirePermission('users.edit'),
  validate(updateUserValidation),
  userController.updateUser
);

// Cambiar estado del usuario
router.patch(
  '/:id/status',
  requirePermission('users.edit'),
  validate(changeStatusValidation),
  userController.changeUserStatus
);

// Subir avatar
router.post(
  '/:id/avatar',
  requirePermission('users.edit'),
  validate([param('id').isUUID()]),
  upload.single('avatar'),
  userController.uploadAvatar
);

// Resetear contraseña (solo admins)
router.post(
  '/:id/reset-password',
  requirePermission('users.password.reset'),
  validate([
    param('id').isUUID(),
    body('send_email').optional().isBoolean()
  ]),
  userController.resetUserPassword
);

// Eliminar usuario (soft delete)
router.delete(
  '/:id',
  requirePermission('users.delete'),
  validate([param('id').isUUID()]),
  userController.deleteUser
);

// Rutas adicionales para el usuario actual
router.get('/me/profile', (req, res) => {
  res.json({
    success: true,
    data: req.user
  });
});

router.put(
  '/me/profile',
  validate([
    body('first_name').optional().trim().notEmpty(),
    body('last_name').optional().trim().notEmpty(),
    body('phone').optional().matches(/^\+?[1-9]\d{1,14}$/)
  ]),
  async (req, res, next) => {
    req.params.id = req.user!.id;
    userController.updateUser(req, res, next);
  }
);

router.post(
  '/me/avatar',
  upload.single('avatar'),
  async (req, res, next) => {
    req.params.id = req.user!.id;
    userController.uploadAvatar(req, res, next);
  }
);

export default router;
import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  Unique,
  AllowNull,
  BelongsToMany,
  HasMany,
  Scopes
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { User } from './User';
import { UserPermission } from './UserPermission';
import { Role } from './Role';
import { RolePermission } from './RolePermission';

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

@Scopes(() => ({
  byModule: (module: string) => ({
    where: { module }
  }),
  byRiskLevel: (level: RiskLevel) => ({
    where: { risk_level: level }
  }),
  withRoles: {
    include: [{
      model: Role,
      as: 'roles',
      through: {
        attributes: ['granted']
      }
    }]
  },
  withUsers: {
    include: [{
      model: User,
      as: 'users',
      through: {
        attributes: ['granted', 'community_id', 'valid_from', 'valid_until']
      }
    }]
  }
}))
@Table({
  tableName: 'permissions',
  timestamps: true,
  underscored: true
})
export class Permission extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(100))
  code!: string;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  module!: string;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  action!: string;

  @AllowNull(false)
  @Column(DataType.STRING(200))
  name!: string;

  @Column(DataType.TEXT)
  description?: string;

  @Default(RiskLevel.LOW)
  @Column(DataType.ENUM(...Object.values(RiskLevel)))
  risk_level!: RiskLevel;

  @Default([])
  @Column(DataType.JSONB)
  ui_elements!: string[];

  @Default([])
  @Column(DataType.JSONB)
  api_endpoints!: string[];

  @Default([])
  @Column(DataType.JSONB)
  dependencies!: string[];

  @Default({})
  @Column(DataType.JSONB)
  metadata!: any;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  // Asociaciones
  @BelongsToMany(() => Role, () => RolePermission)
  roles?: Role[];

  @BelongsToMany(() => User, () => UserPermission)
  users?: User[];

  @HasMany(() => RolePermission)
  rolePermissions?: RolePermission[];

  @HasMany(() => UserPermission)
  userPermissions?: UserPermission[];

  // Métodos de instancia
  getDependentPermissions(): string[] {
    return this.dependencies || [];
  }

  async checkDependencies(userPermissions: string[]): Promise<boolean> {
    const dependencies = this.getDependentPermissions();
    return dependencies.every(dep => userPermissions.includes(dep));
  }

  isHighRisk(): boolean {
    return this.risk_level === RiskLevel.HIGH || this.risk_level === RiskLevel.CRITICAL;
  }

  getFullCode(): string {
    return `${this.module}.${this.action}`;
  }

  matchesEndpoint(endpoint: string, method: string): boolean {
    return this.api_endpoints.some((ep: any) => {
      if (typeof ep === 'string') {
        return endpoint.includes(ep);
      }
      return ep.path === endpoint && (!ep.method || ep.method === method);
    });
  }

  matchesUIElement(elementId: string): boolean {
    return this.ui_elements.includes(elementId);
  }

  // Métodos estáticos
  static async findByCode(code: string): Promise<Permission | null> {
    return this.findOne({ where: { code } });
  }

  static async findByModule(module: string): Promise<Permission[]> {
    return this.scope({ method: ['byModule', module] }).findAll({
      order: [['name', 'ASC']]
    });
  }

  static async getPermissionTree(): Promise<any> {
    const permissions = await this.findAll({
      order: [['module', 'ASC'], ['name', 'ASC']]
    });

    const tree: any = {};
    
    permissions.forEach(permission => {
      if (!tree[permission.module]) {
        tree[permission.module] = {
          name: permission.module,
          permissions: []
        };
      }
      
      tree[permission.module].permissions.push({
        id: permission.id,
        code: permission.code,
        name: permission.name,
        description: permission.description,
        risk_level: permission.risk_level,
        dependencies: permission.dependencies
      });
    });

    return Object.values(tree);
  }

  static async getByRiskLevel(level: RiskLevel): Promise<Permission[]> {
    return this.scope({ method: ['byRiskLevel', level] }).findAll();
  }

  // Permisos predefinidos por módulo
  static readonly PERMISSIONS = {
    // Módulo de Acceso
    ACCESS: {
      VIEW: 'access.view',
      OPEN_DOORS: 'access.doors.open',
      AUTHORIZE_VISITORS: 'access.visitors.authorize',
      MANAGE_WORKERS: 'access.workers.manage',
      VIEW_LOGS: 'access.logs.view',
      EMERGENCY_OVERRIDE: 'access.emergency.override'
    },
    
    // Módulo Financiero
    FINANCIAL: {
      VIEW_EXPENSES: 'financial.expenses.view',
      PAY_ONLINE: 'financial.pay.online',
      VIEW_DETAILS: 'financial.details.view',
      VIEW_OTHERS: 'financial.others.view',
      MANAGE_ACCOUNTS: 'financial.accounts.manage',
      GENERATE_REPORTS: 'financial.reports.generate'
    },
    
    // Módulo de Transparencia
    TRANSPARENCY: {
      VIEW_GENERAL: 'transparency.general.view',
      VIEW_CONTRACTS: 'transparency.contracts.view',
      DOWNLOAD_REPORTS: 'transparency.reports.download',
      VIEW_PROVIDERS: 'transparency.providers.view'
    },
    
    // Módulo de Usuarios
    USERS: {
      VIEW: 'users.view',
      CREATE: 'users.create',
      EDIT: 'users.edit',
      DELETE: 'users.delete',
      MANAGE_ROLES: 'users.roles.manage',
      RESET_PASSWORD: 'users.password.reset'
    },
    
    // Módulo de Comunidades
    COMMUNITIES: {
      VIEW: 'communities.view',
      CREATE: 'communities.create',
      EDIT: 'communities.edit',
      DELETE: 'communities.delete',
      MANAGE_FEATURES: 'communities.features.manage',
      MANAGE_MEMBERS: 'communities.members.manage'
    },
    
    // Módulo de Dispositivos
    DEVICES: {
      VIEW: 'devices.view',
      CONTROL: 'devices.control',
      CONFIGURE: 'devices.configure',
      MAINTENANCE: 'devices.maintenance',
      FIRMWARE_UPDATE: 'devices.firmware.update'
    },
    
    // Módulo de Notificaciones
    NOTIFICATIONS: {
      SEND: 'notifications.send',
      SEND_MASS: 'notifications.mass.send',
      MANAGE_TEMPLATES: 'notifications.templates.manage',
      VIEW_HISTORY: 'notifications.history.view'
    },
    
    // Módulo de Reportes
    REPORTS: {
      VIEW_BASIC: 'reports.basic.view',
      VIEW_ADVANCED: 'reports.advanced.view',
      EXPORT: 'reports.export',
      SCHEDULE: 'reports.schedule',
      CREATE_CUSTOM: 'reports.custom.create'
    },
    
    // Módulo de Sistema
    SYSTEM: {
      VIEW_AUDIT: 'system.audit.view',
      MANAGE_PERMISSIONS: 'system.permissions.manage',
      MANAGE_FEATURES: 'system.features.manage',
      BACKUP: 'system.backup',
      RESTORE: 'system.restore',
      CONFIGURE: 'system.configure'
    }
  };
}
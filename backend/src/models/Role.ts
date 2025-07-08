import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  Unique,
  AllowNull,
  BelongsTo,
  BelongsToMany,
  HasMany,
  ForeignKey,
  Scopes
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { User } from './User';
import { UserRole } from './UserRole';
import { Permission } from './Permission';
import { RolePermission } from './RolePermission';

@Scopes(() => ({
  withPermissions: {
    include: [{
      model: Permission,
      as: 'permissions',
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
        attributes: ['community_id', 'valid_from', 'valid_until', 'is_active']
      }
    }]
  },
  systemRoles: {
    where: {
      is_system: true
    }
  },
  communityRoles: {
    where: {
      is_community: true
    }
  }
}))
@Table({
  tableName: 'roles',
  timestamps: true,
  underscored: true
})
export class Role extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(50))
  code!: string;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  name!: string;

  @Column(DataType.TEXT)
  description?: string;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  level!: number; // 1-11 según jerarquía

  @Default(false)
  @Column(DataType.BOOLEAN)
  is_system!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  is_community!: boolean;

  @ForeignKey(() => Role)
  @Column(DataType.UUID)
  parent_role_id?: string;

  @Default({})
  @Column(DataType.JSONB)
  metadata!: any;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  // Asociaciones
  @BelongsTo(() => Role, 'parent_role_id')
  parentRole?: Role;

  @HasMany(() => Role, 'parent_role_id')
  childRoles?: Role[];

  @BelongsToMany(() => User, () => UserRole)
  users?: User[];

  @BelongsToMany(() => Permission, () => RolePermission)
  permissions?: Permission[];

  @HasMany(() => UserRole)
  userRoles?: UserRole[];

  @HasMany(() => RolePermission)
  rolePermissions?: RolePermission[];

  // Métodos de instancia
  async getPermissions(): Promise<Permission[]> {
    const rolePermissions = await RolePermission.findAll({
      where: {
        role_id: this.id,
        granted: true
      },
      include: [{
        model: Permission,
        as: 'permission'
      }]
    });

    return rolePermissions.map(rp => rp.permission!).filter(p => p);
  }

  async hasPermission(permissionCode: string): Promise<boolean> {
    const permissions = await this.getPermissions();
    return permissions.some(p => p.code === permissionCode);
  }

  async addPermission(permissionId: string, granted: boolean = true): Promise<void> {
    await RolePermission.upsert({
      role_id: this.id,
      permission_id: permissionId,
      granted
    });
  }

  async removePermission(permissionId: string): Promise<void> {
    await RolePermission.destroy({
      where: {
        role_id: this.id,
        permission_id: permissionId
      }
    });
  }

  async getInheritedPermissions(): Promise<Permission[]> {
    const allPermissions: Permission[] = await this.getPermissions();

    if (this.parent_role_id) {
      const parentRole = await Role.findByPk(this.parent_role_id);
      if (parentRole) {
        const parentPermissions = await parentRole.getInheritedPermissions();
        allPermissions.push(...parentPermissions);
      }
    }

    // Eliminar duplicados
    return Array.from(
      new Map(allPermissions.map(p => [p.id, p])).values()
    );
  }

  isHigherThan(otherRole: Role): boolean {
    return this.level < otherRole.level;
  }

  isLowerThan(otherRole: Role): boolean {
    return this.level > otherRole.level;
  }

  canManage(otherRole: Role): boolean {
    // Un rol puede gestionar roles de menor jerarquía
    return this.isHigherThan(otherRole);
  }

  // Métodos estáticos
  static async findByCode(code: string): Promise<Role | null> {
    return this.findOne({ where: { code } });
  }

  static async getSystemRoles(): Promise<Role[]> {
    return this.scope('systemRoles').findAll({
      order: [['level', 'ASC']]
    });
  }

  static async getCommunityRoles(): Promise<Role[]> {
    return this.scope('communityRoles').findAll({
      order: [['level', 'ASC']]
    });
  }

  static async getRoleHierarchy(): Promise<Role[]> {
    return this.findAll({
      where: { parent_role_id: null },
      include: [{
        model: Role,
        as: 'childRoles',
        include: [{
          model: Role,
          as: 'childRoles'
        }]
      }],
      order: [['level', 'ASC']]
    });
  }

  // Roles predefinidos del sistema
  static readonly SYSTEM_ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    SYSTEM_ADMIN: 'SYSTEM_ADMIN',
    FINANCIAL_ADMIN: 'FINANCIAL_ADMIN',
    HARDWARE_ADMIN: 'HARDWARE_ADMIN',
    SECURITY_ADMIN: 'SECURITY_ADMIN',
    AUDIT_ADMIN: 'AUDIT_ADMIN',
    OPERATIONS_MANAGER: 'OPERATIONS_MANAGER',
    COMMUNITY_MANAGER: 'COMMUNITY_MANAGER',
    SUPPORT_SUPERVISOR: 'SUPPORT_SUPERVISOR',
    SUPPORT_AGENT: 'SUPPORT_AGENT',
    REPORT_VIEWER: 'REPORT_VIEWER'
  };

  // Roles predefinidos de comunidad
  static readonly COMMUNITY_ROLES = {
    COMMUNITY_ADMIN: 'COMMUNITY_ADMIN',
    BOARD_PRESIDENT: 'BOARD_PRESIDENT',
    TREASURER: 'TREASURER',
    BOARD_MEMBER: 'BOARD_MEMBER',
    SECURITY_CHIEF: 'SECURITY_CHIEF',
    SECURITY_GUARD: 'SECURITY_GUARD',
    MAINTENANCE_CHIEF: 'MAINTENANCE_CHIEF',
    STAFF: 'STAFF',
    OWNER: 'OWNER',
    TENANT: 'TENANT',
    AUTHORIZED_PERSON: 'AUTHORIZED_PERSON'
  };
}
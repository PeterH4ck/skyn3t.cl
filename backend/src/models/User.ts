import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  Unique,
  AllowNull,
  BeforeCreate,
  BeforeUpdate,
  HasMany,
  BelongsTo,
  BelongsToMany,
  ForeignKey,
  Scopes,
  DefaultScope
} from 'sequelize-typescript';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { Role } from './Role';
import { UserRole } from './UserRole';
import { Permission } from './Permission';
import { UserPermission } from './UserPermission';
import { Community } from './Community';
import { CommunityMember } from './CommunityMember';
import { Vehicle } from './Vehicle';
import { AccessLog } from './AccessLog';
import { Invitation } from './Invitation';
import { AuditLog } from './AuditLog';
import { UserSession } from './UserSession';
import { Country } from './Country';

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  DELETED = 'deleted'
}

@DefaultScope(() => ({
  attributes: {
    exclude: ['password_hash', 'two_factor_secret', 'deleted_at']
  }
}))
@Scopes(() => ({
  withPassword: {
    attributes: {
      include: ['password_hash']
    }
  },
  withDeleted: {
    paranoid: false
  },
  active: {
    where: {
      status: UserStatus.ACTIVE
    }
  },
  withRoles: {
    include: [{
      model: Role,
      as: 'roles',
      through: {
        attributes: ['community_id', 'valid_from', 'valid_until', 'is_active']
      }
    }]
  },
  withPermissions: {
    include: [{
      model: Permission,
      as: 'permissions',
      through: {
        attributes: ['community_id', 'granted', 'valid_from', 'valid_until']
      }
    }]
  },
  withCommunities: {
    include: [{
      model: Community,
      as: 'communities',
      through: {
        attributes: ['member_type', 'unit_id', 'valid_from', 'valid_until', 'is_active']
      }
    }]
  }
}))
@Table({
  tableName: 'users',
  timestamps: true,
  paranoid: true,
  underscored: true
})
export class User extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(50))
  username!: string;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(255))
  email!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  password_hash!: string;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  first_name!: string;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  last_name!: string;

  @Column(DataType.STRING(20))
  phone?: string;

  @ForeignKey(() => Country)
  @Column(DataType.UUID)
  country_id?: string;

  @Default(UserStatus.ACTIVE)
  @Column(DataType.ENUM(...Object.values(UserStatus)))
  status!: UserStatus;

  @Column(DataType.STRING(500))
  avatar_url?: string;

  @Column(DataType.DATE)
  last_login?: Date;

  @Default(0)
  @Column(DataType.INTEGER)
  failed_login_attempts!: number;

  @Column(DataType.DATE)
  locked_until?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  email_verified!: boolean;

  @Column(DataType.DATE)
  email_verified_at?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  two_factor_enabled!: boolean;

  @Column(DataType.STRING(255))
  two_factor_secret?: string;

  @Default({})
  @Column(DataType.JSONB)
  metadata!: any;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  @Column(DataType.DATE)
  deleted_at?: Date;

  // Asociaciones
  @BelongsTo(() => Country)
  country?: Country;

  @BelongsToMany(() => Role, () => UserRole)
  roles?: Role[];

  @BelongsToMany(() => Permission, () => UserPermission)
  permissions?: Permission[];

  @BelongsToMany(() => Community, () => CommunityMember)
  communities?: Community[];

  @HasMany(() => Vehicle, { foreignKey: 'owner_id' })
  vehicles?: Vehicle[];

  @HasMany(() => AccessLog, { foreignKey: 'user_id' })
  accessLogs?: AccessLog[];

  @HasMany(() => Invitation, { foreignKey: 'host_id' })
  invitations?: Invitation[];

  @HasMany(() => AuditLog, { foreignKey: 'user_id' })
  auditLogs?: AuditLog[];

  @HasMany(() => UserSession, { foreignKey: 'user_id' })
  sessions?: UserSession[];

  // Hooks
  @BeforeCreate
  static async hashPasswordBeforeCreate(user: User) {
    if (user.password_hash && !user.password_hash.startsWith('$2')) {
      user.password_hash = await bcrypt.hash(user.password_hash, 10);
    }
  }

  @BeforeUpdate
  static async hashPasswordBeforeUpdate(user: User) {
    if (user.changed('password_hash') && user.password_hash && !user.password_hash.startsWith('$2')) {
      user.password_hash = await bcrypt.hash(user.password_hash, 10);
    }
  }

  // Métodos de instancia
  get fullName(): string {
    return `${this.first_name} ${this.last_name}`;
  }

  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password_hash);
  }

  async updatePassword(newPassword: string): Promise<void> {
    this.password_hash = await bcrypt.hash(newPassword, 10);
    await this.save();
  }

  isLocked(): boolean {
    return this.locked_until ? new Date() < new Date(this.locked_until) : false;
  }

  async incrementFailedAttempts(): Promise<void> {
    this.failed_login_attempts += 1;
    
    // Bloquear después de 5 intentos fallidos
    if (this.failed_login_attempts >= 5) {
      const lockTime = new Date();
      lockTime.setMinutes(lockTime.getMinutes() + 30); // Bloquear por 30 minutos
      this.locked_until = lockTime;
    }
    
    await this.save();
  }

  async resetFailedAttempts(): Promise<void> {
    this.failed_login_attempts = 0;
    this.locked_until = null;
    await this.save();
  }

  async recordLogin(ip?: string): Promise<void> {
    this.last_login = new Date();
    await this.resetFailedAttempts();
  }

  async getRolesByCommunity(communityId?: string): Promise<Role[]> {
    const userRoles = await UserRole.findAll({
      where: {
        user_id: this.id,
        ...(communityId ? { community_id: communityId } : { community_id: null }),
        is_active: true
      },
      include: [{
        model: Role,
        as: 'role'
      }]
    });

    return userRoles.map(ur => ur.role!).filter(role => role);
  }

  async getEffectivePermissions(communityId?: string): Promise<Permission[]> {
    // Obtener permisos de roles
    const roles = await this.getRolesByCommunity(communityId);
    const rolePermissions: Permission[] = [];
    
    for (const role of roles) {
      const perms = await role.getPermissions();
      rolePermissions.push(...perms);
    }

    // Obtener permisos directos del usuario
    const userPermissions = await UserPermission.findAll({
      where: {
        user_id: this.id,
        ...(communityId ? { community_id: communityId } : {}),
        granted: true
      },
      include: [{
        model: Permission,
        as: 'permission'
      }]
    });

    const directPermissions = userPermissions.map(up => up.permission!).filter(p => p);

    // Combinar y eliminar duplicados
    const allPermissions = [...rolePermissions, ...directPermissions];
    const uniquePermissions = Array.from(
      new Map(allPermissions.map(p => [p.id, p])).values()
    );

    return uniquePermissions;
  }

  async hasPermission(permissionCode: string, communityId?: string): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(communityId);
    return permissions.some(p => p.code === permissionCode);
  }

  async hasAnyPermission(permissionCodes: string[], communityId?: string): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(communityId);
    const userPermCodes = permissions.map(p => p.code);
    return permissionCodes.some(code => userPermCodes.includes(code));
  }

  async hasAllPermissions(permissionCodes: string[], communityId?: string): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(communityId);
    const userPermCodes = permissions.map(p => p.code);
    return permissionCodes.every(code => userPermCodes.includes(code));
  }

  async hasRole(roleCode: string, communityId?: string): Promise<boolean> {
    const roles = await this.getRolesByCommunity(communityId);
    return roles.some(r => r.code === roleCode);
  }

  async isMemberOfCommunity(communityId: string): Promise<boolean> {
    const membership = await CommunityMember.findOne({
      where: {
        user_id: this.id,
        community_id: communityId,
        is_active: true
      }
    });

    return !!membership;
  }

  toJSON() {
    const values = super.toJSON() as any;
    
    // Eliminar campos sensibles
    delete values.password_hash;
    delete values.two_factor_secret;
    delete values.deleted_at;
    
    // Agregar campos computados
    values.full_name = this.fullName;
    values.is_locked = this.isLocked();
    
    return values;
  }

  // Métodos estáticos
  static async findByEmail(email: string): Promise<User | null> {
    return this.scope('withPassword').findOne({ where: { email } });
  }

  static async findByUsername(username: string): Promise<User | null> {
    return this.scope('withPassword').findOne({ where: { username } });
  }

  static async findActiveById(id: string): Promise<User | null> {
    return this.scope('active').findByPk(id);
  }

  static async findWithFullDetails(id: string): Promise<User | null> {
    return this.scope(['withRoles', 'withPermissions', 'withCommunities']).findByPk(id);
  }
}
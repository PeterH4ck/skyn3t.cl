// backend/src/models/UserRole.ts
import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  BelongsTo,
  ForeignKey
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { User } from './User';
import { Role } from './Role';
import { Community } from './Community';

@Table({
  tableName: 'user_roles',
  timestamps: true,
  underscored: true
})
export class UserRole extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  user_id!: string;

  @ForeignKey(() => Role)
  @Column(DataType.UUID)
  role_id!: string;

  @ForeignKey(() => Community)
  @Column(DataType.UUID)
  community_id?: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  assigned_by?: string;

  @Default(() => new Date())
  @Column(DataType.DATE)
  valid_from!: Date;

  @Column(DataType.DATE)
  valid_until?: Date;

  @Default(true)
  @Column(DataType.BOOLEAN)
  is_active!: boolean;

  @Column(DataType.DATE)
  created_at!: Date;

  // Asociaciones
  @BelongsTo(() => User, 'user_id')
  user?: User;

  @BelongsTo(() => Role)
  role?: Role;

  @BelongsTo(() => Community)
  community?: Community;

  @BelongsTo(() => User, 'assigned_by')
  assigner?: User;

  // Métodos
  isValid(): boolean {
    const now = new Date();
    return this.is_active && 
           now >= this.valid_from && 
           (!this.valid_until || now <= this.valid_until);
  }
}

// backend/src/models/RolePermission.ts
@Table({
  tableName: 'role_permissions',
  timestamps: true,
  underscored: true
})
export class RolePermission extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Role)
  @Column(DataType.UUID)
  role_id!: string;

  @ForeignKey(() => Permission)
  @Column(DataType.UUID)
  permission_id!: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  granted!: boolean;

  @Column(DataType.DATE)
  created_at!: Date;

  // Asociaciones
  @BelongsTo(() => Role)
  role?: Role;

  @BelongsTo(() => Permission)
  permission?: Permission;
}

// backend/src/models/UserPermission.ts
@Table({
  tableName: 'user_permissions',
  timestamps: true,
  underscored: true
})
export class UserPermission extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  user_id!: string;

  @ForeignKey(() => Permission)
  @Column(DataType.UUID)
  permission_id!: string;

  @ForeignKey(() => Community)
  @Column(DataType.UUID)
  community_id?: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  granted!: boolean;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  granted_by?: string;

  @Column(DataType.TEXT)
  reason?: string;

  @Default(() => new Date())
  @Column(DataType.DATE)
  valid_from!: Date;

  @Column(DataType.DATE)
  valid_until?: Date;

  @Column(DataType.DATE)
  created_at!: Date;

  // Asociaciones
  @BelongsTo(() => User, 'user_id')
  user?: User;

  @BelongsTo(() => Permission)
  permission?: Permission;

  @BelongsTo(() => Community)
  community?: Community;

  @BelongsTo(() => User, 'granted_by')
  granter?: User;

  // Métodos
  isValid(): boolean {
    const now = new Date();
    return this.granted && 
           now >= this.valid_from && 
           (!this.valid_until || now <= this.valid_until);
  }
}

// backend/src/models/CommunityMember.ts
@Table({
  tableName: 'community_members',
  timestamps: true,
  underscored: true
})
export class CommunityMember extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Community)
  @Column(DataType.UUID)
  community_id!: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  user_id!: string;

  @ForeignKey(() => Unit)
  @Column(DataType.UUID)
  unit_id?: string;

  @Column(DataType.STRING(50))
  member_type!: string; // 'owner', 'tenant', 'family', 'staff', 'visitor'

  @Column(DataType.STRING(100))
  relationship?: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  authorized_by?: string;

  @Default(() => new Date())
  @Column(DataType.DATE)
  valid_from!: Date;

  @Column(DataType.DATE)
  valid_until?: Date;

  @Default({})
  @Column(DataType.JSONB)
  metadata!: any;

  @Default(true)
  @Column(DataType.BOOLEAN)
  is_active!: boolean;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  // Asociaciones
  @BelongsTo(() => Community)
  community?: Community;

  @BelongsTo(() => User, 'user_id')
  user?: User;

  @BelongsTo(() => Unit)
  unit?: Unit;

  @BelongsTo(() => User, 'authorized_by')
  authorizer?: User;
}

// backend/src/models/CommunityFeature.ts
@Table({
  tableName: 'community_features',
  timestamps: true,
  underscored: true
})
export class CommunityFeature extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Community)
  @Column(DataType.UUID)
  community_id!: string;

  @ForeignKey(() => Feature)
  @Column(DataType.UUID)
  feature_id!: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  enabled!: boolean;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  enabled_by?: string;

  @Default({})
  @Column(DataType.JSONB)
  custom_settings!: any;

  @Default(() => new Date())
  @Column(DataType.DATE)
  valid_from!: Date;

  @Column(DataType.DATE)
  valid_until?: Date;

  @Column(DataType.DATE)
  created_at!: Date;

  // Asociaciones
  @BelongsTo(() => Community)
  community?: Community;

  @BelongsTo(() => Feature)
  feature?: Feature;

  @BelongsTo(() => User)
  enabler?: User;

  // Métodos
  isActive(): boolean {
    const now = new Date();
    return this.enabled && 
           now >= this.valid_from && 
           (!this.valid_until || now <= this.valid_until);
  }
}
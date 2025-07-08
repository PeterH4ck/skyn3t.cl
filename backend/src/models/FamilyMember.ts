import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  AllowNull,
  BelongsTo,
  ForeignKey,
  Unique
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { CommunityMember } from './CommunityMember';
import { User } from './User';

@Table({
  tableName: 'family_members',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['primary_member_id', 'user_id']
    },
    {
      fields: ['primary_member_id']
    },
    {
      fields: ['user_id']
    }
  ]
})
export class FamilyMember extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => CommunityMember)
  @AllowNull(false)
  @Column(DataType.UUID)
  primary_member_id!: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  user_id!: string;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  relationship!: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  is_minor!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  guardian_consent!: boolean;

  @Column(DataType.DATE)
  guardian_consent_date?: Date;

  @Column(DataType.TEXT)
  special_needs?: string;

  @Column(DataType.TEXT)
  medical_conditions?: string;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  // Associations
  @BelongsTo(() => CommunityMember)
  primaryMember?: CommunityMember;

  @BelongsTo(() => User)
  user?: User;
}

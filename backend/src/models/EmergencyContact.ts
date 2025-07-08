import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  AllowNull,
  BelongsTo,
  ForeignKey
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { CommunityMember } from './CommunityMember';

@Table({
  tableName: 'emergency_contacts',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['community_member_id']
    },
    {
      fields: ['is_primary']
    }
  ]
})
export class EmergencyContact extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => CommunityMember)
  @AllowNull(false)
  @Column(DataType.UUID)
  community_member_id!: string;

  @AllowNull(false)
  @Column(DataType.STRING(200))
  name!: string;

  @Column(DataType.STRING(50))
  relationship?: string;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  phone!: string;

  @Column(DataType.STRING(255))
  email?: string;

  @Column(DataType.TEXT)
  address?: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  is_primary!: boolean;

  @Column(DataType.TEXT)
  notes?: string;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  // Associations
  @BelongsTo(() => CommunityMember)
  communityMember?: CommunityMember;
}

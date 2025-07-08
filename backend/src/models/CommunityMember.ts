import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  AllowNull,
  BelongsTo,
  HasMany,
  ForeignKey,
  Index,
  Unique
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Community } from './Community';
import { User } from './User';
import { Unit } from './Unit';
import { EmergencyContact } from './EmergencyContact';
import { FamilyMember } from './FamilyMember';

export enum MemberType {
  OWNER = 'owner',
  TENANT = 'tenant',
  FAMILY = 'family',
  STAFF = 'staff',
  AUTHORIZED_PERSON = 'authorized_person'
}

export enum Relationship {
  SPOUSE = 'spouse',
  CHILD = 'child',
  PARENT = 'parent',
  SIBLING = 'sibling',
  RELATIVE = 'relative',
  EMPLOYEE = 'employee',
  AUTHORIZED = 'authorized',
  OTHER = 'other'
}

@Table({
  tableName: 'community_members',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['community_id', 'user_id']
    },
    {
      fields: ['community_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['unit_id']
    },
    {
      fields: ['member_type']
    },
    {
      fields: ['is_active']
    }
  ]
})
export class CommunityMember extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Community)
  @AllowNull(false)
  @Column(DataType.UUID)
  community_id!: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  user_id!: string;

  @ForeignKey(() => Unit)
  @Column(DataType.UUID)
  unit_id?: string;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(MemberType)))
  member_type!: MemberType;

  @Column(DataType.ENUM(...Object.values(Relationship)))
  relationship?: Relationship;

  @Column(DataType.DATE)
  move_in_date?: Date;

  @Column(DataType.DATE)
  move_out_date?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  is_primary_resident!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  emergency_contact!: boolean;

  @Default(2)
  @Column(DataType.INTEGER)
  vehicle_limit!: number;

  @Default(5)
  @Column(DataType.INTEGER)
  guest_limit_per_day!: number;

  @Column(DataType.JSONB)
  access_permissions?: {
    common_areas?: string[];
    restricted_areas?: string[];
    time_restrictions?: {
      start_time?: string;
      end_time?: string;
      days_of_week?: number[];
    };
    special_permissions?: string[];
  };

  @Column(DataType.JSONB)
  contact_preferences?: {
    emergency_notifications?: boolean;
    community_announcements?: boolean;
    maintenance_updates?: boolean;
    financial_notifications?: boolean;
    preferred_language?: string;
    preferred_channels?: string[];
  };

  @Column(DataType.TEXT)
  notes?: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  is_active!: boolean;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  // Associations
  @BelongsTo(() => Community)
  community?: Community;

  @BelongsTo(() => User)
  user?: User;

  @BelongsTo(() => Unit)
  unit?: Unit;

  @HasMany(() => EmergencyContact, { foreignKey: 'community_member_id' })
  emergencyContacts?: EmergencyContact[];

  @HasMany(() => FamilyMember, { foreignKey: 'primary_member_id' })
  familyMembers?: FamilyMember[];

  // Instance methods
  get displayName(): string {
    return this.user?.fullName || 'Unknown User';
  }

  get membershipStatus(): 'current' | 'future' | 'past' {
    const now = new Date();
    
    if (this.move_out_date && now > this.move_out_date) {
      return 'past';
    }
    
    if (this.move_in_date && now < this.move_in_date) {
      return 'future';
    }
    
    return 'current';
  }

  get residencyDuration(): number | null {
    if (!this.move_in_date) return null;
    
    const endDate = this.move_out_date || new Date();
    const diffTime = endDate.getTime() - this.move_in_date.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  async isCurrentlyResident(): Promise<boolean> {
    if (!this.is_active) return false;
    
    const now = new Date();
    
    if (this.move_in_date && now < this.move_in_date) return false;
    if (this.move_out_date && now > this.move_out_date) return false;
    
    return true;
  }

  async getFamilyMembers(): Promise<FamilyMember[]> {
    return FamilyMember.findAll({
      where: { primary_member_id: this.id },
      include: ['user']
    });
  }

  async getEmergencyContacts(): Promise<EmergencyContact[]> {
    return EmergencyContact.findAll({
      where: { community_member_id: this.id },
      order: [['is_primary', 'DESC'], ['name', 'ASC']]
    });
  }

  async canInviteGuests(): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // This would check against invitations table
    // For now, assume they can invite
    return this.is_active && await this.isCurrentlyResident();
  }

  async hasAccessToArea(areaId: string): Promise<boolean> {
    if (!this.access_permissions?.common_areas) return true;
    
    // Check if area is in allowed list
    if (this.access_permissions.common_areas.includes(areaId)) return true;
    
    // Check if area is in restricted list
    if (this.access_permissions.restricted_areas?.includes(areaId)) return false;
    
    return true;
  }

  async checkTimeRestrictions(): Promise<boolean> {
    if (!this.access_permissions?.time_restrictions) return true;
    
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);
    const currentDay = now.getDay();
    
    const restrictions = this.access_permissions.time_restrictions;
    
    // Check day of week
    if (restrictions.days_of_week && 
        !restrictions.days_of_week.includes(currentDay)) {
      return false;
    }
    
    // Check time range
    if (restrictions.start_time && restrictions.end_time) {
      if (currentTime < restrictions.start_time || 
          currentTime > restrictions.end_time) {
        return false;
      }
    }
    
    return true;
  }

  // Static methods
  static async findByCommunity(
    communityId: string,
    includeInactive: boolean = false
  ): Promise<CommunityMember[]> {
    const where: any = { community_id: communityId };
    if (!includeInactive) where.is_active = true;

    return this.findAll({
      where,
      include: ['user', 'unit'],
      order: [['user', 'first_name', 'ASC']]
    });
  }

  static async findByUnit(unitId: string): Promise<CommunityMember[]> {
    return this.findAll({
      where: { 
        unit_id: unitId,
        is_active: true 
      },
      include: ['user'],
      order: [['is_primary_resident', 'DESC'], ['user', 'first_name', 'ASC']]
    });
  }

  static async findByUser(userId: string): Promise<CommunityMember[]> {
    return this.findAll({
      where: { user_id: userId },
      include: ['community', 'unit']
    });
  }

  static async findPrimaryResident(unitId: string): Promise<CommunityMember | null> {
    return this.findOne({
      where: {
        unit_id: unitId,
        is_primary_resident: true,
        is_active: true
      },
      include: ['user']
    });
  }

  static async findOwners(communityId: string): Promise<CommunityMember[]> {
    return this.findAll({
      where: {
        community_id: communityId,
        member_type: MemberType.OWNER,
        is_active: true
      },
      include: ['user', 'unit']
    });
  }

  static async findByMemberType(
    communityId: string,
    memberType: MemberType
  ): Promise<CommunityMember[]> {
    return this.findAll({
      where: {
        community_id: communityId,
        member_type: memberType,
        is_active: true
      },
      include: ['user', 'unit']
    });
  }

  static async getMembershipStats(communityId: string): Promise<{
    totalMembers: number;
    owners: number;
    tenants: number;
    family: number;
    staff: number;
    occupancyRate: number;
  }> {
    const totalMembers = await this.count({
      where: { community_id: communityId, is_active: true }
    });

    const owners = await this.count({
      where: { 
        community_id: communityId, 
        member_type: MemberType.OWNER,
        is_active: true 
      }
    });

    const tenants = await this.count({
      where: { 
        community_id: communityId, 
        member_type: MemberType.TENANT,
        is_active: true 
      }
    });

    const family = await this.count({
      where: { 
        community_id: communityId, 
        member_type: MemberType.FAMILY,
        is_active: true 
      }
    });

    const staff = await this.count({
      where: { 
        community_id: communityId, 
        member_type: MemberType.STAFF,
        is_active: true 
      }
    });

    // Calculate occupancy rate (would need total units)
    const occupancyRate = 75; // Placeholder

    return {
      totalMembers,
      owners,
      tenants,
      family,
      staff,
      occupancyRate
    };
  }

  toJSON() {
    const values = super.toJSON() as any;
    values.display_name = this.displayName;
    values.membership_status = this.membershipStatus;
    values.residency_duration = this.residencyDuration;
    return values;
  }
}

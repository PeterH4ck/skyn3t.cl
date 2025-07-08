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
  Index
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Community } from './Community';
import { Unit } from './Unit';
import { User } from './User';
import { ServiceProvider } from './ServiceProvider';

export enum MaintenanceCategory {
  PLUMBING = 'plumbing',
  ELECTRICAL = 'electrical',
  HVAC = 'hvac',
  APPLIANCE = 'appliance',
  STRUCTURAL = 'structural',
  CLEANING = 'cleaning',
  LANDSCAPING = 'landscaping',
  SECURITY = 'security',
  OTHER = 'other'
}

export enum MaintenancePriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
  EMERGENCY = 'emergency'
}

export enum MaintenanceStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  ON_HOLD = 'on_hold'
}

@Table({
  tableName: 'maintenance_requests',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['community_id']
    },
    {
      fields: ['unit_id']
    },
    {
      fields: ['requested_by']
    },
    {
      fields: ['assigned_to']
    },
    {
      fields: ['status']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['category']
    },
    {
      fields: ['created_at']
    }
  ]
})
export class MaintenanceRequest extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Community)
  @AllowNull(false)
  @Column(DataType.UUID)
  community_id!: string;

  @ForeignKey(() => Unit)
  @Column(DataType.UUID)
  unit_id?: string;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(MaintenanceCategory)))
  category!: MaintenanceCategory;

  @Default(MaintenancePriority.NORMAL)
  @Column(DataType.ENUM(...Object.values(MaintenancePriority)))
  priority!: MaintenancePriority;

  @AllowNull(false)
  @Column(DataType.STRING(300))
  title!: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  description!: string;

  @Column(DataType.STRING(500))
  location?: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  requested_by!: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  assigned_to?: string;

  @Column(DataType.DATE)
  scheduled_date?: Date;

  @Column(DataType.DATE)
  completed_date?: Date;

  @Default(MaintenanceStatus.PENDING)
  @Column(DataType.ENUM(...Object.values(MaintenanceStatus)))
  status!: MaintenanceStatus;

  @Column(DataType.DECIMAL(10, 2))
  estimated_cost?: number;

  @Column(DataType.DECIMAL(10, 2))
  actual_cost?: number;

  @ForeignKey(() => ServiceProvider)
  @Column(DataType.UUID)
  vendor_id?: string;

  @Column(DataType.JSONB)
  photos?: {
    before?: string[];
    during?: string[];
    after?: string[];
  };

  @Column(DataType.JSONB)
  attachments?: {
    url: string;
    filename: string;
    fileType: string;
    uploadDate: Date;
  }[];

  @Column(DataType.TEXT)
  internal_notes?: string;

  @Column(DataType.TEXT)
  completion_notes?: string;

  @Column(DataType.INTEGER)
  satisfaction_rating?: number; // 1-5

  @Column(DataType.TEXT)
  satisfaction_feedback?: string;

  @Column(DataType.JSONB)
  metadata?: {
    source?: 'app' | 'web' | 'phone' | 'email';
    warranty_claim?: boolean;
    follow_up_required?: boolean;
    recurring?: boolean;
    next_maintenance_date?: Date;
  };

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  // Associations
  @BelongsTo(() => Community)
  community?: Community;

  @BelongsTo(() => Unit)
  unit?: Unit;

  @BelongsTo(() => User, { foreignKey: 'requested_by' })
  requester?: User;

  @BelongsTo(() => User, { foreignKey: 'assigned_to' })
  assignee?: User;

  @BelongsTo(() => ServiceProvider)
  vendor?: ServiceProvider;

  // Instance methods
  get isOverdue(): boolean {
    if (!this.scheduled_date) return false;
    if (this.status === MaintenanceStatus.COMPLETED) return false;
    
    return new Date() > this.scheduled_date;
  }

  get daysOverdue(): number {
    if (!this.isOverdue) return 0;
    
    const diffTime = Date.now() - this.scheduled_date!.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  get estimatedDuration(): number {
    // Return estimated duration in hours based on category and priority
    const baseDuration = {
      [MaintenanceCategory.PLUMBING]: 4,
      [MaintenanceCategory.ELECTRICAL]: 3,
      [MaintenanceCategory.HVAC]: 6,
      [MaintenanceCategory.APPLIANCE]: 2,
      [MaintenanceCategory.STRUCTURAL]: 8,
      [MaintenanceCategory.CLEANING]: 2,
      [MaintenanceCategory.LANDSCAPING]: 4,
      [MaintenanceCategory.SECURITY]: 3,
      [MaintenanceCategory.OTHER]: 3
    };

    const priorityMultiplier = {
      [MaintenancePriority.LOW]: 1.5,
      [MaintenancePriority.NORMAL]: 1,
      [MaintenancePriority.HIGH]: 0.8,
      [MaintenancePriority.URGENT]: 0.5,
      [MaintenancePriority.EMERGENCY]: 0.3
    };

    return baseDuration[this.category] * priorityMultiplier[this.priority];
  }

  get actualDuration(): number | null {
    if (!this.completed_date || !this.scheduled_date) return null;
    
    const diffTime = this.completed_date.getTime() - this.scheduled_date.getTime();
    return diffTime / (1000 * 60 * 60); // Convert to hours
  }

  async assignToUser(userId: string, notes?: string): Promise<void> {
    this.assigned_to = userId;
    this.status = MaintenanceStatus.ASSIGNED;
    if (notes) {
      this.internal_notes = (this.internal_notes || '') + '\n' + notes;
    }
    await this.save();
  }

  async updateStatus(
    newStatus: MaintenanceStatus, 
    notes?: string,
    completionDate?: Date
  ): Promise<void> {
    this.status = newStatus;
    
    if (notes) {
      this.internal_notes = (this.internal_notes || '') + '\n' + notes;
    }
    
    if (newStatus === MaintenanceStatus.COMPLETED) {
      this.completed_date = completionDate || new Date();
    }
    
    await this.save();
  }

  async addPhoto(
    stage: 'before' | 'during' | 'after',
    photoUrl: string
  ): Promise<void> {
    if (!this.photos) {
      this.photos = { before: [], during: [], after: [] };
    }
    
    if (!this.photos[stage]) {
      this.photos[stage] = [];
    }
    
    this.photos[stage]!.push(photoUrl);
    await this.save();
  }

  async addSatisfactionRating(
    rating: number,
    feedback?: string
  ): Promise<void> {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }
    
    this.satisfaction_rating = rating;
    if (feedback) {
      this.satisfaction_feedback = feedback;
    }
    
    await this.save();
  }

  // Static methods
  static async findByCommunity(
    communityId: string,
    filters?: {
      status?: MaintenanceStatus;
      priority?: MaintenancePriority;
      category?: MaintenanceCategory;
      unitId?: string;
      assignedTo?: string;
      dateFrom?: Date;
      dateTo?: Date;
    }
  ): Promise<MaintenanceRequest[]> {
    const where: any = { community_id: communityId };
    
    if (filters) {
      if (filters.status) where.status = filters.status;
      if (filters.priority) where.priority = filters.priority;
      if (filters.category) where.category = filters.category;
      if (filters.unitId) where.unit_id = filters.unitId;
      if (filters.assignedTo) where.assigned_to = filters.assignedTo;
      
      if (filters.dateFrom || filters.dateTo) {
        where.created_at = {};
        if (filters.dateFrom) where.created_at.$gte = filters.dateFrom;
        if (filters.dateTo) where.created_at.$lte = filters.dateTo;
      }
    }

    return this.findAll({
      where,
      include: ['unit', 'requester', 'assignee', 'vendor'],
      order: [['created_at', 'DESC']]
    });
  }

  static async findByUnit(unitId: string): Promise<MaintenanceRequest[]> {
    return this.findAll({
      where: { unit_id: unitId },
      include: ['requester', 'assignee', 'vendor'],
      order: [['created_at', 'DESC']]
    });
  }

  static async findByUser(userId: string): Promise<MaintenanceRequest[]> {
    return this.findAll({
      where: {
        $or: [
          { requested_by: userId },
          { assigned_to: userId }
        ]
      },
      include: ['unit', 'community', 'vendor'],
      order: [['created_at', 'DESC']]
    });
  }

  static async findOverdue(communityId?: string): Promise<MaintenanceRequest[]> {
    const where: any = {
      scheduled_date: { $lt: new Date() },
      status: {
        $not: [MaintenanceStatus.COMPLETED, MaintenanceStatus.CANCELLED]
      }
    };
    
    if (communityId) where.community_id = communityId;

    return this.findAll({
      where,
      include: ['unit', 'requester', 'assignee'],
      order: [['scheduled_date', 'ASC']]
    });
  }

  static async getStats(
    communityId: string,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<{
    total: number;
    byStatus: Record<MaintenanceStatus, number>;
    byCategory: Record<MaintenanceCategory, number>;
    byPriority: Record<MaintenancePriority, number>;
    avgResolutionTime: number;
    avgSatisfactionRating: number;
  }> {
    const where: any = { community_id: communityId };
    
    if (dateFrom || dateTo) {
      where.created_at = {};
      if (dateFrom) where.created_at.$gte = dateFrom;
      if (dateTo) where.created_at.$lte = dateTo;
    }

    const total = await this.count({ where });

    // Get stats by status, category, priority
    const byStatus = {} as Record<MaintenanceStatus, number>;
    const byCategory = {} as Record<MaintenanceCategory, number>;
    const byPriority = {} as Record<MaintenancePriority, number>;

    for (const status of Object.values(MaintenanceStatus)) {
      byStatus[status] = await this.count({ where: { ...where, status } });
    }

    for (const category of Object.values(MaintenanceCategory)) {
      byCategory[category] = await this.count({ where: { ...where, category } });
    }

    for (const priority of Object.values(MaintenancePriority)) {
      byPriority[priority] = await this.count({ where: { ...where, priority } });
    }

    // Calculate averages
    const completed = await this.findAll({
      where: { ...where, status: MaintenanceStatus.COMPLETED },
      attributes: ['satisfaction_rating', 'created_at', 'completed_date']
    });

    let avgResolutionTime = 0;
    let avgSatisfactionRating = 0;

    if (completed.length > 0) {
      const totalResolutionTime = completed.reduce((sum, request) => {
        if (request.completed_date) {
          const resolutionTime = request.completed_date.getTime() - request.created_at.getTime();
          return sum + (resolutionTime / (1000 * 60 * 60 * 24)); // Convert to days
        }
        return sum;
      }, 0);

      const ratingsSum = completed.reduce((sum, request) => {
        return sum + (request.satisfaction_rating || 0);
      }, 0);

      avgResolutionTime = totalResolutionTime / completed.length;
      avgSatisfactionRating = ratingsSum / completed.length;
    }

    return {
      total,
      byStatus,
      byCategory,
      byPriority,
      avgResolutionTime,
      avgSatisfactionRating
    };
  }

  toJSON() {
    const values = super.toJSON() as any;
    values.is_overdue = this.isOverdue;
    values.days_overdue = this.daysOverdue;
    values.estimated_duration = this.estimatedDuration;
    values.actual_duration = this.actualDuration;
    return values;
  }
}

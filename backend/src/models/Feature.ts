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
import { Community } from './Community';
import { CommunityFeature } from './CommunityFeature';

export enum FeatureCategory {
  CORE = 'core',
  STANDARD = 'standard',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
  ADDON = 'addon'
}

@Scopes(() => ({
  active: {
    where: {
      is_active: true
    }
  },
  byCategory: (category: FeatureCategory) => ({
    where: {
      category: category
    }
  }),
  withCommunities: {
    include: [{
      model: Community,
      as: 'communities',
      through: {
        attributes: ['enabled', 'custom_settings', 'valid_from', 'valid_until']
      }
    }]
  },
  ordered: {
    order: [['category', 'ASC'], ['name', 'ASC']]
  }
}))
@Table({
  tableName: 'features',
  timestamps: true,
  underscored: true
})
export class Feature extends Model {
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

  @Default(FeatureCategory.STANDARD)
  @Column(DataType.ENUM(...Object.values(FeatureCategory)))
  category!: FeatureCategory;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  monthly_price!: number;

  @Default([])
  @Column(DataType.JSONB)
  required_permissions!: string[];

  @Default([])
  @Column(DataType.JSONB)
  ui_modules!: string[];

  @Default([])
  @Column(DataType.JSONB)
  api_modules!: string[];

  @Default([])
  @Column(DataType.JSONB)
  dependencies!: string[];

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
  @BelongsToMany(() => Community, () => CommunityFeature)
  communities?: Community[];

  @HasMany(() => CommunityFeature)
  communityFeatures?: CommunityFeature[];

  // Métodos de instancia
  getDependentFeatures(): string[] {
    return this.dependencies || [];
  }

  hasAllDependencies(enabledFeatures: string[]): boolean {
    return this.dependencies.every(dep => enabledFeatures.includes(dep));
  }

  getDefaultSettings(): any {
    return this.metadata?.default_settings || {};
  }

  getLimits(): any {
    return this.metadata?.limits || {};
  }

  isIncludedInCategory(category: FeatureCategory): boolean {
    const categoryHierarchy = {
      [FeatureCategory.CORE]: 0,
      [FeatureCategory.STANDARD]: 1,
      [FeatureCategory.PREMIUM]: 2,
      [FeatureCategory.ENTERPRISE]: 3,
      [FeatureCategory.ADDON]: 4
    };

    return categoryHierarchy[this.category] <= categoryHierarchy[category];
  }

  // Métodos estáticos
  static async findByCode(code: string): Promise<Feature | null> {
    return this.findOne({ where: { code } });
  }

  static async getByCategory(category: FeatureCategory): Promise<Feature[]> {
    return this.scope(['active', { method: ['byCategory', category] }, 'ordered']).findAll();
  }

  static async getFeatureTree(): Promise<any> {
    const features = await this.scope(['active', 'ordered']).findAll();

    const tree = features.reduce((acc: any, feature) => {
      if (!acc[feature.category]) {
        acc[feature.category] = {
          name: feature.category,
          features: []
        };
      }

      acc[feature.category].features.push({
        id: feature.id,
        code: feature.code,
        name: feature.name,
        description: feature.description,
        price: feature.monthly_price,
        dependencies: feature.dependencies
      });

      return acc;
    }, {});

    return Object.values(tree);
  }

  static async calculatePrice(featureCodes: string[]): Promise<number> {
    const features = await this.findAll({
      where: {
        code: featureCodes,
        is_active: true
      }
    });

    return features.reduce((total, feature) => {
      return total + parseFloat(feature.monthly_price.toString());
    }, 0);
  }

  // Features predefinidas del sistema
  static readonly FEATURES = {
    // Core (incluido en todos los planes)
    ACCESS_CONTROL: 'ACCESS_CONTROL',
    USER_MANAGEMENT: 'USER_MANAGEMENT',
    BASIC_REPORTS: 'BASIC_REPORTS',
    
    // Standard
    INVITATION_SYSTEM: 'INVITATION_SYSTEM',
    VEHICLE_REGISTRY: 'VEHICLE_REGISTRY',
    VISITOR_MANAGEMENT: 'VISITOR_MANAGEMENT',
    BASIC_NOTIFICATIONS: 'BASIC_NOTIFICATIONS',
    
    // Premium
    FINANCIAL_MODULE: 'FINANCIAL_MODULE',
    TRANSPARENCY_PORTAL: 'TRANSPARENCY_PORTAL',
    ADVANCED_REPORTS: 'ADVANCED_REPORTS',
    MASS_COMMUNICATIONS: 'MASS_COMMUNICATIONS',
    PAYMENT_GATEWAY: 'PAYMENT_GATEWAY',
    
    // Enterprise
    FACIAL_RECOGNITION: 'FACIAL_RECOGNITION',
    LICENSE_PLATE_RECOGNITION: 'LICENSE_PLATE_RECOGNITION',
    IOT_INTEGRATION: 'IOT_INTEGRATION',
    API_ACCESS: 'API_ACCESS',
    CUSTOM_BRANDING: 'CUSTOM_BRANDING',
    MULTI_BUILDING: 'MULTI_BUILDING',
    
    // Add-ons
    SMS_NOTIFICATIONS: 'SMS_NOTIFICATIONS',
    WHATSAPP_INTEGRATION: 'WHATSAPP_INTEGRATION',
    ADVANCED_ANALYTICS: 'ADVANCED_ANALYTICS',
    BACKUP_SERVICE: 'BACKUP_SERVICE',
    PRIORITY_SUPPORT: 'PRIORITY_SUPPORT'
  };

  // Configuración de features
  static readonly FEATURE_CONFIG = {
    [Feature.FEATURES.ACCESS_CONTROL]: {
      name: 'Control de Accesos',
      permissions: ['access.view', 'access.doors.open'],
      ui_modules: ['access-control', 'access-logs'],
      limits: {
        max_access_points: 10,
        access_log_retention_days: 30
      }
    },
    [Feature.FEATURES.FINANCIAL_MODULE]: {
      name: 'Módulo Financiero',
      permissions: ['financial.expenses.view', 'financial.pay.online', 'financial.reports.generate'],
      ui_modules: ['financial-dashboard', 'payment-portal', 'expense-manager'],
      limits: {
        max_bank_accounts: 5,
        invoice_retention_months: 60
      }
    },
    [Feature.FEATURES.FACIAL_RECOGNITION]: {
      name: 'Reconocimiento Facial',
      permissions: ['devices.facial.manage'],
      ui_modules: ['facial-config', 'facial-enrollment'],
      dependencies: ['ACCESS_CONTROL'],
      limits: {
        max_faces_per_user: 3,
        recognition_accuracy: 0.95
      }
    }
  };
}
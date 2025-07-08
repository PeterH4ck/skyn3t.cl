// =====================================================
// SKYN3T ACCESS CONTROL - MODELS INDEX
// =====================================================
// Exportación centralizada de todos los modelos del sistema

// =====================================================
// CORE MODELS
// =====================================================

// User management
export { User, UserStatus } from './User';
export { Role } from './Role';
export { Permission, RiskLevel } from './Permission';
export { Country } from './Country';

// Community management
export { Community, CommunityType } from './Community';
export { Building } from './Building';
export { Floor } from './Floor';
export { Unit, UnitType } from './Unit';
export { Feature } from './Feature';

// Device management
export { Device, DeviceStatus, DeviceType } from './Device';
export { DeviceCommand } from './DeviceCommand';
export { DeviceHeartbeat } from './DeviceHeartbeat';
export { AccessPoint, AccessPointType } from './AccessPoint';

// Vehicle management
export { Vehicle, VehicleType } from './Vehicle';
export { VehicleTag } from './VehicleTag';
export { LicensePlate } from './LicensePlate';

// Access control
export { AccessLog, AccessMethod, AccessDirection } from './AccessLog';
export { AccessRule } from './AccessRule';
export { BiometricData } from './BiometricData';
export { FacialEncoding } from './FacialEncoding';
export { RFIDCard } from './RFIDCard';
export { QRCode } from './QRCode';

// Invitations
export { Invitation, InvitationType, InvitationStatus } from './Invitation';
export { InvitationVehicle } from './InvitationVehicle';
export { InvitationAccessMethod } from './InvitationAccessMethod';
export { RecurringInvitation } from './RecurringInvitation';

// =====================================================
// ASSOCIATION MODELS (Many-to-Many)
// =====================================================

// User associations
export { UserRole } from './UserRole';
export { UserPermission } from './UserPermission';
export { UserSession } from './UserSession';

// Community associations
export { CommunityMember, MemberType } from './CommunityMember';
export { CommunityFeature } from './CommunityFeature';
export { CommunityRole } from './CommunityRole';

// Role associations
export { RolePermission } from './RolePermission';
export { PermissionDependency } from './PermissionDependency';

// =====================================================
// FINANCIAL MODELS
// =====================================================

// Banking
export { BankConfiguration } from './BankConfiguration';
export { BankAccount } from './BankAccount';
export { BankCredential } from './BankCredential';
export { BankTransaction } from './BankTransaction';

// Payments
export { PaymentGateway } from './PaymentGateway';
export { PaymentTransaction, PaymentStatus } from './PaymentTransaction';
export { PaymentMethod } from './PaymentMethod';
export { PaypalTransaction } from './PaypalTransaction';

// Expenses
export { CommonExpense } from './CommonExpense';
export { UnitExpense } from './UnitExpense';
export { ExpenseCategory } from './ExpenseCategory';

// =====================================================
// COMMUNICATION MODELS
// =====================================================

// Notifications
export { Notification, NotificationChannel, NotificationType } from './Notification';
export { NotificationTemplate } from './NotificationTemplate';
export { CommunicationLog } from './CommunicationLog';
export { MassCommunication } from './MassCommunication';

// Messages
export { Message } from './Message';
export { MessageTemplate } from './MessageTemplate';
export { EmailQueue } from './EmailQueue';
export { SMSQueue } from './SMSQueue';

// =====================================================
// STAFF AND WORKERS
// =====================================================

// Staff management
export { StaffMember } from './StaffMember';
export { StaffSchedule } from './StaffSchedule';
export { StaffAttendance } from './StaffAttendance';

// Workers
export { HouseholdWorker } from './HouseholdWorker';
export { ServiceProvider } from './ServiceProvider';
export { AuthorizedPerson } from './AuthorizedPerson';

// =====================================================
// AUDIT AND SECURITY
// =====================================================

// Audit trail
export { AuditLog, AuditAction } from './AuditLog';
export { SecurityLog } from './SecurityLog';
export { SystemLog } from './SystemLog';

// Security
export { FailedLoginAttempt } from './FailedLoginAttempt';
export { IPWhitelist } from './IPWhitelist';
export { IPBlacklist } from './IPBlacklist';
export { BlacklistedGuest } from './BlacklistedGuest';

// =====================================================
// CONTENT AND DOCUMENTS
// =====================================================

// Documents
export { Document, DocumentType } from './Document';
export { PersonPhoto } from './PersonPhoto';
export { VehiclePhoto } from './VehiclePhoto';

// Content
export { Announcement } from './Announcement';
export { SuggestionComplaint } from './SuggestionComplaint';
export { MaintenanceRequest } from './MaintenanceRequest';

// =====================================================
// ANALYTICS AND REPORTING
// =====================================================

// Analytics
export { AnalyticsDashboard } from './AnalyticsDashboard';
export { AnalyticsWidget } from './AnalyticsWidget';
export { AnalyticsKPI } from './AnalyticsKPI';
export { MetricHistory } from './MetricHistory';

// ML and predictions
export { MLPrediction } from './MLPrediction';
export { TrendAnalysis } from './TrendAnalysis';
export { AnomalyDetection } from './AnomalyDetection';

// Reports
export { Report } from './Report';
export { ScheduledReport } from './ScheduledReport';
export { ReportTemplate } from './ReportTemplate';

// =====================================================
// SYSTEM CONFIGURATION
// =====================================================

// Settings
export { SystemSetting } from './SystemSetting';
export { CommunitySettings } from './CommunitySettings';
export { UserPreferences } from './UserPreferences';

// Regional
export { RegionalSettings } from './RegionalSettings';
export { CurrencyRate } from './CurrencyRate';
export { TaxConfiguration } from './TaxConfiguration';

// Feature flags
export { FeatureFlag } from './FeatureFlag';
export { UserFeature } from './UserFeature';

// =====================================================
// SUBSCRIPTION AND BILLING
// =====================================================

// Subscriptions
export { SubscriptionPlan } from './SubscriptionPlan';
export { CommunitySubscription } from './CommunitySubscription';
export { BillingHistory } from './BillingHistory';

// Usage tracking
export { UsageMetric } from './UsageMetric';
export { QuotaLimit } from './QuotaLimit';

// =====================================================
// EMERGENCY AND INCIDENTS
// =====================================================

// Emergency
export { EmergencyProcedure } from './EmergencyProcedure';
export { EmergencyContact } from './EmergencyContact';
export { Incident } from './Incident';

// Maintenance
export { MaintenanceSchedule } from './MaintenanceSchedule';
export { EquipmentMaintenance } from './EquipmentMaintenance';

// =====================================================
// LOCALIZATION
// =====================================================

// Multi-language
export { Localization } from './Localization';
export { TranslationKey } from './TranslationKey';

// =====================================================
// IOT AND HARDWARE
// =====================================================

// IoT devices
export { DeviceController } from './DeviceController';
export { DeviceMetric } from './DeviceMetric';
export { DeviceAlert } from './DeviceAlert';
export { DeviceMaintenanceLog } from './DeviceMaintenanceLog';

// Hardware
export { HardwareComponent } from './HardwareComponent';
export { FirmwareVersion } from './FirmwareVersion';

// =====================================================
// TYPES AND ENUMS (Re-exports)
// =====================================================

// Export commonly used types
export type {
  // User types
  UserStatus,
  
  // Community types
  CommunityType,
  MemberType,
  
  // Device types
  DeviceStatus,
  DeviceType,
  AccessPointType,
  
  // Access types
  AccessMethod,
  AccessDirection,
  
  // Vehicle types
  VehicleType,
  
  // Invitation types
  InvitationType,
  InvitationStatus,
  
  // Financial types
  PaymentStatus,
  
  // Notification types
  NotificationChannel,
  NotificationType,
  
  // Permission types
  RiskLevel,
  
  // Audit types
  AuditAction,
  
  // Document types
  DocumentType
} from './types';

// =====================================================
// MODEL COLLECTIONS
// =====================================================

// Export collections for easier iteration
export const USER_MODELS = [
  'User',
  'UserRole',
  'UserPermission',
  'UserSession',
  'UserPreferences'
] as const;

export const COMMUNITY_MODELS = [
  'Community',
  'CommunityMember',
  'CommunityFeature',
  'CommunityRole',
  'CommunitySettings'
] as const;

export const ACCESS_MODELS = [
  'AccessLog',
  'AccessPoint',
  'AccessRule',
  'BiometricData',
  'FacialEncoding',
  'RFIDCard',
  'QRCode'
] as const;

export const DEVICE_MODELS = [
  'Device',
  'DeviceCommand',
  'DeviceHeartbeat',
  'DeviceController',
  'DeviceMetric',
  'DeviceAlert'
] as const;

export const FINANCIAL_MODELS = [
  'BankConfiguration',
  'BankAccount',
  'PaymentTransaction',
  'CommonExpense',
  'UnitExpense'
] as const;

export const NOTIFICATION_MODELS = [
  'Notification',
  'NotificationTemplate',
  'CommunicationLog',
  'MassCommunication'
] as const;

// =====================================================
// MODEL REGISTRY
// =====================================================

// Registry for dynamic model access
export const MODEL_REGISTRY = {
  // Core entities
  User: 'User',
  Role: 'Role',
  Permission: 'Permission',
  Community: 'Community',
  Building: 'Building',
  
  // Access control
  AccessLog: 'AccessLog',
  AccessPoint: 'AccessPoint',
  Device: 'Device',
  Vehicle: 'Vehicle',
  
  // Invitations
  Invitation: 'Invitation',
  
  // Financial
  PaymentTransaction: 'PaymentTransaction',
  CommonExpense: 'CommonExpense',
  
  // Communication
  Notification: 'Notification',
  
  // Audit
  AuditLog: 'AuditLog'
} as const;

// =====================================================
// VALIDATION HELPERS
// =====================================================

// Model validation utilities
export const isValidModel = (modelName: string): boolean => {
  return Object.values(MODEL_REGISTRY).includes(modelName as any);
};

export const getModelsByCategory = (category: keyof typeof MODEL_COLLECTIONS) => {
  const collections = {
    USER: USER_MODELS,
    COMMUNITY: COMMUNITY_MODELS,
    ACCESS: ACCESS_MODELS,
    DEVICE: DEVICE_MODELS,
    FINANCIAL: FINANCIAL_MODELS,
    NOTIFICATION: NOTIFICATION_MODELS
  };
  
  return collections[category] || [];
};

// =====================================================
// RELATIONSHIP HELPERS
// =====================================================

// Common relationship patterns
export const BELONGS_TO_COMMUNITY = [
  'Building',
  'Device',
  'Vehicle',
  'AccessPoint',
  'Invitation',
  'Notification'
] as const;

export const BELONGS_TO_USER = [
  'Vehicle',
  'UserSession',
  'Invitation',
  'AuditLog'
] as const;

export const HAS_AUDIT_TRAIL = [
  'User',
  'Community',
  'Building',
  'Device',
  'Permission',
  'Role'
] as const;

// =====================================================
// EXPORT DEFAULT (for convenience)
// =====================================================

export default {
  // Core models
  User,
  Role,
  Permission,
  Community,
  Building,
  Device,
  Vehicle,
  AccessLog,
  Invitation,
  
  // Registries
  MODEL_REGISTRY,
  USER_MODELS,
  COMMUNITY_MODELS,
  ACCESS_MODELS,
  DEVICE_MODELS,
  FINANCIAL_MODELS,
  NOTIFICATION_MODELS,
  
  // Helpers
  isValidModel,
  getModelsByCategory
};

// =====================================================
// NOTES FOR DEVELOPERS
// =====================================================

/**
 * USAGE EXAMPLES:
 * 
 * // Import specific models
 * import { User, Community, AccessLog } from '@/models';
 * 
 * // Import model collections
 * import { USER_MODELS, ACCESS_MODELS } from '@/models';
 * 
 * // Import everything
 * import * as Models from '@/models';
 * 
 * // Import default registry
 * import Models from '@/models';
 * 
 * // Use model validation
 * import { isValidModel, MODEL_REGISTRY } from '@/models';
 * 
 * ADDING NEW MODELS:
 * 1. Create the model file in this directory
 * 2. Add the export statement above
 * 3. Add to appropriate MODEL collection
 * 4. Add to MODEL_REGISTRY if it's a core entity
 * 5. Update relationship helpers if needed
 */
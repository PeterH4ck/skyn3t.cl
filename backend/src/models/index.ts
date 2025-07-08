// =====================================================
// MODELS INDEX - SKYN3T ACCESS CONTROL BACKEND
// =====================================================
// Este archivo centraliza la exportación de todos los modelos
// para facilitar las importaciones en otros archivos

// Core models
export { User } from './User';
export { Role } from './Role';
export { Permission } from './Permission';
export { Community } from './Community';
export { Device } from './Device';

// Relationship models
export { UserRole } from './UserRole';
export { RolePermission } from './RolePermission';
export { UserPermission } from './UserPermission';

// Feature models
export { Feature } from './Feature';
export { CommunityFeature } from './CommunityFeature';

// Building & Structure models
export { Building } from './Building';
export { Floor } from './Floor';
export { Unit } from './Unit';

// Community membership
export { CommunityMember } from './CommunityMember';

// Vehicle & Access models
export { Vehicle } from './Vehicle';
export { AccessPoint } from './AccessPoint';
export { AccessLog } from './AccessLog';

// Invitation & Security models
export { Invitation } from './Invitation';
export { AuditLog } from './AuditLog';
export { UserSession } from './UserSession';

// Geography
export { Country } from './Country';

// Financial models
export { Expense } from './Expense';
export { Payment } from './Payment';
export { PaymentMethod } from './PaymentMethod';
export { Transaction } from './Transaction';

// Notification models
export { NotificationTemplate } from './NotificationTemplate';
export { NotificationLog } from './NotificationLog';
export { UserNotificationPreference } from './UserNotificationPreference';

// Device & IoT models
export { DeviceCommand } from './DeviceCommand';
export { DeviceMetric } from './DeviceMetric';
export { DeviceConfiguration } from './DeviceConfiguration';

// File & Media models
export { FileUpload } from './FileUpload';
export { MediaAsset } from './MediaAsset';

// System models
export { SystemConfiguration } from './SystemConfiguration';
export { ApiKey } from './ApiKey';
export { WebhookEndpoint } from './WebhookEndpoint';

// All model interfaces and types
export * from './types';

// Model collections for easy access
export const CoreModels = {
  User,
  Role,
  Permission,
  Community,
  Device
} as const;

export const RelationshipModels = {
  UserRole,
  RolePermission, 
  UserPermission,
  CommunityMember,
  CommunityFeature
} as const;

export const AccessModels = {
  AccessPoint,
  AccessLog,
  Vehicle,
  Invitation
} as const;

export const FinancialModels = {
  Expense,
  Payment,
  PaymentMethod,
  Transaction
} as const;

export const NotificationModels = {
  NotificationTemplate,
  NotificationLog,
  UserNotificationPreference
} as const;

export const DeviceModels = {
  Device,
  DeviceCommand,
  DeviceMetric,
  DeviceConfiguration
} as const;

export const SystemModels = {
  AuditLog,
  UserSession,
  SystemConfiguration,
  ApiKey,
  WebhookEndpoint
} as const;

export const MediaModels = {
  FileUpload,
  MediaAsset
} as const;

// Helper function to get all models as array
export function getAllModels() {
  return [
    ...Object.values(CoreModels),
    ...Object.values(RelationshipModels),
    ...Object.values(AccessModels),
    ...Object.values(FinancialModels),
    ...Object.values(NotificationModels),
    ...Object.values(DeviceModels),
    ...Object.values(SystemModels),
    ...Object.values(MediaModels),
    Building,
    Floor,
    Unit,
    Country,
    Feature
  ];
}

// Model categories for organization
export const ModelCategories = {
  CORE: 'core',
  RELATIONSHIP: 'relationship',
  ACCESS: 'access',
  FINANCIAL: 'financial',
  NOTIFICATION: 'notification',
  DEVICE: 'device',
  SYSTEM: 'system',
  MEDIA: 'media',
  INFRASTRUCTURE: 'infrastructure'
} as const;

// Get models by category
export function getModelsByCategory(category: keyof typeof ModelCategories) {
  switch (category) {
    case 'CORE':
      return Object.values(CoreModels);
    case 'RELATIONSHIP':
      return Object.values(RelationshipModels);
    case 'ACCESS':
      return Object.values(AccessModels);
    case 'FINANCIAL':
      return Object.values(FinancialModels);
    case 'NOTIFICATION':
      return Object.values(NotificationModels);
    case 'DEVICE':
      return Object.values(DeviceModels);
    case 'SYSTEM':
      return Object.values(SystemModels);
    case 'MEDIA':
      return Object.values(MediaModels);
    case 'INFRASTRUCTURE':
      return [Building, Floor, Unit, Country, Feature];
    default:
      return [];
  }
}
export type PermissionKey = 'dashboard' | 'analyst' | 'studio' | 'jsoneditor' | 'adcopy' | 'users' | 'closers' | 'admin';

export interface AdminPermissions {
  dashboard: boolean;
  analyst: boolean;
  studio: boolean;
  jsoneditor: boolean;
  adcopy: boolean;
  users: boolean;
  closers: boolean;
  admin: boolean;
}

export const PERMISSION_MODULES: {
  key: PermissionKey;
  label: string;
  description: string;
  icon: string;
  elevated?: boolean;
}[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'View metrics and growth', icon: 'LayoutDashboard' },
  { key: 'analyst', label: 'AI Analyst', description: 'Run intelligence reports', icon: 'Sparkles' },
  { key: 'studio', label: 'Image Studio', description: 'Access asset generation', icon: 'ImageIcon' },
  { key: 'jsoneditor', label: 'JSON Editor', description: 'JSON-based image editing', icon: 'Braces' },
  { key: 'adcopy', label: 'Ad Copy', description: 'Creative management', icon: 'PenTool' },
  { key: 'users', label: 'Users', description: 'Manage end-user access', icon: 'Users' },
  { key: 'closers', label: 'Closers', description: 'Sales pipeline control', icon: 'Handshake' },
  { key: 'admin', label: 'Admin Management', description: 'Full system authority', icon: 'ShieldCheck', elevated: true },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_MODULES.map((m) => m.key);

export function allPermissionsTrue(): AdminPermissions {
  return {
    dashboard: true,
    analyst: true,
    studio: true,
    jsoneditor: true,
    adcopy: true,
    users: true,
    closers: true,
    admin: true,
  };
}

export function allPermissionsFalse(): AdminPermissions {
  return {
    dashboard: false,
    analyst: false,
    studio: false,
    jsoneditor: false,
    adcopy: false,
    users: false,
    closers: false,
    admin: false,
  };
}

export function hasPermission(
  admin: { isSuper: boolean; permissions: AdminPermissions },
  key: PermissionKey
): boolean {
  if (admin.isSuper) return true;
  return admin.permissions[key];
}

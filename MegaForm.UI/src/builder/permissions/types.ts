export interface PermissionRule {
  permissionId?: number;
  formId?: number;
  permissionType?: string;
  principalType?: string;
  principalId?: string;
  roleName?: string;
  userId?: number | null;
  scope?: string;
  isGranted?: boolean;
  fieldRestrictions?: string;
}

export interface PermissionDefinition {
  key: string;
  label: string;
  description?: string;
  supportsScope?: boolean;
  defaultScope?: string;
}

export interface PermissionScope {
  key: string;
  label: string;
  description?: string;
}

export interface PermissionPrincipal {
  principalType: string;
  principalId: string;
  displayName: string;
  description?: string;
  roleName?: string;
  userId?: number | null;
  isSpecial?: boolean;
  isRole?: boolean;
  isUser?: boolean;
  isCurrentUser?: boolean;
}

export interface PermissionCatalog {
  formId: number;
  badge?: string;
  currentUser?: {
    userId?: number;
    userName?: string;
    displayName?: string;
    email?: string;
    isAuthenticated?: boolean;
    isAdmin?: boolean;
    isSuperUser?: boolean;
    roles?: string[];
  };
  permissionTypes: PermissionDefinition[];
  scopes: PermissionScope[];
  principals: PermissionPrincipal[];
}

export interface PermissionsCatalogResponse {
  permissions: PermissionRule[];
  catalog: PermissionCatalog;
}

export interface PermissionsEditorState {
  formId: number;
  loadedFormId: number;
  loading: boolean;
  saving: boolean;
  loaded: boolean;
  status: string;
  statusTone: 'muted' | 'success' | 'error';
  catalog: PermissionCatalog | null;
  rules: PermissionRule[];
}


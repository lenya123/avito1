import type { ReactNode } from "react";

export type Role = "owner" | "seller";

export interface NavItem {
  href: string;
  icon: ReactNode;
  label: string;
}

export interface RoleBrand {
  title: string;
  subtitle: string;
  accentClass: string;
  bgGradient: string;
  borderClass: string;
  shadowClass: string;
  indicatorGradient: string;
  logoIcon: ReactNode;
}

export interface RoleAuthUser {
  id: string;
  name: string | null;
  email?: string | null;
  telegramUsername?: string | null;
}

export interface RoleNotificationsData {
  items: Array<{
    id: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    createdAt: string;
  }>;
  recentCount: number;
}

export interface UseNotificationsResult {
  data: RoleNotificationsData | undefined;
  isLoading: boolean;
}

export interface RoleConfig {
  role: Role;
  basePath: "/owner" | "/seller";
  loginPath: string;
  brand: RoleBrand;
  sidebarItems: NavItem[];
  mobileNavItems: NavItem[];
  features: {
    search: boolean;
    notifications: boolean;
    moreMenu: boolean;
  };
  endpoints: {
    search?: string;
  };
  useAuthUser: () => RoleAuthUser | null;
  useAuthState: () => { isInitialized: boolean; isLoading: boolean };
  initAuth?: () => void;
  logout: () => Promise<void>;
  useNotifications?: (limit: number) => UseNotificationsResult;
}

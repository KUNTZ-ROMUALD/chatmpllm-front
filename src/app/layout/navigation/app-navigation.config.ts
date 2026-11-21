export interface AppNavItem {
  label: string;
  icon: string;
  route: string;
  exact?: boolean;
  requiresAuth?: boolean;
  adminOnly?: boolean;
}

export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    label: 'Chat',
    icon: 'chat',
    route: '/chat',
    exact: true,
  },
  {
    label: 'Historique',
    icon: 'history',
    route: '/conversations',
  },
  {
    label: 'Clés API',
    icon: 'key',
    route: '/api-keys',
  },
  {
    label: 'Providers',
    icon: 'hub',
    route: '/providers',
  },
  {
    label: 'Administration',
    icon: 'admin_panel_settings',
    route: '/admin/providers',
    adminOnly: true,
    requiresAuth: true,
  },
];

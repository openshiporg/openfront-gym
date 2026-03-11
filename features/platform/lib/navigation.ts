import {
  Users,
  BarChart3,
  CreditCard,
  Calendar,
  Dumbbell,
  MapPin,
  UserCheck,
  LayoutDashboard,
  LucideIcon,
  Settings,
  History,
  Sparkles,
  Building2
} from 'lucide-react';

export interface PlatformNavItem {
  title: string;
  href: string;
  color: string;
  description: string;
  icon: LucideIcon;
  group?: string;
}

export interface PlatformNavGroup {
  id: string;
  title: string;
  icon: LucideIcon;
  items: PlatformNavItem[];
}

export const platformNavItems: PlatformNavItem[] = [
  // Standalone Items
  {
    title: 'Billing',
    href: '/platform/billing',
    color: 'emerald',
    description: 'Manage subscriptions, payment history, and revenue.',
    icon: CreditCard,
    group: 'standalone'
  },
  {
    title: 'Scheduling',
    href: '/platform/scheduling',
    color: 'violet',
    description: 'Visual calendar for classes and instructors.',
    icon: Calendar,
    group: 'standalone'
  },

  // Gym Management
  {
    title: 'Members',
    href: '/platform/members',
    color: 'blue',
    description: 'Manage member profiles, statuses, and history.',
    icon: Users,
    group: 'management'
  },
];

export const platformStandaloneItems = platformNavItems.filter(item => item.group === 'standalone')

export const platformNavGroups: PlatformNavGroup[] = [
  {
    id: 'management',
    title: 'Management',
    icon: Users,
    items: platformNavItems.filter(item => item.group === 'management')
  }
];

export function getPlatformNavItemsWithBasePath(basePath: string, user?: any) {
  const isInstructor = user?.role?.isInstructor;
  const canManageAll = user?.role?.canManageAllRecords;

  return platformNavItems
    .filter(item => {
      // Filter logic
      if (isInstructor && !canManageAll) {
        // Instructors ONLY see scheduling
        return item.title === 'Scheduling';
      }
      return true;
    })
    .map(item => ({
      ...item,
      href: `${basePath}${item.href}`,
    }));
}

export function getIconForNavItem(title: string): LucideIcon {
  if (title === 'Onboarding') return Sparkles;
  const item = platformNavItems.find(navItem => navItem.title === title);
  return item?.icon || LayoutDashboard;
}

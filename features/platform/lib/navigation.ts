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
  {
    title: 'Check-in',
    href: '/platform/check-in',
    color: 'amber',
    description: 'Front desk search and manual member check-ins.',
    icon: UserCheck,
    group: 'standalone'
  },
  {
    title: 'Gym Settings',
    href: '/platform/store-settings',
    color: 'slate',
    description: 'Update public gym identity, contact details, and storefront hours.',
    icon: Settings,
    group: 'standalone'
  },
  {
    title: 'Locations',
    href: '/platform/locations',
    color: 'cyan',
    description: 'Manage physical gym locations and facility contact records.',
    icon: MapPin,
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
  {
    title: 'Membership Plans',
    href: '/platform/membership-plans',
    color: 'emerald',
    description: 'Configure plan pricing, credits, guest passes, and Stripe IDs.',
    icon: CreditCard,
    group: 'management'
  },
  {
    title: 'Instructors',
    href: '/platform/instructors',
    color: 'violet',
    description: 'Manage public coach profiles and linked instructor accounts.',
    icon: Dumbbell,
    group: 'management'
  },
  {
    title: 'Class Catalog',
    href: '/platform/class-catalog',
    color: 'amber',
    description: 'Define class types, descriptions, duration, and required equipment.',
    icon: Calendar,
    group: 'management'
  },
  {
    title: 'Rosters',
    href: '/platform/rosters',
    color: 'orange',
    description: 'Open class rosters and mark attendance.',
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

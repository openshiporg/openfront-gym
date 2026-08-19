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
    description: 'Work recovery queues, provider-backed plan changes, payment evidence, and refunds.',
    icon: CreditCard,
    group: 'standalone'
  },
  {
    title: 'Scheduling',
    href: '/platform/scheduling',
    color: 'violet',
    description: 'Operate recurring templates, dated sessions, capacity, and instructor assignments.',
    icon: Calendar,
    group: 'standalone'
  },
  {
    title: 'Check-in',
    href: '/platform/check-in',
    color: 'amber',
    description: 'Validate current membership and record staffed facility entry or exit.',
    icon: UserCheck,
    group: 'standalone'
  },
  {
    title: 'Gym Settings',
    href: '/platform/store-settings',
    color: 'slate',
    description: 'Maintain public identity, locale, timezone, facility copy, and opening hours.',
    icon: Settings,
    group: 'standalone'
  },
  {
    title: 'Reports',
    href: '/platform/reports',
    color: 'rose',
    description: 'Review bounded operational revenue, attendance, utilization, and membership health.',
    icon: BarChart3,
    group: 'standalone'
  },
  {
    title: 'Locations',
    href: '/platform/locations',
    color: 'cyan',
    description: 'Maintain facility identity, contact details, and active operating state.',
    icon: MapPin,
    group: 'standalone'
  },

  // Gym Management
  {
    title: 'Members',
    href: '/platform/members',
    color: 'blue',
    description: 'Search profiles, inspect activity, and manage account status.',
    icon: Users,
    group: 'management'
  },
  {
    title: 'Membership Plans',
    href: '/platform/membership-plans',
    color: 'emerald',
    description: 'Configure pricing, enforced class credits and freezes, plus provider mappings.',
    icon: CreditCard,
    group: 'management'
  },
  {
    title: 'Instructors',
    href: '/platform/instructors',
    color: 'violet',
    description: 'Manage coach identity, assignments, descriptive specialties, and account claims.',
    icon: Dumbbell,
    group: 'management'
  },
  {
    title: 'Class Catalog',
    href: '/platform/class-catalog',
    color: 'amber',
    description: 'Define reusable class formats, difficulty, duration, and equipment context.',
    icon: Calendar,
    group: 'management'
  },
  {
    title: 'Rosters',
    href: '/platform/rosters',
    color: 'orange',
    description: 'Triage session capacity, promote waitlists, and record attendance outcomes.',
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
  const canViewReports = user?.role?.canViewReports;

  return platformNavItems
    .filter(item => {
      // Filter logic
      if (isInstructor && !canManageAll) {
        // Instructors ONLY see scheduling
        return item.title === 'Scheduling';
      }
      if (item.title === 'Reports' && !canViewReports && !canManageAll) {
        return false;
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

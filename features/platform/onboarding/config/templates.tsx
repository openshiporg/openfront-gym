import { Building2, Package, CircleCheck } from 'lucide-react';

export interface GymTemplate {
  name: string;
  description: string;
  icon: React.ReactNode;
  membershipTiers: string[];
  classTypes: string[];
  instructors: string[];
  displayNames: {
    membershipTiers: string[];
    classTypes: string[];
    instructors: string[];
  };
}

export const GYM_TEMPLATES: Record<'full' | 'minimal' | 'custom', GymTemplate> = {
  full: {
    name: 'Complete Setup',
    description:
      'Creates 3 membership plans, 6 class types, 3 instructors, 15 weekly schedules, upcoming class instances, and a demo member account so every storefront page works immediately.',
    icon: <Building2 className="h-5 w-5" />,
    membershipTiers: ['basic-monthly', 'premium-monthly', 'elite-monthly'],
    classTypes: ['yoga', 'spin', 'hiit', 'pilates', 'zumba', 'boxing'],
    instructors: ['sarah-johnson', 'mike-rodriguez', 'emily-chen'],
    displayNames: {
      membershipTiers: ['Basic Monthly', 'Premium Monthly', 'Elite Monthly'],
      classTypes: ['Yoga', 'Spin Class', 'HIIT', 'Pilates', 'Zumba', 'Boxing'],
      instructors: ['Sarah Johnson', 'Mike Rodriguez', 'Emily Chen'],
    },
  },
  minimal: {
    name: 'Basic Setup',
    description:
      'Essentials only — one membership plan, one class type, one instructor, and a demo member to test sign-in.',
    icon: <Package className="h-5 w-5" />,
    membershipTiers: ['basic-monthly'],
    classTypes: ['yoga'],
    instructors: ['sarah-johnson'],
    displayNames: {
      membershipTiers: ['Basic Monthly'],
      classTypes: ['Yoga'],
      instructors: ['Sarah Johnson'],
    },
  },
  custom: {
    name: 'Custom Setup',
    description:
      'Customize your gym setup using your own JSON templates for each section.',
    icon: <CircleCheck className="h-5 w-5" />,
    membershipTiers: ['basic-monthly'],
    classTypes: ['yoga'],
    instructors: ['sarah-johnson'],
    displayNames: {
      membershipTiers: ['Basic Monthly'],
      classTypes: ['Yoga'],
      instructors: ['Sarah Johnson'],
    },
  },
};

export interface SectionDefinition {
  id: number;
  type: string;
  label: string;
  getItemsFn: (template: 'full' | 'minimal' | 'custom') => string[];
  jsonKey: 'membershipTiers' | 'classTypes' | 'instructors';
}

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    id: 1,
    type: 'membershipTiers',
    label: 'Membership Plans',
    getItemsFn: (template) => GYM_TEMPLATES[template].displayNames.membershipTiers,
    jsonKey: 'membershipTiers' as const,
  },
  {
    id: 2,
    type: 'classTypes',
    label: 'Class Types',
    getItemsFn: (template) => GYM_TEMPLATES[template].displayNames.classTypes,
    jsonKey: 'classTypes' as const,
  },
  {
    id: 3,
    type: 'instructors',
    label: 'Instructors',
    getItemsFn: (template) => GYM_TEMPLATES[template].displayNames.instructors,
    jsonKey: 'instructors' as const,
  },
];

import { Building2, Calendar, CircleCheck, MapPin, Package, UserRound } from 'lucide-react';

export interface GymTemplate {
  name: string;
  description: string;
  icon: React.ReactNode;
  membershipTiers: string[];
  classTypes: string[];
  instructors: string[];
  displayNames: {
    gymSettings: string[];
    location: string[];
    membershipTiers: string[];
    classTypes: string[];
    instructors: string[];
    schedules: string[];
    demoMember: string[];
  };
}

export const GYM_TEMPLATES: Record<'full' | 'minimal' | 'custom', GymTemplate> = {
  full: {
    name: 'Complete Setup',
    description:
      'Creates 3 membership plans, 6 class types, 3 instructors, recurring schedules, upcoming class instances, and a demo member account so every storefront page works immediately.',
    icon: <Building2 className="h-5 w-5" />,
    membershipTiers: ['basic-monthly', 'premium-monthly', 'elite-monthly'],
    classTypes: ['yoga', 'spin', 'hiit', 'pilates', 'zumba', 'boxing'],
    instructors: ['sarah-johnson', 'mike-rodriguez', 'emily-chen'],
    displayNames: {
      gymSettings: ['Gym profile'],
      location: ['Main location'],
      membershipTiers: ['Basic Monthly', 'Premium Monthly', 'Elite Monthly'],
      classTypes: ['Yoga', 'Spin Class', 'HIIT', 'Pilates', 'Zumba', 'Boxing'],
      instructors: ['Sarah Johnson', 'Mike Rodriguez', 'Emily Chen'],
      schedules: [
        'Morning Yoga · Monday 07:00',
        'Morning Yoga · Wednesday 07:00',
        'Morning Yoga · Friday 07:00',
        'Spin Class · Tuesday 06:30',
        'Spin Class · Thursday 06:30',
        'Spin Class · Saturday 09:00',
        'HIIT Training · Monday 18:00',
        'HIIT Training · Wednesday 18:00',
        'HIIT Training · Friday 18:00',
        'Pilates · Tuesday 09:00',
        'Pilates · Saturday 10:00',
        'Zumba · Wednesday 19:00',
        'Zumba · Friday 19:00',
        'Boxing · Tuesday 18:00',
        'Boxing · Thursday 18:00',
      ],
      demoMember: ['Alex Demo'],
    },
  },
  minimal: {
    name: 'Basic Setup',
    description:
      'Essentials only — one membership plan, one class type, one instructor, recurring schedules, and a demo member to test sign-in.',
    icon: <Package className="h-5 w-5" />,
    membershipTiers: ['basic-monthly'],
    classTypes: ['yoga'],
    instructors: ['sarah-johnson'],
    displayNames: {
      gymSettings: ['Gym profile'],
      location: ['Main location'],
      membershipTiers: ['Basic Monthly'],
      classTypes: ['Yoga'],
      instructors: ['Sarah Johnson'],
      schedules: [
        'Morning Yoga · Monday 07:00',
        'Morning Yoga · Wednesday 07:00',
        'Morning Yoga · Friday 07:00',
      ],
      demoMember: ['Alex Demo'],
    },
  },
  custom: {
    name: 'Custom Setup',
    description:
      'Customize your gym setup using your own JSON templates for gym profile, plans, classes, instructors, schedules, and demo member data.',
    icon: <CircleCheck className="h-5 w-5" />,
    membershipTiers: ['basic-monthly'],
    classTypes: ['yoga'],
    instructors: ['sarah-johnson'],
    displayNames: {
      gymSettings: ['Gym profile'],
      location: ['Main location'],
      membershipTiers: ['Basic Monthly'],
      classTypes: ['Yoga'],
      instructors: ['Sarah Johnson'],
      schedules: ['Morning Yoga · Monday 07:00'],
      demoMember: ['Alex Demo'],
    },
  },
};

export interface SectionDefinition {
  id: number;
  type: string;
  label: string;
  getItemsFn: (template: 'full' | 'minimal' | 'custom') => string[];
  jsonKey:
    | 'gymSettings'
    | 'location'
    | 'membershipTiers'
    | 'classTypes'
    | 'instructors'
    | 'schedules'
    | 'demoMember';
}

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    id: 1,
    type: 'gymSettings',
    label: 'Gym Profile',
    getItemsFn: (template) => GYM_TEMPLATES[template].displayNames.gymSettings,
    jsonKey: 'gymSettings',
  },
  {
    id: 2,
    type: 'location',
    label: 'Location',
    getItemsFn: (template) => GYM_TEMPLATES[template].displayNames.location,
    jsonKey: 'location',
  },
  {
    id: 3,
    type: 'membershipTiers',
    label: 'Membership Plans',
    getItemsFn: (template) => GYM_TEMPLATES[template].displayNames.membershipTiers,
    jsonKey: 'membershipTiers',
  },
  {
    id: 4,
    type: 'classTypes',
    label: 'Class Types',
    getItemsFn: (template) => GYM_TEMPLATES[template].displayNames.classTypes,
    jsonKey: 'classTypes',
  },
  {
    id: 5,
    type: 'instructors',
    label: 'Instructors',
    getItemsFn: (template) => GYM_TEMPLATES[template].displayNames.instructors,
    jsonKey: 'instructors',
  },
  {
    id: 6,
    type: 'schedules',
    label: 'Recurring Schedules',
    getItemsFn: (template) => GYM_TEMPLATES[template].displayNames.schedules,
    jsonKey: 'schedules',
  },
  {
    id: 7,
    type: 'demoMember',
    label: 'Demo Member',
    getItemsFn: (template) => GYM_TEMPLATES[template].displayNames.demoMember,
    jsonKey: 'demoMember',
  },
];

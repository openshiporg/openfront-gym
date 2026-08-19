import { Building2, Package } from 'lucide-react';

export type SetupTemplate = 'full' | 'minimal';

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
    paymentProviders: string[];
  };
}

export const GYM_TEMPLATES: Record<SetupTemplate, GymTemplate> = {
  full: {
    name: 'Complete Starter Setup',
    description:
      'Creates sample plans, class types, instructors, recurring schedules, and a Stripe integration-status record that is enabled only when server credentials are configured. It never creates member credentials, charges, subscriptions, or revenue.',
    icon: <Building2 className="h-5 w-5" />,
    membershipTiers: ['basic-monthly', 'premium-monthly'],
    classTypes: ['yoga', 'spin', 'hiit', 'pilates', 'zumba', 'boxing'],
    instructors: ['sarah-johnson', 'mike-rodriguez', 'emily-chen'],
    displayNames: {
      gymSettings: ['Kinetic Performance Club starter profile'],
      location: ['Main Gym starter location'],
      membershipTiers: ['Basic Monthly', 'Unlimited Monthly'],
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
      paymentProviders: ['Stripe integration status (enabled only with server credentials)'],
    },
  },
  minimal: {
    name: 'Basic Starter Setup',
    description:
      'Creates one sample plan, class type, instructor, recurring schedule set, and a Stripe integration-status record that is enabled only when server credentials are configured. It never creates member credentials or financial evidence.',
    icon: <Package className="h-5 w-5" />,
    membershipTiers: ['basic-monthly'],
    classTypes: ['yoga'],
    instructors: ['sarah-johnson'],
    displayNames: {
      gymSettings: ['Kinetic Performance Club starter profile'],
      location: ['Main Gym starter location'],
      membershipTiers: ['Basic Monthly'],
      classTypes: ['Yoga'],
      instructors: ['Sarah Johnson'],
      schedules: [
        'Morning Yoga · Monday 07:00',
        'Morning Yoga · Wednesday 07:00',
        'Morning Yoga · Friday 07:00',
      ],
      paymentProviders: ['Stripe integration status (enabled only with server credentials)'],
    },
  },
};

export interface SectionDefinition {
  id: number;
  type: string;
  label: string;
  getItemsFn: (template: SetupTemplate) => string[];
  jsonKey:
    | 'gymSettings'
    | 'location'
    | 'membershipTiers'
    | 'classTypes'
    | 'instructors'
    | 'schedules'
    | 'paymentProviders';
}

const section = (
  id: number,
  type: SectionDefinition['jsonKey'],
  label: string,
): SectionDefinition => ({
  id,
  type,
  label,
  getItemsFn: (template) => GYM_TEMPLATES[template].displayNames[type],
  jsonKey: type,
});

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  section(1, 'gymSettings', 'Starter Gym Profile'),
  section(2, 'location', 'Starter Location'),
  section(3, 'membershipTiers', 'Sample Membership Plans'),
  section(4, 'classTypes', 'Sample Class Types'),
  section(5, 'instructors', 'Sample Instructors'),
  section(6, 'schedules', 'Sample Recurring Schedules'),
  section(7, 'paymentProviders', 'Stripe Integration Status'),
];

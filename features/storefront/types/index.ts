// Storefront types for openfront-gym

export interface GymClass {
  id: string;
  name: string;
  description: string;
  duration: number; // minutes
  capacity: number;
  spotsAvailable: number;
  instructor: Instructor;
  category: ClassCategory;
  schedule: ClassSchedule[];
  imageUrl?: string;
  price: number;
  creditCost?: number;
}

export interface Instructor {
  id: string;
  name: string;
  bio?: string;
  imageUrl?: string;
  specialties: string[];
}

export interface ClassCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface ClassSchedule {
  id: string;
  dayOfWeek: number; // 0-6, Sunday-Saturday
  startTime: string; // HH:MM format
  endTime: string;
  recurring: boolean;
}

export interface ClassBooking {
  id: string;
  class: GymClass;
  member: Member;
  scheduledDate: string;
  status: 'confirmed' | 'waitlisted' | 'cancelled' | 'completed';
  createdAt: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  membership?: Membership;
  credits: number;
  bookings: ClassBooking[];
}

export interface Membership {
  id: string;
  name: string;
  tier: 'basic' | 'premium' | 'unlimited';
  price: number;
  billingCycle: 'monthly' | 'annual';
  features: string[];
  classCredits: number; // per billing cycle
  active: boolean;
  startDate: string;
  endDate?: string;
}

export interface MembershipTier {
  id: string;
  name: string;
  tier: 'basic' | 'premium' | 'unlimited';
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  classCreditsPerMonth: number;
  highlighted?: boolean;
}

import { Organization } from './Organization';
import { User } from './User';
import { Role } from './Role';
import { Member } from './Member';
import { MembershipTier } from './MembershipTier';
import { Membership } from './Membership';
import { MembershipPayment } from './MembershipPayment';
import { Subscription } from './Subscription';
import { GymPayment } from './GymPayment';
import { PaymentMethod } from './PaymentMethod';
import { PaymentProvider } from './PaymentProvider';
import { PaymentSession } from './PaymentSession';
import { PaymentEvent } from './PaymentEvent';
import { CheckIn } from './CheckIn';
import { Location } from './Location';
import { GymSettings } from './GymSettings';
import { WorkoutLog } from './WorkoutLog';
import { WorkoutSet } from './WorkoutSet';
import { Exercise } from './Exercise';
import { Waitlist } from './Waitlist';
import { AttendanceRecord } from './AttendanceRecord';
import { ClassType } from './ClassType';
import { ClassSchedule } from './ClassSchedule';
import { ClassBooking } from './ClassBooking';
import { Instructor } from './Instructor';
import { ClassInstance } from './ClassInstance';
import { GymResource } from './GymResource';
import { TrainerAvailability } from './TrainerAvailability';
import { TrainerAppointment } from './TrainerAppointment';
import { OnboardingRun } from './OnboardingRun';
import { GymRefundAttempt } from './GymRefundAttempt';
import { MembershipBillingAttempt } from './MembershipBillingAttempt';
import { AuthRateLimitBucket } from './AuthRateLimitBucket';

export const models = {
  Organization,
  User,
  Role,
  Member,
  MembershipTier,
  Membership,
  MembershipPayment,
  Subscription,
  GymPayment,
  PaymentMethod,
  PaymentProvider,
  PaymentSession,
  PaymentEvent,
  CheckIn,
  Location,
  GymSettings,
  WorkoutLog,
  WorkoutSet,
  Exercise,
  Waitlist,
  AttendanceRecord,
  ClassType,
  ClassSchedule,
  ClassBooking,
  Instructor,
  ClassInstance,
  GymResource,
  TrainerAvailability,
  TrainerAppointment,
  OnboardingRun,
  GymRefundAttempt,
  MembershipBillingAttempt,
  AuthRateLimitBucket,
};

export default models;

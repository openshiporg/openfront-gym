import { User } from './User';
import { Role } from './Role';
import { Member } from './Member';
import { MembershipTier } from './MembershipTier';
import { Membership } from './Membership';
import { MembershipPayment } from './MembershipPayment';
import { Subscription } from './Subscription';
import { GymPayment } from './GymPayment';
import { PaymentMethod } from './PaymentMethod';
import { CheckIn } from './CheckIn';
import { Location } from './Location';
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

export const models = {
  User,
  Role,
  Member,
  MembershipTier,
  Membership,
  MembershipPayment,
  Subscription,
  GymPayment,
  PaymentMethod,
  CheckIn,
  Location,
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
};

export default models;

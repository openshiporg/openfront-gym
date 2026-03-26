import { GraphQLClient, gql } from 'graphql-request';
import { startOnboarding, completeOnboarding } from '../actions/onboarding';
import { SECTION_DEFINITIONS } from '../config/templates';
import { getItemsFromJsonData } from '../utils/dataUtils';
import { TemplateType, OnboardingStep } from './useOnboardingState';

const GRAPHQL_ENDPOINT = '/api/graphql';

interface OnboardingApiProps {
  selectedTemplate: TemplateType;
  currentJsonData: any;
  completedItems: Record<string, string[]>;
  setProgress: (message: string) => void;
  setItemLoading: (type: string, item: string) => void;
  setItemCompleted: (type: string, item: string) => void;
  setItemError: (type: string, item: string, errorMessage: string) => void;
  setStep: (step: OnboardingStep) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  resetOnboardingState: () => void;
}

export function useOnboardingApi({
  selectedTemplate,
  currentJsonData,
  completedItems,
  setProgress,
  setItemLoading,
  setItemCompleted,
  setItemError,
  setStep,
  setError,
  setIsLoading,
  resetOnboardingState,
}: OnboardingApiProps) {

  const runOnboarding = async () => {
    setIsLoading(true);
    setError(null);
    resetOnboardingState();
    setStep('progress');
    setProgress('Starting gym setup…');

    try { await startOnboarding(); } catch {}

    try {
      const client = new GraphQLClient(GRAPHQL_ENDPOINT, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      // Ordered dependency chain:
      // 1. location
      // 2. membership tiers
      // 3. class types
      // 4. instructors  (need user accounts)
      // 5. class schedules (need instructors)
      // 6. class instances (need schedules, next 14 days)
      // 7. demo member + membership + bookings

      setProgress('Creating gym location…');
      await createLocation(client, currentJsonData);

      setProgress('Creating membership plans…');
      const tierIds = await createMembershipTiers(client, currentJsonData);

      setProgress('Creating class types…');
      const classTypeIds = await createClassTypes(client, currentJsonData);

      setProgress('Creating instructors…');
      const instructorIds = await createInstructors(client, currentJsonData);

      setProgress('Creating class schedules…');
      const scheduleIds = await createSchedules(client, currentJsonData, instructorIds);

      setProgress('Generating upcoming class instances…');
      const instanceIds = await createClassInstances(client, scheduleIds, instructorIds);

      setProgress('Creating demo member account…');
      await createDemoMember(client, currentJsonData, tierIds, instanceIds);

      setProgress('Setup complete!');
      try { await completeOnboarding(); } catch {}
      setStep('done');
    } catch (e: any) {
      handleOnboardingError(e);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Location ─────────────────────────────────────────────────────────────
  const createLocation = async (client: GraphQLClient, data: any) => {
    const loc = data.location;
    if (!loc) return;
    try {
      await client.request(gql`
        mutation CreateLocation($data: LocationCreateInput!) {
          createLocation(data: $data) { id }
        }
      `, {
        data: {
          name: loc.name,
          address: loc.address ?? '',
          phone: loc.phone ?? '',
          isActive: true,
        },
      });
    } catch (e: any) {
      if (!extractErrorMessage(e).includes('Unique constraint')) throw e;
    }
  };

  // ─── Membership Tiers ─────────────────────────────────────────────────────
  const createMembershipTiers = async (client: GraphQLClient, data: any): Promise<Record<string, string>> => {
    const ids: Record<string, string> = {};
    for (const tier of (data.membershipTiers ?? [])) {
      const name = tier.name ?? 'Plan';
      setItemLoading('membershipTiers', name);
      try {
        const result = await client.request<any>(gql`
          mutation CreateTier($data: MembershipTierCreateInput!) {
            createMembershipTier(data: $data) { id name }
          }
        `, {
          data: {
            name: tier.name,
            monthlyPrice: tier.monthlyPrice,
            annualPrice: tier.annualPrice ?? null,
            classCreditsPerMonth: tier.classCreditsPerMonth ?? 0,
            accessHours: tier.accessHours ?? 'limited',
            guestPasses: tier.guestPasses ?? 0,
            personalTrainingSessions: tier.personalTrainingSessions ?? 0,
            freezeAllowed: tier.freezeAllowed ?? false,
            contractLength: tier.contractLength ?? 0,
            billingInterval: 'monthly',
            hasGuestPrivileges: (tier.guestPasses ?? 0) > 0,
            features: [],
          },
        });
        ids[tier.handle] = result.createMembershipTier.id;
        setItemCompleted('membershipTiers', name);
      } catch (e: any) {
        const msg = extractErrorMessage(e);
        if (msg.includes('Unique constraint')) { setItemCompleted('membershipTiers', name); }
        else { setItemError('membershipTiers', name, msg); }
      }
    }
    return ids;
  };

  // ─── Class Types ──────────────────────────────────────────────────────────
  const createClassTypes = async (client: GraphQLClient, data: any): Promise<Record<string, string>> => {
    const ids: Record<string, string> = {};
    for (const ct of (data.classTypes ?? [])) {
      const name = ct.name ?? 'Class';
      setItemLoading('classTypes', name);
      try {
        const result = await client.request<any>(gql`
          mutation CreateClassType($data: ClassTypeCreateInput!) {
            createClassType(data: $data) { id name }
          }
        `, {
          data: {
            name: ct.name,
            difficulty: ct.difficulty ?? 'all-levels',
            duration: ct.duration ?? 60,
            caloriesBurn: ct.caloriesBurn ?? null,
            equipmentNeeded: ct.equipmentNeeded ?? [],
          },
        });
        ids[ct.handle] = result.createClassType.id;
        setItemCompleted('classTypes', name);
      } catch (e: any) {
        const msg = extractErrorMessage(e);
        if (msg.includes('Unique constraint')) { setItemCompleted('classTypes', name); }
        else { setItemError('classTypes', name, msg); }
      }
    }
    return ids;
  };

  // ─── Instructors ──────────────────────────────────────────────────────────
  const createInstructors = async (client: GraphQLClient, data: any): Promise<Record<string, string>> => {
    // Returns handle → Instructor.id
    const ids: Record<string, string> = {};
    for (const inst of (data.instructors ?? [])) {
      const fullName = `${inst.firstName ?? ''} ${inst.lastName ?? ''}`.trim() || 'Instructor';
      setItemLoading('instructors', fullName);
      try {
        const pw = `Demo#${Math.random().toString(36).slice(2, 10)}`;
        const userResult = await client.request<any>(gql`
          mutation CreateInstructorUser($data: UserCreateInput!) {
            createUser(data: $data) { id }
          }
        `, { data: { name: fullName, email: inst.email, password: pw, onboardingStatus: 'completed' } });

        const userId = userResult.createUser.id;
        const instrResult = await client.request<any>(gql`
          mutation CreateInstructor($data: InstructorCreateInput!) {
            createInstructor(data: $data) { id }
          }
        `, {
          data: {
            user: { connect: { id: userId } },
            specialties: inst.specialties ?? [],
            certifications: inst.certifications ?? [],
            isActive: inst.isActive ?? true,
          },
        });

        ids[inst.handle] = instrResult.createInstructor.id;
        setItemCompleted('instructors', fullName);
      } catch (e: any) {
        const msg = extractErrorMessage(e);
        if (msg.includes('Unique constraint')) { setItemCompleted('instructors', fullName); }
        else { setItemError('instructors', fullName, msg); }
      }
    }
    return ids;
  };

  // ─── Class Schedules ──────────────────────────────────────────────────────
  const createSchedules = async (
    client: GraphQLClient,
    data: any,
    instructorIds: Record<string, string>
  ): Promise<Array<{ id: string; instructorHandle: string; dayOfWeek: string; startTime: string; endTime: string; maxCapacity: number }>> => {
    const created: Array<{ id: string; instructorHandle: string; dayOfWeek: string; startTime: string; endTime: string; maxCapacity: number }> = [];
    for (const sched of (data.schedules ?? [])) {
      const instructorId = instructorIds[sched.instructorHandle];
      if (!instructorId) continue;
      try {
        const result = await client.request<any>(gql`
          mutation CreateSchedule($data: ClassScheduleCreateInput!) {
            createClassSchedule(data: $data) { id name }
          }
        `, {
          data: {
            name: sched.name,
            dayOfWeek: sched.dayOfWeek,
            startTime: sched.startTime,
            endTime: sched.endTime,
            maxCapacity: sched.maxCapacity,
            isActive: sched.isActive ?? true,
            instructor: { connect: { id: instructorId } },
          },
        });
        created.push({
          id: result.createClassSchedule.id,
          instructorHandle: sched.instructorHandle,
          dayOfWeek: sched.dayOfWeek,
          startTime: sched.startTime,
          endTime: sched.endTime,
          maxCapacity: sched.maxCapacity,
        });
      } catch {
        // non-fatal: skip duplicate schedules
      }
    }
    return created;
  };

  // ─── Class Instances (next 14 days) ──────────────────────────────────────
  const DAY_MAP: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };

  const createClassInstances = async (
    client: GraphQLClient,
    schedules: Array<{ id: string; instructorHandle: string; dayOfWeek: string; startTime: string; endTime: string; maxCapacity: number }>,
    instructorIds: Record<string, string>
  ): Promise<string[]> => {
    const instanceIds: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const sched of schedules) {
      const targetDow = DAY_MAP[sched.dayOfWeek];
      if (targetDow === undefined) continue;

      // Find next two occurrences within 14 days
      for (let offset = 0; offset <= 14; offset++) {
        const d = new Date(today);
        d.setDate(today.getDate() + offset);
        if (d.getDay() !== targetDow) continue;

        // Set instance date at schedule's start time
        const [h, m] = sched.startTime.split(':').map(Number);
        d.setHours(h, m, 0, 0);

        const instrId = instructorIds[sched.instructorHandle];
        try {
          const result = await client.request<any>(gql`
            mutation CreateInstance($data: ClassInstanceCreateInput!) {
              createClassInstance(data: $data) { id }
            }
          `, {
            data: {
              classSchedule: { connect: { id: sched.id } },
              date: d.toISOString(),
              maxCapacity: sched.maxCapacity,
              isCancelled: false,
              ...(instrId ? { instructor: { connect: { id: instrId } } } : {}),
            },
          });
          instanceIds.push(result.createClassInstance.id);
        } catch {
          // skip
        }
      }
    }
    return instanceIds;
  };

  // ─── Demo Member ──────────────────────────────────────────────────────────
  const createDemoMember = async (
    client: GraphQLClient,
    data: any,
    tierIds: Record<string, string>,
    instanceIds: string[]
  ) => {
    const demo = data.demoMember;
    if (!demo) return;

    try {
      // Create user
      const userResult = await client.request<any>(gql`
        mutation CreateDemoUser($data: UserCreateInput!) {
          createUser(data: $data) { id }
        }
      `, { data: { name: demo.name, email: demo.email, password: demo.password, phone: demo.phone ?? '' } });

      const userId = userResult.createUser.id;
      const tierId = tierIds[demo.membershipTierHandle ?? 'premium-monthly'];

      // Create Member record
      const memberResult = await client.request<any>(gql`
        mutation CreateMember($data: MemberCreateInput!) {
          createMember(data: $data) { id }
        }
      `, {
        data: {
          name: demo.name,
          email: demo.email,
          phone: demo.phone ?? '',
          status: 'active',
          joinDate: new Date().toISOString(),
          user: { connect: { id: userId } },
          ...(tierId ? { membershipTier: { connect: { id: tierId } } } : {}),
        },
      });

      const memberId = memberResult.createMember.id;

      // Create Membership
      if (tierId) {
        const start = new Date();
        const next = new Date(start);
        next.setMonth(next.getMonth() + 1);
        await client.request(gql`
          mutation CreateMembership($data: MembershipCreateInput!) {
            createMembership(data: $data) { id }
          }
        `, {
          data: {
            member: { connect: { id: userId } },
            tier: { connect: { id: tierId } },
            status: 'active',
            billingCycle: 'monthly',
            startDate: start.toISOString(),
            nextBillingDate: next.toISOString(),
            autoRenew: true,
            classCreditsRemaining: -1,
          },
        });
      }

      // Book first 3 upcoming instances for the demo member
      const bookingInstances = instanceIds.slice(0, 3);
      for (const instanceId of bookingInstances) {
        try {
          await client.request(gql`
            mutation CreateBooking($data: ClassBookingCreateInput!) {
              createClassBooking(data: $data) { id }
            }
          `, {
            data: {
              classInstance: { connect: { id: instanceId } },
              member: { connect: { id: memberId } },
              memberName: demo.name,
              memberEmail: demo.email,
              status: 'confirmed',
              bookedAt: new Date().toISOString(),
            },
          });
        } catch {
          // skip if instance already full or other constraint
        }
      }
    } catch (e: any) {
      const msg = extractErrorMessage(e);
      if (!msg.includes('Unique constraint')) {
        console.error('Demo member creation failed:', msg);
      }
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const extractErrorMessage = (e: any): string => {
    if (e?.response?.errors) {
      return e.response.errors
        .map((err: any) =>
          err.message?.includes('Unique constraint')
            ? 'Unique constraint failed — item already exists.'
            : err.message ?? JSON.stringify(err)
        )
        .join('\n');
    }
    return e?.message ?? 'Unknown error';
  };

  const handleOnboardingError = (e: any) => {
    const msg = extractErrorMessage(e);
    setError(msg);
    console.error('Onboarding error:', e);

    for (const section of SECTION_DEFINITIONS) {
      const items = currentJsonData
        ? getItemsFromJsonData(currentJsonData, section.type)
        : section.getItemsFn(selectedTemplate);
      const done = completedItems[section.type] ?? [];
      const failed = items.find((item) => !done.includes(item));
      if (failed) { setItemError(section.type, failed, msg); break; }
    }
  };

  return { runOnboarding };
}

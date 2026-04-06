import { GraphQLClient, gql } from 'graphql-request';
import { useRouter } from 'next/navigation';
import { startOnboarding, completeOnboarding } from '../actions/onboarding';
import { SECTION_DEFINITIONS } from '../config/templates';
import { formatScheduleDisplayName, getItemsFromJsonData } from '../utils/dataUtils';
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
  const router = useRouter();

  const toDocument = (value?: string | null) => {
    if (!value) return undefined;
    return [{ type: 'paragraph', children: [{ text: value }] }];
  };

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

  const findRoleByName = async (client: GraphQLClient, name: string) => {
    const result = await client.request<any>(
      gql`
        query FindRole($name: String!) {
          roles(where: { name: { equals: $name } }, take: 1) {
            id
            name
            canCreateRecords
            canManageAllRecords
            canSeeOtherPeople
            canEditOtherPeople
            canManagePeople
            canManageRoles
            canAccessDashboard
            canManageOnboarding
            canManageSettings
            isInstructor
          }
        }
      `,
      { name }
    );

    return result?.roles?.[0] ?? null;
  };

  const ensureInstructorRole = async (client: GraphQLClient) => {
    const roleData = {
      name: 'Instructor',
      canCreateRecords: false,
      canManageAllRecords: false,
      canSeeOtherPeople: false,
      canEditOtherPeople: false,
      canManagePeople: false,
      canManageRoles: false,
      canAccessDashboard: true,
      canManageOnboarding: false,
      canManageSettings: false,
      isInstructor: true,
    };

    const existing = await findRoleByName(client, roleData.name);

    if (existing) {
      const needsUpdate = [
        'canCreateRecords',
        'canManageAllRecords',
        'canSeeOtherPeople',
        'canEditOtherPeople',
        'canManagePeople',
        'canManageRoles',
        'canAccessDashboard',
        'canManageOnboarding',
        'canManageSettings',
        'isInstructor',
      ].some((key) => existing[key] !== (roleData as any)[key]);

      if (needsUpdate) {
        await client.request<any>(
          gql`
            mutation UpdateRole($id: ID!, $data: RoleUpdateInput!) {
              updateRole(where: { id: $id }, data: $data) {
                id
              }
            }
          `,
          {
            id: existing.id,
            data: roleData,
          }
        );
      }

      return existing.id as string;
    }

    const created = await client.request<any>(
      gql`
        mutation CreateRole($data: RoleCreateInput!) {
          createRole(data: $data) {
            id
          }
        }
      `,
      { data: roleData }
    );

    return created.createRole.id as string;
  };

  const findUserByEmail = async (client: GraphQLClient, email: string) => {
    const result = await client.request<any>(
      gql`
        query FindUserByEmail($email: String!) {
          users(where: { email: { equals: $email } }, take: 1) {
            id
            email
            role {
              id
              isInstructor
              canAccessDashboard
            }
          }
        }
      `,
      { email }
    );

    return result?.users?.[0] ?? null;
  };

  const findInstructorByUserId = async (client: GraphQLClient, userId: string) => {
    const result = await client.request<any>(
      gql`
        query FindInstructorByUser($userId: ID!) {
          instructors(where: { user: { id: { equals: $userId } } }, take: 1) {
            id
          }
        }
      `,
      { userId }
    );

    return result?.instructors?.[0] ?? null;
  };

  const findLocationByName = async (client: GraphQLClient, name: string) => {
    const result = await client.request<any>(
      gql`
        query FindLocationByName($name: String!) {
          locations(where: { name: { equals: $name } }, take: 1) {
            id
          }
        }
      `,
      { name }
    );

    return result?.locations?.[0] ?? null;
  };

  const findMembershipTierByName = async (client: GraphQLClient, name: string) => {
    const result = await client.request<any>(
      gql`
        query FindMembershipTierByName($name: String!) {
          membershipTiers(where: { name: { equals: $name } }, take: 1) {
            id
            name
          }
        }
      `,
      { name }
    );

    return result?.membershipTiers?.[0] ?? null;
  };

  const findClassTypeByName = async (client: GraphQLClient, name: string) => {
    const result = await client.request<any>(
      gql`
        query FindClassTypeByName($name: String!) {
          classTypes(where: { name: { equals: $name } }, take: 1) {
            id
            name
          }
        }
      `,
      { name }
    );

    return result?.classTypes?.[0] ?? null;
  };

  const findSchedule = async (
    client: GraphQLClient,
    input: { name: string; dayOfWeek: string; startTime: string; instructorId: string }
  ) => {
    const result = await client.request<any>(
      gql`
        query FindSchedule($name: String!, $dayOfWeek: String!, $startTime: String!, $instructorId: ID!) {
          classSchedules(
            where: {
              name: { equals: $name }
              dayOfWeek: { equals: $dayOfWeek }
              startTime: { equals: $startTime }
              instructor: { id: { equals: $instructorId } }
            }
            take: 1
          ) {
            id
          }
        }
      `,
      input
    );

    return result?.classSchedules?.[0] ?? null;
  };

  const findClassInstance = async (
    client: GraphQLClient,
    input: { classScheduleId: string; date: string }
  ) => {
    const result = await client.request<any>(
      gql`
        query FindClassInstance($classScheduleId: ID!, $date: DateTime!) {
          classInstances(
            where: {
              classSchedule: { id: { equals: $classScheduleId } }
              date: { equals: $date }
            }
            take: 1
          ) {
            id
          }
        }
      `,
      input
    );

    return result?.classInstances?.[0] ?? null;
  };

  const findMemberByEmail = async (client: GraphQLClient, email: string) => {
    const result = await client.request<any>(
      gql`
        query FindMemberByEmail($email: String!) {
          members(where: { email: { equals: $email } }, take: 1) {
            id
            email
            user {
              id
            }
            membershipTier {
              id
            }
          }
        }
      `,
      { email }
    );

    return result?.members?.[0] ?? null;
  };

  const findMembershipByUserId = async (client: GraphQLClient, userId: string) => {
    const result = await client.request<any>(
      gql`
        query FindMembershipByUserId($userId: ID!) {
          memberships(where: { member: { id: { equals: $userId } } }, take: 1) {
            id
          }
        }
      `,
      { userId }
    );

    return result?.memberships?.[0] ?? null;
  };

  const findBooking = async (
    client: GraphQLClient,
    input: { classInstanceId: string; memberId: string }
  ) => {
    const result = await client.request<any>(
      gql`
        query FindBooking($classInstanceId: ID!, $memberId: ID!) {
          classBookings(
            where: {
              classInstance: { id: { equals: $classInstanceId } }
              member: { id: { equals: $memberId } }
            }
            take: 1
          ) {
            id
          }
        }
      `,
      input
    );

    return result?.classBookings?.[0] ?? null;
  };

  const runOnboarding = async () => {
    setIsLoading(true);
    setError(null);
    resetOnboardingState();
    setStep('progress');
    setProgress('Starting gym setup…');

    const startResult = await startOnboarding();
    if (!startResult?.success) {
      setError(startResult?.error || 'Failed to mark onboarding as in progress');
      setIsLoading(false);
      return;
    }

    try {
      const client = new GraphQLClient(GRAPHQL_ENDPOINT, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      // Ordered dependency chain:
      // 1. gym settings
      // 2. location
      // 3. membership tiers
      // 4. class types
      // 5. instructors (need instructor role + user accounts)
      // 6. class schedules (need instructors)
      // 7. class instances (need schedules)
      // 8. demo member + membership + bookings

      setProgress('Creating gym profile…');
      await createGymSettings(client, currentJsonData);

      setProgress('Creating gym location…');
      await createLocation(client, currentJsonData);

      setProgress('Creating membership plans…');
      const tierIds = await createMembershipTiers(client, currentJsonData);

      setProgress('Creating class types…');
      await createClassTypes(client, currentJsonData);

      setProgress('Creating instructors…');
      const instructorIds = await createInstructors(client, currentJsonData);

      setProgress('Creating recurring schedules…');
      const schedules = await createSchedules(client, currentJsonData, instructorIds);

      setProgress('Generating upcoming class instances…');
      const instanceIds = await createClassInstances(client, schedules, instructorIds);

      setProgress('Creating demo member account…');
      await createDemoMember(client, currentJsonData, tierIds, instanceIds);

      setProgress('Setup complete!');
      const completionResult = await completeOnboarding();
      if (!completionResult?.success) {
        throw new Error(completionResult?.error || 'Failed to mark onboarding as completed');
      }
      router.refresh();
      setStep('done');
    } catch (e: any) {
      handleOnboardingError(e);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Gym Settings ─────────────────────────────────────────────────────────
  const createGymSettings = async (client: GraphQLClient, data: any) => {
    const settings = data.gymSettings;
    if (!settings) return;

    const itemName = settings.name || 'Gym profile';
    setItemLoading('gymSettings', itemName);

    const queryExisting = gql`
      query ExistingGymSettings {
        gymSettingsItems(take: 1) { id }
      }
    `;

    const payload = {
      name: settings.name,
      tagline: settings.tagline,
      description: settings.description,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      currencyCode: settings.currencyCode || 'USD',
      locale: settings.locale || 'en-US',
      timezone: settings.timezone || 'America/New_York',
      countryCode: settings.countryCode || 'US',
      hours: settings.hours || {},
      heroEyebrow: settings.heroEyebrow,
      heroHeadline: settings.heroHeadline,
      heroSubheadline: settings.heroSubheadline,
      heroPrimaryCtaLabel: settings.heroPrimaryCtaLabel,
      heroPrimaryCtaHref: settings.heroPrimaryCtaHref,
      heroSecondaryCtaLabel: settings.heroSecondaryCtaLabel,
      heroSecondaryCtaHref: settings.heroSecondaryCtaHref,
      promoBanner: settings.promoBanner,
      footerTagline: settings.footerTagline,
      copyrightName: settings.copyrightName,
      facilityHeadline: settings.facilityHeadline,
      facilityDescription: settings.facilityDescription,
      facilityHighlights: settings.facilityHighlights || [],
      heroStats: settings.heroStats || [],
      contactTopics: settings.contactTopics || [],
      rating: settings.rating?.toString?.() ?? settings.rating,
      reviewCount: settings.reviewCount ?? 0,
    };

    try {
      const existing = await client.request<any>(queryExisting);
      const existingId = existing?.gymSettingsItems?.[0]?.id;

      if (existingId) {
        await client.request(
          gql`
            mutation UpdateGymSettings($where: GymSettingsWhereUniqueInput!, $data: GymSettingsUpdateInput!) {
              updateGymSettings(where: $where, data: $data) { id }
            }
          `,
          {
            where: { id: existingId },
            data: payload,
          }
        );
      } else {
        await client.request(
          gql`
            mutation CreateGymSettings($data: GymSettingsCreateInput!) {
              createGymSettings(data: $data) { id }
            }
          `,
          {
            data: payload,
          }
        );
      }

      setItemCompleted('gymSettings', itemName);
    } catch (e: any) {
      const msg = extractErrorMessage(e);
      setItemError('gymSettings', itemName, msg);
      throw e;
    }
  };

  // ─── Location ─────────────────────────────────────────────────────────────
  const createLocation = async (client: GraphQLClient, data: any) => {
    const loc = data.location;
    if (!loc) return;

    const itemName = loc.name || 'Main location';
    setItemLoading('location', itemName);

    const payload = {
      name: loc.name,
      address: loc.address ?? '',
      phone: loc.phone ?? '',
      isActive: loc.isActive ?? true,
    };

    try {
      const existing = await findLocationByName(client, loc.name);

      if (existing?.id) {
        await client.request(
          gql`
            mutation UpdateLocation($id: ID!, $data: LocationUpdateInput!) {
              updateLocation(where: { id: $id }, data: $data) { id }
            }
          `,
          { id: existing.id, data: payload }
        );
      } else {
        await client.request(
          gql`
            mutation CreateLocation($data: LocationCreateInput!) {
              createLocation(data: $data) { id }
            }
          `,
          { data: payload }
        );
      }

      setItemCompleted('location', itemName);
    } catch (e: any) {
      const msg = extractErrorMessage(e);
      setItemError('location', itemName, msg);
      throw e;
    }
  };

  // ─── Membership Tiers ─────────────────────────────────────────────────────
  const createMembershipTiers = async (client: GraphQLClient, data: any): Promise<Record<string, string>> => {
    const ids: Record<string, string> = {};

    for (const tier of data.membershipTiers ?? []) {
      const name = tier.name ?? 'Plan';
      setItemLoading('membershipTiers', name);

      const payload = {
        name: tier.name,
        description: toDocument(tier.description),
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
      };

      try {
        const existing = await findMembershipTierByName(client, tier.name);

        if (existing?.id) {
          await client.request<any>(
            gql`
              mutation UpdateMembershipTier($id: ID!, $data: MembershipTierUpdateInput!) {
                updateMembershipTier(where: { id: $id }, data: $data) { id }
              }
            `,
            { id: existing.id, data: payload }
          );
          ids[tier.handle] = existing.id;
        } else {
          const result = await client.request<any>(
            gql`
              mutation CreateTier($data: MembershipTierCreateInput!) {
                createMembershipTier(data: $data) { id name }
              }
            `,
            { data: payload }
          );
          ids[tier.handle] = result.createMembershipTier.id;
        }

        setItemCompleted('membershipTiers', name);
      } catch (e: any) {
        const msg = extractErrorMessage(e);
        setItemError('membershipTiers', name, msg);
        throw e;
      }
    }

    return ids;
  };

  // ─── Class Types ──────────────────────────────────────────────────────────
  const createClassTypes = async (client: GraphQLClient, data: any): Promise<Record<string, string>> => {
    const ids: Record<string, string> = {};

    for (const ct of data.classTypes ?? []) {
      const name = ct.name ?? 'Class';
      setItemLoading('classTypes', name);

      const payload = {
        name: ct.name,
        description: toDocument(ct.description),
        difficulty: ct.difficulty ?? 'all-levels',
        duration: ct.duration ?? 60,
        caloriesBurn: ct.caloriesBurn ?? null,
        equipmentNeeded: ct.equipmentNeeded ?? [],
      };

      try {
        const existing = await findClassTypeByName(client, ct.name);

        if (existing?.id) {
          await client.request<any>(
            gql`
              mutation UpdateClassType($id: ID!, $data: ClassTypeUpdateInput!) {
                updateClassType(where: { id: $id }, data: $data) { id }
              }
            `,
            { id: existing.id, data: payload }
          );
          ids[ct.handle] = existing.id;
        } else {
          const result = await client.request<any>(
            gql`
              mutation CreateClassType($data: ClassTypeCreateInput!) {
                createClassType(data: $data) { id name }
              }
            `,
            { data: payload }
          );
          ids[ct.handle] = result.createClassType.id;
        }

        setItemCompleted('classTypes', name);
      } catch (e: any) {
        const msg = extractErrorMessage(e);
        setItemError('classTypes', name, msg);
        throw e;
      }
    }

    return ids;
  };

  // ─── Instructors ──────────────────────────────────────────────────────────
  const createInstructors = async (client: GraphQLClient, data: any): Promise<Record<string, string>> => {
    const ids: Record<string, string> = {};
    const instructorRoleId = await ensureInstructorRole(client);

    for (const inst of data.instructors ?? []) {
      const fullName = `${inst.firstName ?? ''} ${inst.lastName ?? ''}`.trim() || 'Instructor';
      setItemLoading('instructors', fullName);

      try {
        const existingUser = await findUserByEmail(client, inst.email);
        let userId = existingUser?.id as string | undefined;

        if (userId) {
          await client.request<any>(
            gql`
              mutation UpdateInstructorUser($id: ID!, $data: UserUpdateInput!) {
                updateUser(where: { id: $id }, data: $data) { id }
              }
            `,
            {
              id: userId,
              data: {
                name: fullName,
                onboardingStatus: 'completed',
                role: { connect: { id: instructorRoleId } },
              },
            }
          );
        } else {
          const password = `Demo#${Math.random().toString(36).slice(2, 10)}`;
          const userResult = await client.request<any>(
            gql`
              mutation CreateInstructorUser($data: UserCreateInput!) {
                createUser(data: $data) { id }
              }
            `,
            {
              data: {
                name: fullName,
                email: inst.email,
                password,
                onboardingStatus: 'completed',
                role: { connect: { id: instructorRoleId } },
              },
            }
          );
          userId = userResult.createUser.id as string;
        }

        const payload = {
          user: { connect: { id: userId } },
          bio: toDocument(inst.bio),
          specialties: inst.specialties ?? [],
          certifications: inst.certifications ?? [],
          photo: inst.photo ?? '',
          isActive: inst.isActive ?? true,
        };

        const existingInstructor = await findInstructorByUserId(client, userId);

        if (existingInstructor?.id) {
          await client.request<any>(
            gql`
              mutation UpdateInstructor($id: ID!, $data: InstructorUpdateInput!) {
                updateInstructor(where: { id: $id }, data: $data) { id }
              }
            `,
            { id: existingInstructor.id, data: payload }
          );
          ids[inst.handle] = existingInstructor.id;
        } else {
          const instructorResult = await client.request<any>(
            gql`
              mutation CreateInstructor($data: InstructorCreateInput!) {
                createInstructor(data: $data) { id }
              }
            `,
            { data: payload }
          );
          ids[inst.handle] = instructorResult.createInstructor.id;
        }

        setItemCompleted('instructors', fullName);
      } catch (e: any) {
        const msg = extractErrorMessage(e);
        setItemError('instructors', fullName, msg);
        throw e;
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

    for (const sched of data.schedules ?? []) {
      const instructorId = instructorIds[sched.instructorHandle];
      if (!instructorId) continue;

      const label = formatScheduleDisplayName(sched);
      setItemLoading('schedules', label);

      const payload = {
        name: sched.name,
        description: sched.description ?? '',
        dayOfWeek: sched.dayOfWeek,
        startTime: sched.startTime,
        endTime: sched.endTime,
        maxCapacity: sched.maxCapacity,
        isActive: sched.isActive ?? true,
        instructor: { connect: { id: instructorId } },
      };

      try {
        const existing = await findSchedule(client, {
          name: sched.name,
          dayOfWeek: sched.dayOfWeek,
          startTime: sched.startTime,
          instructorId,
        });

        let scheduleId = existing?.id as string | undefined;

        if (scheduleId) {
          await client.request<any>(
            gql`
              mutation UpdateSchedule($id: ID!, $data: ClassScheduleUpdateInput!) {
                updateClassSchedule(where: { id: $id }, data: $data) { id }
              }
            `,
            { id: scheduleId, data: payload }
          );
        } else {
          const result = await client.request<any>(
            gql`
              mutation CreateSchedule($data: ClassScheduleCreateInput!) {
                createClassSchedule(data: $data) { id name }
              }
            `,
            { data: payload }
          );
          scheduleId = result.createClassSchedule.id;
        }

        created.push({
          id: scheduleId!,
          instructorHandle: sched.instructorHandle,
          dayOfWeek: sched.dayOfWeek,
          startTime: sched.startTime,
          endTime: sched.endTime,
          maxCapacity: sched.maxCapacity,
        });

        setItemCompleted('schedules', label);
      } catch (e: any) {
        const msg = extractErrorMessage(e);
        setItemError('schedules', label, msg);
        throw e;
      }
    }

    return created;
  };

  // ─── Class Instances (next 14 days) ──────────────────────────────────────
  const DAY_MAP: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
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

      for (let offset = 0; offset <= 14; offset++) {
        const d = new Date(today);
        d.setDate(today.getDate() + offset);
        if (d.getDay() !== targetDow) continue;

        const [h, m] = sched.startTime.split(':').map(Number);
        d.setHours(h, m, 0, 0);
        const iso = d.toISOString();

        const instrId = instructorIds[sched.instructorHandle];

        try {
          const existing = await findClassInstance(client, { classScheduleId: sched.id, date: iso });

          if (existing?.id) {
            instanceIds.push(existing.id);
            continue;
          }

          const result = await client.request<any>(
            gql`
              mutation CreateInstance($data: ClassInstanceCreateInput!) {
                createClassInstance(data: $data) { id }
              }
            `,
            {
              data: {
                classSchedule: { connect: { id: sched.id } },
                date: iso,
                maxCapacity: sched.maxCapacity,
                isCancelled: false,
                ...(instrId ? { instructor: { connect: { id: instrId } } } : {}),
              },
            }
          );

          instanceIds.push(result.createClassInstance.id);
        } catch {
          // Skip instance creation failures so the rest of onboarding can continue.
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

    const itemName = demo.name || 'Demo member';
    setItemLoading('demoMember', itemName);

    try {
      let user = await findUserByEmail(client, demo.email);
      let userId = user?.id as string | undefined;

      if (userId) {
        await client.request<any>(
          gql`
            mutation UpdateDemoUser($id: ID!, $data: UserUpdateInput!) {
              updateUser(where: { id: $id }, data: $data) { id }
            }
          `,
          {
            id: userId,
            data: {
              name: demo.name,
              phone: demo.phone ?? '',
            },
          }
        );
      } else {
        const userResult = await client.request<any>(
          gql`
            mutation CreateDemoUser($data: UserCreateInput!) {
              createUser(data: $data) { id }
            }
          `,
          {
            data: {
              name: demo.name,
              email: demo.email,
              password: demo.password,
              phone: demo.phone ?? '',
            },
          }
        );
        userId = userResult.createUser.id;
      }

      const tierId = tierIds[demo.membershipTierHandle ?? 'premium-monthly'];
      const existingMember = await findMemberByEmail(client, demo.email);
      let memberId = existingMember?.id as string | undefined;

      const memberPayload = {
        name: demo.name,
        email: demo.email,
        phone: demo.phone ?? '',
        status: 'active',
        joinDate: new Date().toISOString(),
        user: { connect: { id: userId } },
        ...(tierId ? { membershipTier: { connect: { id: tierId } } } : {}),
      };

      if (memberId) {
        await client.request<any>(
          gql`
            mutation UpdateMember($id: ID!, $data: MemberUpdateInput!) {
              updateMember(where: { id: $id }, data: $data) { id }
            }
          `,
          { id: memberId, data: memberPayload }
        );
      } else {
        const memberResult = await client.request<any>(
          gql`
            mutation CreateMember($data: MemberCreateInput!) {
              createMember(data: $data) { id }
            }
          `,
          { data: memberPayload }
        );
        memberId = memberResult.createMember.id;
      }

      if (tierId) {
        const existingMembership = await findMembershipByUserId(client, userId!);
        const start = new Date();
        const next = new Date(start);
        next.setMonth(next.getMonth() + 1);

        const membershipPayload = {
          member: { connect: { id: userId } },
          tier: { connect: { id: tierId } },
          status: 'active',
          billingCycle: 'monthly',
          startDate: start.toISOString(),
          nextBillingDate: next.toISOString(),
          autoRenew: true,
          classCreditsRemaining: -1,
        };

        if (existingMembership?.id) {
          await client.request<any>(
            gql`
              mutation UpdateMembership($id: ID!, $data: MembershipUpdateInput!) {
                updateMembership(where: { id: $id }, data: $data) { id }
              }
            `,
            { id: existingMembership.id, data: membershipPayload }
          );
        } else {
          await client.request<any>(
            gql`
              mutation CreateMembership($data: MembershipCreateInput!) {
                createMembership(data: $data) { id }
              }
            `,
            { data: membershipPayload }
          );
        }
      }

      const bookingInstances = instanceIds.slice(0, 3);
      for (const instanceId of bookingInstances) {
        const existingBooking = await findBooking(client, {
          classInstanceId: instanceId,
          memberId: memberId!,
        });

        if (existingBooking?.id) continue;

        try {
          await client.request<any>(
            gql`
              mutation CreateBooking($data: ClassBookingCreateInput!) {
                createClassBooking(data: $data) { id }
              }
            `,
            {
              data: {
                classInstance: { connect: { id: instanceId } },
                member: { connect: { id: memberId } },
                memberName: demo.name,
                memberEmail: demo.email,
                status: 'confirmed',
                bookedAt: new Date().toISOString(),
              },
            }
          );
        } catch {
          // Ignore booking conflicts so onboarding still completes.
        }
      }

      setItemCompleted('demoMember', itemName);
    } catch (e: any) {
      const msg = extractErrorMessage(e);
      setItemError('demoMember', itemName, msg);
      throw e;
    }
  };

  // ─── Error handling ───────────────────────────────────────────────────────
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
      if (failed) {
        setItemError(section.type, failed, msg);
        break;
      }
    }
  };

  return { runOnboarding };
}

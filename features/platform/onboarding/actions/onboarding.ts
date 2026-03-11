'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed';

type SeedInput = {
  membershipTiers?: any[];
  classTypes?: any[];
  instructors?: any[];
};

export async function updateOnboardingStatus(status: OnboardingStatus) {
  try {
    const query = `
      mutation UpdateOnboardingStatus($data: UserUpdateInput!) {
        updateActiveUser(data: $data) {
          id
          onboardingStatus
        }
      }
    `;

    const response = await keystoneClient(query, {
      data: { onboardingStatus: status }
    });

    if (!response.success) {
      return { success: false, error: response.error };
    }

    // Revalidate dashboard pages to reflect the change
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/(admin)');

    return { success: true, data: response.data?.updateActiveUser };
  } catch (error) {
    console.error('Error updating onboarding status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

/**
 * Seeds core gym entities from onboarding template JSON.
 * This mirrors Openfront/Openfront-restaurant onboarding behavior:
 * template selection -> seed usable demo data -> mark onboarding completed.
 */
export async function seedGymFromOnboarding(input: SeedInput) {
  try {
    await updateOnboardingStatus('in_progress');

    const errors: string[] = [];

    // 1) Membership Tiers
    for (const tier of input.membershipTiers || []) {
      const mutation = `
        mutation CreateTier($data: MembershipTierCreateInput!) {
          createMembershipTier(data: $data) { id name }
        }
      `;

      const response = await keystoneClient(mutation, {
        data: {
          name: tier.name,
          monthlyPrice: tier.monthlyPrice,
          annualPrice: tier.annualPrice,
          classCreditsPerMonth: tier.classCreditsPerMonth ?? 0,
          accessHours: tier.accessHours ?? 'limited',
          guestPasses: tier.guestPasses ?? 0,
          personalTrainingSessions: tier.personalTrainingSessions ?? 0,
          freezeAllowed: Boolean(tier.freezeAllowed),
          contractLength: tier.contractLength ?? 0,
          billingInterval: 'monthly',
          hasGuestPrivileges: (tier.guestPasses ?? 0) > 0,
          features: [],
        }
      });

      if (!response.success) {
        errors.push(`Tier ${tier.name}: ${response.error}`);
      }
    }

    // 2) Class Types
    for (const classType of input.classTypes || []) {
      const mutation = `
        mutation CreateClassType($data: ClassTypeCreateInput!) {
          createClassType(data: $data) { id name }
        }
      `;

      const response = await keystoneClient(mutation, {
        data: {
          name: classType.name,
          difficulty: classType.difficulty ?? 'all-levels',
          duration: classType.duration ?? 60,
          caloriesBurn: classType.caloriesBurn ?? null,
          equipmentNeeded: classType.equipmentNeeded ?? [],
        }
      });

      if (!response.success) {
        errors.push(`ClassType ${classType.name}: ${response.error}`);
      }
    }

    // 3) Instructors (create User + Instructor relation)
    for (const instructor of input.instructors || []) {
      const createUserMutation = `
        mutation CreateInstructorUser($data: UserCreateInput!) {
          createUser(data: $data) { id name email }
        }
      `;

      const generatedPassword = `Instructor#${Math.random().toString(36).slice(2, 10)}`;
      const fullName = `${instructor.firstName || ''} ${instructor.lastName || ''}`.trim() || 'Instructor';

      const userResp = await keystoneClient(createUserMutation, {
        data: {
          name: fullName,
          email: instructor.email,
          password: generatedPassword,
          onboardingStatus: 'completed',
        }
      });

      if (!userResp.success || !userResp.data?.createUser?.id) {
        errors.push(`Instructor user ${instructor.email}: ${userResp.success ? 'Unknown user creation error' : userResp.error}`);
        continue;
      }

      const createInstructorMutation = `
        mutation CreateInstructor($data: InstructorCreateInput!) {
          createInstructor(data: $data) { id }
        }
      `;

      const instructorResp = await keystoneClient(createInstructorMutation, {
        data: {
          user: { connect: { id: userResp.data.createUser.id } },
          specialties: instructor.specialties ?? [],
          certifications: instructor.certifications ?? [],
          isActive: instructor.isActive ?? true,
        }
      });

      if (!instructorResp.success) {
        errors.push(`Instructor profile ${fullName}: ${instructorResp.error}`);
      }
    }

    await updateOnboardingStatus('completed');

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/(admin)');

    return {
      success: errors.length === 0,
      errors,
    };
  } catch (error) {
    console.error('Error seeding onboarding data:', error);
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown seeding error'],
    };
  }
}

export async function dismissOnboarding() {
  return updateOnboardingStatus('dismissed');
}

export async function startOnboarding() {
  return updateOnboardingStatus('in_progress');
}

export async function completeOnboarding() {
  return updateOnboardingStatus('completed');
}

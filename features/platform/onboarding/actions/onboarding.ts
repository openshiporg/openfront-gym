'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import type { OnboardingStatus } from './onboardingPolicy';

export type { OnboardingStatus } from './onboardingPolicy';

type OnboardingActor = {
  id: string;
  organization?: { id: string } | null;
  onboardingStatus: OnboardingStatus;
  role?: { canManageOnboarding?: boolean } | null;
};

async function getOnboardingActor(): Promise<OnboardingActor> {
  const response = await keystoneClient<{ authenticatedItem?: OnboardingActor | null }>(`
    query OnboardingActor {
      authenticatedItem {
        ... on User {
          id onboardingStatus organization { id } role { canManageOnboarding }
        }
      }
    }
  `);
  const actor = response.success ? response.data?.authenticatedItem : null;
  if (!actor?.id) throw new Error('Authentication required');
  if (!actor.role?.canManageOnboarding) throw new Error('Onboarding management permission required');
  return actor;
}

export async function updateOnboardingStatus(status: OnboardingStatus) {
  try {
    await getOnboardingActor();
    const response = await keystoneClient<{
      transitionOnboardingStatus: { id: string; onboardingStatus: OnboardingStatus };
    }>(`
      mutation TransitionOnboardingStatus($status: String!) {
        transitionOnboardingStatus(status: $status) { id onboardingStatus }
      }
    `, { status });
    if (!response.success) throw new Error(response.error);
    revalidatePath('/dashboard', 'layout');
    revalidatePath('/dashboard');
    return { success: true as const, data: response.data.transitionOnboardingStatus };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unable to update onboarding status',
    };
  }
}

export async function dismissOnboarding() {
  return updateOnboardingStatus('dismissed');
}

export async function startOnboarding() {
  return updateOnboardingStatus('in_progress');
}

export async function runDeterministicOnboardingAction(template: 'minimal' | 'full') {
  const actor = await getOnboardingActor();
  if (actor.onboardingStatus !== 'in_progress') throw new Error('Onboarding must be in progress before seeding.');
  const response = await keystoneClient<{
    runDeterministicOnboarding: { success: boolean; instanceCount: number };
  }>(`
    mutation RunDeterministicOnboarding($template: String!) {
      runDeterministicOnboarding(template: $template) { success organizationId runId instanceCount }
    }
  `, { template });
  if (!response.success || !response.data?.runDeterministicOnboarding?.success) {
    throw new Error(response.success ? 'Deterministic onboarding failed.' : response.error);
  }
  return response.data.runDeterministicOnboarding;
}

export async function completeOnboarding() {
  try {
    const actor = await getOnboardingActor();
    if (actor.onboardingStatus !== 'completed') {
      throw new Error('Deterministic onboarding has not completed yet.');
    }
    return { success: true as const, data: { id: actor.id, onboardingStatus: 'completed' as const } };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unable to complete onboarding',
    };
  }
}

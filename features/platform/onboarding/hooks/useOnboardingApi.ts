import { useRouter } from 'next/navigation';
import {
  startOnboarding,
  completeOnboarding,
  runDeterministicOnboardingAction,
} from '../actions/onboarding';
import { SECTION_DEFINITIONS } from '../config/templates';
import { getItemsFromJsonData } from '../utils/dataUtils';
import { TemplateType, OnboardingStep } from './useOnboardingState';

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

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'response' in error) {
    const errors = (error as any).response?.errors;
    if (Array.isArray(errors)) return errors.map((item) => item?.message).filter(Boolean).join('\n');
  }
  return error instanceof Error ? error.message : 'Gym setup failed';
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

  const runOnboarding = async () => {
    setIsLoading(true);
    setError(null);
    resetOnboardingState();
    setStep('progress');

    const sections = SECTION_DEFINITIONS.map((section) => ({
      section,
      items: getItemsFromJsonData(currentJsonData, section.type),
    }));
    for (const { section, items } of sections) {
      for (const item of items) setItemLoading(section.type, item);
    }

    try {
      setProgress('Starting tenant-scoped starter setup…');
      const startResult = await startOnboarding();
      if (!startResult?.success) {
        throw new Error(startResult?.error || 'Unable to start onboarding');
      }

      setProgress('Creating the selected plans, class catalog, instructors, schedules, and future class instances…');
      await runDeterministicOnboardingAction(selectedTemplate);

      const completionResult = await completeOnboarding();
      if (!completionResult?.success) {
        throw new Error(completionResult?.error || 'Unable to verify onboarding data');
      }

      for (const { section, items } of sections) {
        for (const item of items) setItemCompleted(section.type, item);
      }
      setProgress('Starter setup complete. Review business details and connect Stripe before publishing.');
      router.refresh();
      setStep('done');
    } catch (error) {
      const message = errorMessage(error);
      setError(message);
      for (const { section, items } of sections) {
        const completed = completedItems[section.type] ?? [];
        const failed = items.find((item) => !completed.includes(item));
        if (failed) {
          setItemError(section.type, failed, message);
          break;
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return { runOnboarding };
}

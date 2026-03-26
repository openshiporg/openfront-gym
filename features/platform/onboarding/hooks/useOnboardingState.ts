import { useState, useEffect } from 'react';
import { GYM_TEMPLATES } from '../config/templates';
import { getSeedForTemplate, getItemsFromJsonData } from '../utils/dataUtils';
import seedData from '../lib/seed.json';

export type OnboardingStep = 'template' | 'progress' | 'done';
export type TemplateType = 'full' | 'minimal' | 'custom';

export interface OnboardingState {
  step: OnboardingStep;
  selectedTemplate: TemplateType;
  currentJsonData: any;
  customJsonApplied: boolean;
  progressMessage: string;
  loadingItems: Record<string, string[]>;
  completedItems: Record<string, string[]>;
  error: string | null;
  itemErrors: Record<string, Record<string, string>>;
  isLoading: boolean;
}

const initialItemsState = {
  membershipTiers: [],
  classTypes: [],
  instructors: [],
};

export function useOnboardingState() {
  const [state, setState] = useState<OnboardingState>({
    step: 'template',
    selectedTemplate: 'minimal',
    currentJsonData: null,
    customJsonApplied: false,
    progressMessage: '',
    loadingItems: { ...initialItemsState },
    completedItems: { ...initialItemsState },
    error: null,
    itemErrors: {},
    isLoading: false,
  });

  // Load JSON data when template changes
  useEffect(() => {
    if (state.selectedTemplate !== 'custom') {
      const templateData = getSeedForTemplate(state.selectedTemplate, seedData);
      setState(prev => ({
        ...prev,
        currentJsonData: templateData,
        customJsonApplied: false,
      }));
    } else {
      // For custom, start with basic template data as placeholder
      const basicData = getSeedForTemplate('minimal', seedData);
      setState(prev => ({
        ...prev,
        currentJsonData: basicData,
        customJsonApplied: false,
      }));
    }
  }, [state.selectedTemplate]);

  const setStep = (step: OnboardingStep) => {
    setState(prev => ({ ...prev, step }));
  };

  const setSelectedTemplate = (template: TemplateType) => {
    setState(prev => ({ ...prev, selectedTemplate: template }));
  };

  const setCurrentJsonData = (data: any) => {
    setState(prev => ({ ...prev, currentJsonData: data }));
  };

  const setCustomJsonApplied = (applied: boolean) => {
    setState(prev => ({ ...prev, customJsonApplied: applied }));
  };

  const setIsLoading = (loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }));
  };

  const setError = (error: string | null) => {
    setState(prev => ({ ...prev, error }));
  };

  const setProgressMessage = (message: string) => {
    setState(prev => ({ ...prev, progressMessage: message }));
  };

  const setLoadingItems = (items: Record<string, string[]>) => {
    setState(prev => ({ ...prev, loadingItems: items }));
  };

  const setCompletedItems = (items: Record<string, string[]>) => {
    setState(prev => ({ ...prev, completedItems: items }));
  };

  const setItemErrors = (errors: Record<string, Record<string, string>>) => {
    setState(prev => ({ ...prev, itemErrors: errors }));
  };

  // Helper function to get display names from current data
  const getDisplayNamesFromData = (data: any) => {
    return {
      membershipTiers: getItemsFromJsonData(data, 'membershipTiers'),
      classTypes: getItemsFromJsonData(data, 'classTypes'),
      instructors: getItemsFromJsonData(data, 'instructors'),
    };
  };

  // Progress handler — bulk-completes prior sections as we advance
  const setProgress = (message: string) => {
    setProgressMessage(message);

    const displayNames = state.currentJsonData
      ? getDisplayNamesFromData(state.currentJsonData)
      : GYM_TEMPLATES[state.selectedTemplate].displayNames;

    if (message.includes('class type') || message.includes('class types')) {
      // Membership tiers done
      setState(prev => ({
        ...prev,
        completedItems: {
          ...prev.completedItems,
          membershipTiers: [...displayNames.membershipTiers],
        },
        loadingItems: {
          ...prev.loadingItems,
          membershipTiers: [],
        },
      }));
    } else if (message.includes('instructor')) {
      // Membership tiers + class types done
      setState(prev => ({
        ...prev,
        completedItems: {
          ...prev.completedItems,
          membershipTiers: [...displayNames.membershipTiers],
          classTypes: [...displayNames.classTypes],
        },
        loadingItems: {
          ...prev.loadingItems,
          membershipTiers: [],
          classTypes: [],
        },
      }));
    } else if (message.toLowerCase().includes('complete')) {
      // Everything done
      setState(prev => ({
        ...prev,
        loadingItems: {
          membershipTiers: [],
          classTypes: [],
          instructors: [],
        },
        completedItems: {
          membershipTiers: [...displayNames.membershipTiers],
          classTypes: [...displayNames.classTypes],
          instructors: [...displayNames.instructors],
        },
      }));
    }
  };

  const setItemLoading = (type: string, item: string) => {
    setState(prev => ({
      ...prev,
      loadingItems: {
        ...prev.loadingItems,
        [type]: [...(prev.loadingItems[type] || []), item],
      },
      itemErrors: {
        ...prev.itemErrors,
        [type]: prev.itemErrors[type]
          ? { ...prev.itemErrors[type], [item]: undefined as any }
          : {},
      },
    }));
  };

  const setItemCompleted = (type: string, item: string) => {
    setState(prev => ({
      ...prev,
      loadingItems: {
        ...prev.loadingItems,
        [type]: (prev.loadingItems[type] || []).filter((i) => i !== item),
      },
      completedItems: {
        ...prev.completedItems,
        [type]: [...(prev.completedItems[type] || []), item],
      },
      itemErrors: {
        ...prev.itemErrors,
        [type]: prev.itemErrors[type]
          ? { ...prev.itemErrors[type], [item]: undefined as any }
          : {},
      },
    }));
  };

  const setItemError = (type: string, item: string, errorMessage: string) => {
    setState(prev => ({
      ...prev,
      loadingItems: {
        ...prev.loadingItems,
        [type]: (prev.loadingItems[type] || []).filter((i) => i !== item),
      },
      itemErrors: {
        ...prev.itemErrors,
        [type]: {
          ...(prev.itemErrors[type] || {}),
          [item]: errorMessage,
        },
      },
    }));
  };

  const resetOnboardingState = () => {
    setState(prev => ({
      ...prev,
      error: null,
      itemErrors: {},
      loadingItems: { ...initialItemsState },
      completedItems: { ...initialItemsState },
    }));
  };

  return {
    ...state,
    setStep,
    setSelectedTemplate,
    setCurrentJsonData,
    setCustomJsonApplied,
    setIsLoading,
    setError,
    setProgress,
    setLoadingItems,
    setCompletedItems,
    setItemErrors,
    setItemLoading,
    setItemCompleted,
    setItemError,
    resetOnboardingState,
    getDisplayNamesFromData,
  };
}

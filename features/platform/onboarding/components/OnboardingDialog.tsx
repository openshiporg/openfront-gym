'use client';

import React from 'react';
import {
  AlertCircle,
  Dumbbell,
  Loader2,
  Package,
  Building2,
  CircleCheck,
  ArrowUpRight,
  Eye,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge-button';
import { SectionRenderer } from './SectionRenderer';
import { useOnboardingState } from '../hooks/useOnboardingState';
import { useOnboardingApi } from '../hooks/useOnboardingApi';
import { getItemsFromJsonData } from '../utils/dataUtils';
import { GYM_TEMPLATES, SECTION_DEFINITIONS } from '../config/templates';

// Stripe env var hint for gym membership payments
const PAYMENT_ENV_VARS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];

const StripeEnvHint = () => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Eye className="ml-2 h-3 w-3 cursor-help text-red-500" />
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="p-3 text-xs max-w-sm z-[100]">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-3">
            For Stripe-backed membership billing, add these server env vars and configure monthly/annual Stripe Price IDs on each plan:
          </p>
          {PAYMENT_ENV_VARS.map((v) => (
            <div key={v} className="flex items-center gap-2">
              <code className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded text-xs font-mono">{v}</code>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

interface OnboardingDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function ActionButtons({
  step,
  isLoading,
  runOnboarding,
  fullWidth = false,
}: {
  step: 'template' | 'progress' | 'done';
  isLoading: boolean;
  runOnboarding: () => void;
  fullWidth?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 w-full">
      {step === 'done' ? (
        <>
          <DialogClose asChild>
            <Button type="button" variant="outline" className={fullWidth ? 'flex-1' : 'w-full sm:w-auto'}>
              Close
            </Button>
          </DialogClose>
          <Button asChild className={fullWidth ? 'flex-1' : 'w-full sm:w-auto'}>
            <a href="/" target="_blank" rel="noopener noreferrer">
              Preview starter site
              <ArrowUpRight className="ml-1.5 h-4 w-4" />
            </a>
          </Button>
        </>
      ) : (
        <>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={isLoading} className={fullWidth ? 'flex-1' : 'w-full sm:w-auto'}>
              Cancel
            </Button>
          </DialogClose>
          {isLoading ? (
            <Button disabled className={fullWidth ? 'flex-1' : 'w-full sm:w-auto'}>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </Button>
          ) : (
            <Button onClick={runOnboarding} className={fullWidth ? 'flex-1' : 'w-full sm:w-auto'}>
              Confirm
            </Button>
          )}
        </>
      )}
    </div>
  );
}

const OnboardingDialog: React.FC<OnboardingDialogProps> = ({ isOpen, onClose }) => {
  const onboardingState = useOnboardingState();
  const {
    step,
    selectedTemplate,
    currentJsonData,
    progressMessage,
    loadingItems,
    completedItems,
    error,
    itemErrors,
    isLoading,
    setStep,
    setSelectedTemplate,
    setProgress,
    setItemLoading,
    setItemCompleted,
    setItemError,
    setError,
    setIsLoading,
    resetOnboardingState,
  } = onboardingState;

  const { runOnboarding } = useOnboardingApi({
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
  });

  if (!isOpen) return null;

  const displayNames = currentJsonData
    ? {
        gymSettings: getItemsFromJsonData(currentJsonData, 'gymSettings'),
        location: getItemsFromJsonData(currentJsonData, 'location'),
        membershipTiers: getItemsFromJsonData(currentJsonData, 'membershipTiers'),
        classTypes: getItemsFromJsonData(currentJsonData, 'classTypes'),
        instructors: getItemsFromJsonData(currentJsonData, 'instructors'),
        schedules: getItemsFromJsonData(currentJsonData, 'schedules'),
        paymentProviders: getItemsFromJsonData(currentJsonData, 'paymentProviders'),
      }
    : GYM_TEMPLATES[selectedTemplate].displayNames;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[95vw] flex-col overflow-hidden p-0 gap-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-4 sm:px-6 py-4 mb-0 shrink-0">
          <DialogTitle>Gym Setup</DialogTitle>
          <DialogDescription>
            Choose tenant-scoped starter data, review every section, and confirm setup without creating members or financial evidence.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Left panel — controls + status */}
          <div className="order-1 flex shrink-0 flex-col lg:order-none lg:w-80 lg:justify-between lg:border-r">
            <div className="flex-1">
              <div className="p-4 sm:p-6">
                {/* Header */}
                <div className="flex items-center space-x-3">
                  <div className="inline-flex shrink-0 items-center justify-center rounded-sm bg-muted p-3">
                    <Dumbbell className="size-5 text-foreground" aria-hidden />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-medium text-foreground">Gym Setup</h3>
                    <p className="text-sm text-muted-foreground">
                      {step === 'done'
                        ? 'Starter configuration created'
                        : 'Create transparent, non-financial starter data'}
                    </p>
                  </div>
                </div>
                <Separator className="my-4" />

                {step === 'done' ? (
                  <>
                    <h4 className="text-sm font-medium text-foreground mb-2">Setup Complete</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Your {selectedTemplate === 'minimal' ? 'basic' : 'complete'} starter setup is ready to review. Replace sample business details before publishing.
                    </p>
                    <div className="flex items-center space-x-2 text-sm text-emerald-600 dark:text-emerald-500 mb-4">
                      <CircleCheck className="h-4 w-4 fill-emerald-500 text-background" />
                      <span>Setup complete</span>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                        <span className="font-medium">
                          {displayNames.gymSettings.length} gym profile{displayNames.gymSettings.length === 1 ? '' : 's'} configured
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                        <span className="font-medium">
                          {displayNames.location.length} location{displayNames.location.length === 1 ? '' : 's'} created
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                        <span className="font-medium">
                          {displayNames.membershipTiers.length} membership plan{displayNames.membershipTiers.length === 1 ? '' : 's'} created
                        </span>
                        <StripeEnvHint />
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                        <span className="font-medium">
                          {displayNames.classTypes.length} class type{displayNames.classTypes.length === 1 ? '' : 's'} created
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                        <span className="font-medium">
                          {displayNames.instructors.length} sample instructor{displayNames.instructors.length === 1 ? '' : 's'} created with reserved emails; replace each email before inviting a coach
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                        <span className="font-medium">
                          {displayNames.schedules.length} recurring schedule{displayNames.schedules.length === 1 ? '' : 's'} created
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                        <span className="font-medium">Upcoming class instances generated for the next 14 days</span>
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                        <span className="font-medium">
                          Stripe integration status created from server credential configuration, without payment methods, subscriptions, charges, or revenue
                        </span>
                        <StripeEnvHint />
                      </div>
                    </div>
                  </>
                ) : !isLoading ? (
                  <>
                    <h4 className="text-sm font-medium text-foreground mb-4">Setup Type</h4>

                    {/* Mobile: Dropdown */}
                    <div className="block lg:hidden">
                      <Select
                        value={selectedTemplate}
                        onValueChange={(value) => setSelectedTemplate(value as 'minimal' | 'full')}
                      >
                        <SelectTrigger className="w-full h-auto py-3">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minimal">
                            <div className="flex flex-col items-start text-left">
                              <span className="font-medium">Basic Setup</span>
                              <span className="text-xs text-muted-foreground">One plan, one class, one instructor, recurring schedules</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="full">
                            <div className="flex flex-col items-start text-left">
                              <span className="font-medium">Complete Setup</span>
                              <span className="text-xs text-muted-foreground">Sample plans, classes, instructors, and schedules; no member or financial records</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Desktop: Radio Group */}
                    <div className="hidden lg:block">
                      <RadioGroup
                        value={selectedTemplate}
                        onValueChange={(value) => setSelectedTemplate(value as 'minimal' | 'full')}
                        className="space-y-4"
                      >
                        {[
                          {
                            value: 'minimal' as const,
                            icon: Package,
                            label: 'Basic Setup',
                            desc: 'One plan, one class, one instructor, recurring schedules',
                          },
                          {
                            value: 'full' as const,
                            icon: Building2,
                            label: 'Complete Starter Setup',
                            desc: 'Sample plans, classes, instructors, and schedules; no member or financial records',
                          },
                        ].map(({ value, icon: Icon, label, desc }) => (
                          <div
                            key={value}
                            className={`border p-4 rounded-md transition-colors cursor-pointer ${
                              selectedTemplate === value
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'hover:border-blue-200'
                            }`}
                            onClick={() => setSelectedTemplate(value)}
                          >
                            <div className="flex gap-4">
                              <div className="flex-shrink-0 mt-[3px]">
                                <Icon
                                  className={`h-5 w-5 ${
                                    selectedTemplate === value
                                      ? 'text-blue-600 dark:text-blue-400'
                                      : 'text-muted-foreground'
                                  }`}
                                />
                              </div>
                              <div className="flex-1">
                                <RadioGroupItem value={value} id={value} className="sr-only" />
                                <Label htmlFor={value} className="flex-1 cursor-pointer">
                                  <div className="font-medium text-base mb-1">{label}</div>
                                  <div className="text-sm text-muted-foreground">{desc}</div>
                                </Label>
                              </div>
                            </div>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  </>
                ) : (
                  <>
                    <h4 className="text-sm font-medium text-foreground">
                      Creating {selectedTemplate === 'minimal' ? 'Basic' : 'Complete'} Setup
                    </h4>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{progressMessage}</p>
                  </>
                )}
              </div>
            </div>

            {/* Desktop buttons */}
            <div className="hidden lg:flex flex-col border-t mt-auto">
              {error && !isLoading && step !== 'done' && (
                <Badge color="rose" className="rounded-none gap-3 text-sm border-b">
                  <AlertCircle className="size-4 sm:size-7" />
                  <span className="text-xs sm:text-sm">{error}</span>
                </Badge>
              )}
              <div className="flex items-center justify-between p-4">
                <ActionButtons step={step} isLoading={isLoading} runOnboarding={runOnboarding} />
              </div>
            </div>
          </div>

          {/* Right panel — section renderer */}
          <div className="order-2 min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:order-none">
            <SectionRenderer
              sections={SECTION_DEFINITIONS}
              selectedTemplate={selectedTemplate}
              isLoading={isLoading}
              loadingItems={loadingItems}
              completedItems={completedItems}
              itemErrors={itemErrors}
              error={error}
              step={step}
              currentJsonData={currentJsonData}
            />
          </div>
        </div>

        {/* Mobile buttons */}
        <div className="flex shrink-0 flex-col border-t lg:hidden">
          {error && !isLoading && step !== 'done' && (
            <Badge color="rose" className="rounded-none gap-3 text-sm border-b">
              <AlertCircle className="size-4 sm:size-7" />
              <span className="text-xs sm:text-sm">{error}</span>
            </Badge>
          )}
          <div className="flex items-center justify-between p-4">
            <ActionButtons step={step} isLoading={isLoading} runOnboarding={runOnboarding} fullWidth />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingDialog;

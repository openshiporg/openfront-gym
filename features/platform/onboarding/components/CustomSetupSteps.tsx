'use client';

import React, { useState } from 'react';
import { Clipboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DataCard } from './DataCard';
import { parseGymOnboardingSeed } from '../lib/onboardingSchema';

interface CustomSetupStepsProps {
  currentJson: unknown;
  onJsonUpdate: (newJson: unknown) => void;
}

export function CustomSetupSteps({ currentJson, onJsonUpdate }: CustomSetupStepsProps) {
  const baseJson = JSON.stringify(currentJson, null, 2);
  const [customJson, setCustomJson] = useState(baseJson);
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [jsonError, setJsonError] = useState('');

  const copyToClipboard = async (text: string, key: string) => {
    if (!navigator.clipboard) throw new Error('Clipboard access is not available');
    await navigator.clipboard.writeText(text);
    setCopied((previous) => ({ ...previous, [key]: true }));
    window.setTimeout(() => setCopied((previous) => ({ ...previous, [key]: false })), 2_000);
  };

  const prompt = `Help me customize this Openfront Gym starter configuration. Preserve the exact JSON structure and return valid JSON only when I am finished.

Ask me about:
- facility name, contact details, timezone, and location
- membership plans and non-negative monthly/annual prices
- class types, duration, difficulty, and supported equipment
- instructors (use reserved @example.invalid placeholder emails; the operator replaces them before account claiming)
- recurring weekly schedules, 24-hour start/end times, and capacity

Do not add members, bookings, check-ins, payment methods, subscriptions, charges, refunds, attendance, revenue, or unsupported lifecycle fields. Keep Stripe as the single pp_stripe provider with isInstalled false; the server enables it only when credentials are configured.

Configuration:
${baseJson}`;

  const apply = () => {
    try {
      const parsed = parseGymOnboardingSeed(JSON.parse(customJson));
      onJsonUpdate(parsed);
      setJsonError('');
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Invalid gym onboarding configuration');
    }
  };

  const steps = [
    {
      number: 1,
      title: 'Copy Base Configuration',
      description: 'Start with the complete supported Gym configuration.',
      content: <DataCard title="Onboarding Data" content={baseJson} onCopy={copyToClipboard} copied={Boolean(copied.json)} copyKey="json" />,
    },
    {
      number: 2,
      title: 'Copy AI Customization Prompt',
      description: 'Use the guarded prompt with an AI assistant, or edit the JSON directly below.',
      content: <DataCard title="AI Prompt" content={prompt} onCopy={copyToClipboard} copied={Boolean(copied.prompt)} copyKey="prompt" />,
    },
    {
      number: 3,
      title: 'Customize Supported Gym Data',
      description: 'Keep handles unique and ensure every schedule references an included class type and instructor.',
      content: (
        <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
          <li>Facility profile and one starter location</li>
          <li>Membership plans, class catalog, and instructors</li>
          <li>Recurring schedules and class capacities</li>
          <li>Stripe integration status only—no financial or member evidence</li>
        </ul>
      ),
    },
    {
      number: 4,
      title: 'Validate Custom JSON',
      description: 'Paste or edit the complete configuration. Validation runs here and again on the server.',
      content: (
        <div className="overflow-hidden rounded-lg border">
          <div className="flex items-center justify-between border-b bg-muted px-4 py-2">
            <span className="text-sm font-medium text-muted-foreground">Custom Onboarding Data</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Paste custom onboarding JSON"
              className="size-7"
              onClick={async () => {
                try {
                  setCustomJson(await navigator.clipboard.readText());
                  setJsonError('');
                } catch {
                  setJsonError('Clipboard access is not available. Paste into the editor directly.');
                }
              }}
            >
              <Clipboard className="size-3" />
            </Button>
          </div>
          <Textarea
            aria-label="Custom gym onboarding JSON"
            aria-invalid={Boolean(jsonError)}
            aria-describedby={jsonError ? 'custom-onboarding-error' : undefined}
            value={customJson}
            onChange={(event) => { setCustomJson(event.target.value); setJsonError(''); }}
            className="min-h-64 resize-y rounded-none border-0 p-4 font-mono text-xs"
            spellCheck={false}
          />
          {jsonError && (
            <div id="custom-onboarding-error" role="alert" className="border-t border-destructive/20 bg-destructive/10 px-4 py-3 text-xs text-destructive">
              {jsonError}
            </div>
          )}
          <div className="flex justify-end border-t bg-muted px-4 py-2">
            <Button type="button" size="sm" onClick={apply} disabled={!customJson.trim()}>
              Validate and review
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Custom Setup Configuration</Label>
        <p className="text-xs text-muted-foreground">Follow the shared onboarding sequence to prepare a backend-supported Gym setup.</p>
      </div>
      <div className="space-y-0">
        {steps.map((step, index) => (
          <section key={step.number} className="relative" aria-labelledby={`custom-step-${step.number}`}>
            {index < steps.length - 1 && <div aria-hidden className="absolute bottom-0 left-3 top-3 w-px bg-border" />}
            <div className="relative mb-2 flex items-center gap-3">
              <div aria-hidden className="z-10 inline-flex size-6 items-center justify-center rounded-sm border bg-background text-sm shadow-sm">{step.number}</div>
              <h3 id={`custom-step-${step.number}`} className="text-sm font-medium">{step.title}</h3>
            </div>
            <div className="pb-6 pl-9">
              <p className="mb-3 text-xs text-muted-foreground">{step.description}</p>
              {step.content}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

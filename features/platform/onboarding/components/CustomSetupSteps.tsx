import React, { useState } from "react";
import { Clipboard, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DataCard } from "./DataCard";
import seedData from "@/features/platform/onboarding/lib/seed.json";

interface CustomSetupStepsProps {
  currentJson?: any;
  onJsonUpdate?: (newJson: any) => void;
  onBack?: () => void;
}

function useCopyToClipboard(): [string | null, (text: string) => Promise<boolean>] {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copy = React.useCallback(async (text: string) => {
    if (!navigator?.clipboard) return false;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      return true;
    } catch {
      setCopiedText(null);
      return false;
    }
  }, []);

  return [copiedText, copy];
}

export function CustomSetupSteps({
  currentJson,
  onJsonUpdate = () => {},
  onBack,
}: CustomSetupStepsProps) {
  const [, copy] = useCopyToClipboard();
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({});
  const [customJson, setCustomJson] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [jsonApplied, setJsonApplied] = useState(false);

  const copyToClipboard = async (text: string, itemKey: string) => {
    const success = await copy(text);
    if (success) {
      setCopiedItems((prev) => ({ ...prev, [itemKey]: true }));
      setTimeout(() => {
        setCopiedItems((prev) => ({ ...prev, [itemKey]: false }));
      }, 2000);
    }
  };

  const generateAIPrompt = () => {
    return `I need help customizing my gym onboarding configuration. I've pasted my current setup.

Your first response should do two things:
1. Summarize what this JSON currently contains.
2. Ask me what I want to change.

The summary should cover:
- Gym profile / storefront settings
- Main location
- Membership plans
- Class types
- Instructors
- Recurring schedules
- Demo member account

Then ask exactly:
"This is what your gym configuration currently has. What would you like to change?"

As I give you changes, keep updating the JSON. When I say I’m done, return the complete final JSON and tell me to paste it back into the Gym Setup dialog.

Important:
- Return valid JSON only when giving me the final configuration.
- Keep all required top-level keys:
  gymSettings
  location
  membershipTiers
  classTypes
  instructors
  schedules
  demoMember
- Preserve realistic demo-ready data so onboarding still seeds a working gym experience.`;
  };

  const validateAndApplyJson = () => {
    try {
      const parsed = JSON.parse(customJson);

      const objectKeys = ["gymSettings", "location", "demoMember"];
      const arrayKeys = ["membershipTiers", "classTypes", "instructors", "schedules"];

      const missingObjectKeys = objectKeys.filter(
        (key) => !parsed[key] || typeof parsed[key] !== "object" || Array.isArray(parsed[key])
      );
      const missingArrayKeys = arrayKeys.filter((key) => !Array.isArray(parsed[key]));
      const missingKeys = [...missingObjectKeys, ...missingArrayKeys];

      if (missingKeys.length > 0) {
        setJsonError(`Missing or invalid required keys: ${missingKeys.join(", ")}`);
        return;
      }

      onJsonUpdate(parsed);
      setJsonApplied(true);
      setJsonError("");
    } catch {
      setJsonError("Invalid JSON format. Please check your syntax.");
    }
  };

  const steps = [
    {
      number: 1,
      title: "Copy Base Configuration",
      description: "Start with our complete gym template JSON configuration",
      content: (
        <DataCard
          title="Gym Onboarding Data"
          content={JSON.stringify(seedData, null, 2)}
          onCopy={copyToClipboard}
          copied={copiedItems.json || false}
          copyKey="json"
        />
      ),
    },
    {
      number: 2,
      title: "Copy AI Customization Prompt",
      description: "Use this prompt with any AI assistant to get your custom gym configuration",
      content: (
        <DataCard
          title="AI Prompt"
          content={generateAIPrompt()}
          onCopy={copyToClipboard}
          copied={copiedItems.prompt || false}
          copyKey="prompt"
        />
      ),
    },
    {
      number: 3,
      title: "Chat with AI",
      description: "The AI will ask you about your gym and help you customize the setup",
      content: (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            The AI should help you customize things like:
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 ml-4">
            <li>• Gym name, contact info, hours, and hero messaging</li>
            <li>• Membership plans and pricing</li>
            <li>• Group fitness class offerings</li>
            <li>• Instructor profiles, specialties, and certifications</li>
            <li>• Recurring weekly schedules</li>
            <li>• Demo member data for testing account flows</li>
          </ul>
        </div>
      ),
    },
    {
      number: 4,
      title: "Paste Your Custom JSON",
      description: "Paste the AI-generated configuration here",
      content: (
        <div className="rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-muted border-b">
            <span className="text-sm font-medium text-muted-foreground">Custom Gym Configuration</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setCustomJson(text);
                  setJsonError("");
                } catch {}
              }}
              className="h-6 w-6 p-0 hover:bg-background/80"
            >
              <Clipboard className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>
          <div className="bg-background">
            <Textarea
              placeholder="Paste your customized JSON configuration here..."
              value={customJson}
              onChange={(e) => {
                setCustomJson(e.target.value);
                setJsonError("");
              }}
              className="min-h-[200px] font-mono text-xs resize-none border-0 bg-transparent focus:outline-none p-4 rounded-none"
            />
          </div>
          {jsonError && (
            <div className="px-4 pb-4">
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2">
                <p className="text-xs text-destructive">{jsonError}</p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-end px-4 py-2 bg-muted border-t">
            <Button size="sm" onClick={validateAndApplyJson} disabled={!customJson.trim()}>
              Apply Configuration
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {jsonApplied && onBack && (
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setJsonApplied(false);
              onBack();
            }}
            className="h-8 px-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Custom Setup
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-medium">Custom Setup Configuration</Label>
        <p className="text-xs text-muted-foreground">
          Follow these steps to create a personalized gym setup using AI assistance.
        </p>
      </div>

      <div className="space-y-0">
        {steps.map((step, index) => (
          <div key={step.number} className="relative">
            {index < steps.length - 1 && (
              <div className="absolute left-3 top-3 bottom-0 w-[1px] bg-border" />
            )}
            <div className="flex items-center space-x-3 mb-2 relative">
              <div className="inline-flex size-6 items-center justify-center rounded-sm border border-border bg-background text-sm text-foreground shadow-sm z-10">
                {step.number}
              </div>
              <Label className="text-sm font-medium text-foreground">{step.title}</Label>
            </div>
            <div className="pl-9">
              <div className="pb-6">
                <p className="text-xs text-muted-foreground mb-3">{step.description}</p>
                {step.content}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

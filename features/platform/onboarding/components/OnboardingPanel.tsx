"use client";

import { useMemo, useState } from "react";
import seedData from "../lib/seed.json";
import { GYM_TEMPLATES, SECTION_DEFINITIONS } from "../config/templates";
import { getSeedForTemplate } from "../utils/dataUtils";
import { dismissOnboarding } from "../actions/onboarding";
import { Button } from "@/components/ui/button";
import { SectionRenderer } from "./SectionRenderer";

type TemplateType = "full" | "minimal" | "custom";

export function OnboardingPanel() {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>("minimal");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentJsonData = useMemo(
    () => getSeedForTemplate(selectedTemplate, seedData),
    [selectedTemplate]
  );

  async function handleSeed() {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    // OnboardingPanel is deprecated — use OnboardingDialog instead.
    setError('Please use the Setup dialog (click "Get started" in the sidebar).');
    setIsLoading(false);
  }

  async function handleDismiss() {
    await dismissOnboarding();
    window.location.reload();
  }

  return (
    <div className="rounded-lg border bg-card p-6 space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Welcome to Fitforce Setup</h2>
        <p className="text-sm text-muted-foreground">
          Pick a template and we’ll seed your gym with membership plans, class types, and instructors.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(Object.keys(GYM_TEMPLATES) as TemplateType[]).map((key) => (
          <button
            key={key}
            onClick={() => setSelectedTemplate(key)}
            className={`rounded-md border p-4 text-left transition ${
              selectedTemplate === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
            }`}
          >
            <div className="text-sm font-medium">{GYM_TEMPLATES[key].name}</div>
            <div className="text-xs text-muted-foreground mt-1">{GYM_TEMPLATES[key].description}</div>
          </button>
        ))}
      </div>

      <SectionRenderer
        sections={SECTION_DEFINITIONS}
        selectedTemplate={selectedTemplate}
        isLoading={isLoading}
        loadingItems={{ membershipTiers: [], classTypes: [], instructors: [] }}
        completedItems={{ membershipTiers: [], classTypes: [], instructors: [] }}
        itemErrors={{}}
        error={error}
        step="template"
        currentJsonData={currentJsonData}
      />

      {error && (
        <pre className="text-xs whitespace-pre-wrap rounded bg-red-50 border border-red-200 text-red-700 p-3">
          {error}
        </pre>
      )}

      {success && (
        <div className="text-xs rounded bg-green-50 border border-green-200 text-green-700 p-3">
          {success}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleSeed} disabled={isLoading}>
          {isLoading ? "Seeding..." : "Seed & Complete Onboarding"}
        </Button>
        <Button variant="outline" onClick={handleDismiss} disabled={isLoading}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

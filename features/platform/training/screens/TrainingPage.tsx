import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { requireDashboardUser } from "@/features/platform/lib/current-user";
import { PlatformHeader } from "@/features/platform/components/platform-ui";
import { loadTrainingWorkspace } from "../actions/training";
import { TrainingWorkspace } from "../components/TrainingWorkspace";
import { loadPendingIntents, loadRetryIntent } from "@/features/platform/lib/staff-intent";
import { firstParam } from "@/features/platform/lib/search-params";
export default async function TrainingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireDashboardUser();
  const raw = await searchParams;
  const params = { error: firstParam(raw.error, 1000), success: firstParam(raw.success, 1000), cardCheckout: firstParam(raw.cardCheckout, 260), cardAttempt: firstParam(raw.cardAttempt, 100) };
  const [data, retry, pendingIntents] = await Promise.all([
    loadTrainingWorkspace({ skip: Number(firstParam(raw.skip)) || 0, cardSkip: Number(firstParam(raw.cardSkip)) || 0, availabilitySkip: Number(firstParam(raw.availabilitySkip)) || 0, memberQuery: firstParam(raw.memberQuery, 100) }),
    loadRetryIntent(firstParam(raw.intent, 100), "training"),
    loadPendingIntents("training"),
  ]);
  const returnedCheckout = /^cs_[A-Za-z0-9_]{1,250}$/.test(params.cardCheckout || "") ? params.cardCheckout : undefined;
  const header = (
    <PlatformHeader
      eyebrow="Coaching"
      title="Training"
      description={`Appointments, prepaid packages, coaching assignments, and trial follow-up. Times shown in ${data.timeZone}.`}
    />
  );
  const breadcrumbs = [
    { type: "link" as const, label: "Dashboard", href: "/dashboard" },
    { type: "page" as const, label: "Platform" },
    { type: "page" as const, label: "Training" },
  ];
  return <PageContainer title="Training" header={header} breadcrumbs={breadcrumbs}><TrainingWorkspace data={data} error={params.error} success={params.success} closedCheckout={Boolean(params.cardAttempt)} retry={retry} pendingIntents={pendingIntents} returnedCheckout={returnedCheckout}/></PageContainer>;
}

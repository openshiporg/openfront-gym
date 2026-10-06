import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { requireDashboardUser } from "@/features/dashboard/lib/current-user";
import { loadTrainingWorkspace } from "../actions/training";
import { TrainingWorkspace } from "../components/TrainingWorkspace";
export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ skip?: string; error?: string; success?: string }> }) {
  await requireDashboardUser();
  const params = await searchParams;
  const data = await loadTrainingWorkspace(Number(params.skip || 0));
  return <PageContainer title="Training"><TrainingWorkspace data={data} error={params.error} success={params.success}/></PageContainer>;
}

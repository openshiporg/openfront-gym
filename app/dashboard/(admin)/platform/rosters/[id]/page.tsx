import RosterDetailPage from "@/features/platform/rosters/screens/RosterDetailPage";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <RosterDetailPage id={id} />;
}

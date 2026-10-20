import RosterDetailPage from "@/features/platform/rosters/screens/RosterDetailPage";

export default async function Page(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await props.params;
  return <RosterDetailPage id={id} searchParams={await props.searchParams} />;
}

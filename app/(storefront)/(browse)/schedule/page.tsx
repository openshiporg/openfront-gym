import { SchedulePage, generateMetadata } from "@/features/storefront/screens/SchedulePage"

export { generateMetadata }

export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <SchedulePage searchParams={await props.searchParams} />;
}

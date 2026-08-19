import { SchedulePage, generateMetadata } from "@/features/storefront/screens/SchedulePage"

export { generateMetadata }

export default async function Page(props: {
  searchParams: Promise<{ book?: string }>;
}) {
  const { book } = await props.searchParams;
  return <SchedulePage book={book} />;
}

import { ContactPage, generateMetadata } from "@/features/storefront/screens/ContactPage"

export { generateMetadata }

export default async function Page(props: {
  searchParams: Promise<{ topic?: string; from?: string }>;
}) {
  return <ContactPage searchParams={props.searchParams} />;
}

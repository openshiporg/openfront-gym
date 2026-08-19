import LoginPage from "@/features/storefront/screens/LoginPage";

export default function Default() {
  return <LoginPage allowSignup={process.env.PUBLIC_SIGNUPS_ALLOWED === "true"} />;
}

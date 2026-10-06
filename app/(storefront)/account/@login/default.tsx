import LoginReturn from "@/features/storefront/modules/account/components/login-return";

export default function Default() {
  return <LoginReturn allowSignup={process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED === "true"} />;
}

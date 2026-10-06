import { redirect } from "next/navigation";

export function SignUpPage(): never {
  redirect("/dashboard/signin");
}

export default SignUpPage;

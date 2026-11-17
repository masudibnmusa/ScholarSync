import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/session";
import { homeFor } from "@/components/app/nav";
import { AuthFrame } from "@/components/auth/auth-frame";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionProfile();
  if (user) redirect(`${homeFor(user.role)}/courses`);
  return <AuthFrame>{children}</AuthFrame>;
}

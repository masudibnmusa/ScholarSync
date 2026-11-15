import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/session";

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionProfile();
  if (!user) redirect("/login");
  if (user.role !== "instructor") redirect("/student");
  return children;
}

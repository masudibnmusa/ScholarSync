import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionProfile();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/instructor");
  return children;
}

import type { Metadata } from "next";
import { ContributionReport } from "@/components/app/contribution";

export const metadata: Metadata = { title: "Contribution" };

export default async function Page({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  return <ContributionReport courseId={id} userId={userId} />;
}

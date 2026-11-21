import type { Metadata } from "next";
import { ContributionReport } from "@/components/app/contribution";

export const metadata: Metadata = { title: "Your contribution" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContributionReport courseId={id} />;
}

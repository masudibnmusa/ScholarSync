import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { ContributionReport } from "@/components/app/contribution";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Contribution");

export default async function Page({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  return <ContributionReport courseId={id} userId={userId} />;
}

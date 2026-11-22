import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { ContributionReport } from "@/components/app/contribution";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Your contribution");

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContributionReport courseId={id} />;
}

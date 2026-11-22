import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { TeamTasks } from "@/components/app/team-tasks";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Team tasks");

export default async function Page({ params }: { params: Promise<{ id: string; teamId: string }> }) {
  const { id, teamId } = await params;
  return <TeamTasks courseId={id} teamId={teamId} />;
}

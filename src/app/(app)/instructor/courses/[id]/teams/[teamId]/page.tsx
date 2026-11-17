import type { Metadata } from "next";
import { TeamTasks } from "@/components/app/team-tasks";

export const metadata: Metadata = { title: "Team tasks" };

export default async function Page({ params }: { params: Promise<{ id: string; teamId: string }> }) {
  const { id, teamId } = await params;
  return <TeamTasks courseId={id} teamId={teamId} />;
}

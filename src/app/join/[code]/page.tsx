import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { redirect } from "next/navigation";
import { getInvite } from "@/app/actions";
import { getSessionProfile } from "@/lib/session";
import { JoinInvite } from "@/components/app/join-invite";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Join a course");

// An invite link. Joining is a button, not a side effect of opening the page, so link previews can't enrol anyone.
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getSessionProfile();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
  const invite = await getInvite(code);
  return <JoinInvite invite={invite} role={user.role} joinCode={code} />;
}

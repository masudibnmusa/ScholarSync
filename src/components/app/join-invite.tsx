"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ChalkboardTeacher, LinkBreak, SignIn } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { joinCourseByCode } from "@/app/actions";
import type { CourseInvite } from "@/lib/types";
import { accentOf } from "@/components/app/courses";
import { EmptyState, Logo } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/components/locale";
import { t } from "@/lib/i18n";

export function JoinInvite({ invite, role, joinCode }: { invite: CourseInvite | null; role: string; joinCode: string }) {
  const { t } = useT();
  const router = useRouter();
  const [joining, setJoining] = React.useState(false);
  const home = `/${role}/courses`;

  async function join() {
    if (!invite) return;
    setJoining(true);
    try {
      const id = await joinCourseByCode(joinCode);
      toast.success(t("Joined {code}", { code: invite.code }));
      router.replace(`/student/courses/${id}`);
    } catch (err) {
      console.error("Joining by invite failed:", err);
      toast.error(t("Could not join the course"), { description: err instanceof Error ? t(err.message) : undefined });
      setJoining(false);
    }
  }

  let body: React.ReactNode;
  if (!invite) {
    body = (
      <EmptyState icon={LinkBreak} title={t("This invite doesn't work")} description={t("The code may be mistyped, or the course was deleted. Ask your instructor for a new link.")}>
        <Button asChild><Link href={home}>{t("Go to your courses")}</Link></Button>
      </EmptyState>
    );
  } else {
    const open = <Button asChild><Link href={`/${role}/courses/${invite.id}`}>{t("Open the course")}</Link></Button>;
    body = (
      <div>
        <div className="relative h-24 overflow-hidden rounded-t-[inherit]" style={{ background: accentOf(invite.code) }}>
          <div className="pointer-events-none absolute inset-0 bg-dots opacity-30" aria-hidden />
          <BookOpen weight="duotone" className="absolute -bottom-4 -right-3 size-24 text-foreground/10" aria-hidden />
          <div className="relative flex items-start justify-between gap-2 p-4">
            <span className="rounded-lg bg-glass-strong px-2.5 py-1 font-mono text-xs font-bold tracking-wide">{invite.code}</span>
            <span className="rounded-full bg-glass px-2.5 py-0.5 text-[0.6875rem] font-semibold">{invite.term}</span>
          </div>
        </div>
        <div className="p-6">
          <p className="text-sm font-semibold text-muted-foreground">{t("You're invited to join")}</p>
          <h1 className="mt-1 text-2xl font-extrabold">{invite.title}</h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground"><ChalkboardTeacher className="size-4" aria-hidden /> {t("Taught by")} {invite.instructorName}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {invite.isMine ? (
              <><p className="w-full text-sm text-muted-foreground">{t("This is the invite link for your own course. Share it with your students.")}</p>{open}</>
            ) : role === "instructor" ? (
              <><p className="w-full text-sm text-muted-foreground">{t("Invite links are for students. Instructors can browse the course from the dashboard.")}</p><Button asChild variant="outline"><Link href={home}>{t("Back to dashboard")}</Link></Button></>
            ) : invite.enrolled ? (
              <><p className="w-full text-sm text-muted-foreground">{t("You're already in this course.")}</p>{open}</>
            ) : !invite.open ? (
              <><p className="w-full text-sm text-muted-foreground">{t("This course isn't accepting new students right now. Ask your instructor to add you.")}</p><Button asChild variant="outline"><Link href={home}>{t("Go to your courses")}</Link></Button></>
            ) : (
              <Button size="lg" loading={joining} onClick={join}>{!joining && <SignIn aria-hidden />} {t("Join course")}</Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-10">
      <Link href={home} className="rounded-xl" aria-label={t("ScholarSync home")}><Logo /></Link>
      <Card className="w-full max-w-md overflow-hidden">{body}</Card>
    </main>
  );
}

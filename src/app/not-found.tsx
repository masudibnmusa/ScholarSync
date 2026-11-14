import Link from "next/link";
import { GraduationCap } from "@/components/icons";

export default function NotFound() {
  return (
    <main id="main" className="min-h-dvh flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-6 flex w-12 h-12 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <GraduationCap className="w-6 h-6" />
        </span>
        <p className="caption-3 uppercase tracking-wider text-muted-foreground mb-3">Page not found</p>
        <h1 className="heading-4 mb-4">This page is not part of any project</h1>
        <p className="body-6 text-muted-foreground mb-8">
          The link may be old or mistyped. Your teams, tasks and files are all in your workspace.
        </p>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-md bg-primary px-6 button-md text-primary-foreground transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-primary/90 active:translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Back to CampusNova
        </Link>
      </div>
    </main>
  );
}

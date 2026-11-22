import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { Suspense } from "react";
import { InstructorWorkspace } from "@/components/instructor/workspace";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Workspace");

export default function Page() {
  return (
    <Suspense>
      <InstructorWorkspace />
    </Suspense>
  );
}

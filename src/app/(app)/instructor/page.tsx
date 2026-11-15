import type { Metadata } from "next";
import { Suspense } from "react";
import { InstructorWorkspace } from "@/components/instructor/workspace";

export const metadata: Metadata = { title: "Workspace" };

export default function Page() {
  return (
    <Suspense>
      <InstructorWorkspace />
    </Suspense>
  );
}

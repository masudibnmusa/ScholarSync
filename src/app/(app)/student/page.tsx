import type { Metadata } from "next";
import { Suspense } from "react";
import { StudentWorkspace } from "@/components/student/workspace";

export const metadata: Metadata = { title: "Workspace" };

export default function Page() {
  return (
    <Suspense>
      <StudentWorkspace />
    </Suspense>
  );
}

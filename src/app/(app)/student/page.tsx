import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { Suspense } from "react";
import { StudentWorkspace } from "@/components/student/workspace";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Workspace");

export default function Page() {
  return (
    <Suspense>
      <StudentWorkspace />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { ConflictsPanel } from "@/components/instructor/conflicts";

export const metadata: Metadata = { title: "Conflicts" };

export default function Page() {
  return (
    <Suspense>
      <ConflictsPanel />
    </Suspense>
  );
}

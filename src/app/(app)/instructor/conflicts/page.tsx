import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { Suspense } from "react";
import { ConflictsPanel } from "@/components/instructor/conflicts";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Conflicts");

export default function Page() {
  return (
    <Suspense>
      <ConflictsPanel />
    </Suspense>
  );
}

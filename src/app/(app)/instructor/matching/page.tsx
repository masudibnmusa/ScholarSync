import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { Suspense } from "react";
import { MatchingPanel } from "@/components/instructor/matching";

export const generateMetadata = (): Promise<Metadata> => pageTitle("AI matching");

export default function Page() {
  return (
    <Suspense>
      <MatchingPanel />
    </Suspense>
  );
}

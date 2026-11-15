import type { Metadata } from "next";
import { Suspense } from "react";
import { MatchingPanel } from "@/components/instructor/matching";

export const metadata: Metadata = { title: "AI matching" };

export default function Page() {
  return (
    <Suspense>
      <MatchingPanel />
    </Suspense>
  );
}

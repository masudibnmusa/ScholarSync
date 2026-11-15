import type { Metadata } from "next";
import { Suspense } from "react";
import { PeerReviewPanel } from "@/components/student/peer-review";

export const metadata: Metadata = { title: "Peer review" };

export default function Page() {
  return (
    <Suspense>
      <PeerReviewPanel />
    </Suspense>
  );
}

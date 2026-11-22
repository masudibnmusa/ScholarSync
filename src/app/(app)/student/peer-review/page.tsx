import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { Suspense } from "react";
import { PeerReviewPanel } from "@/components/student/peer-review";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Peer review");

export default function Page() {
  return (
    <Suspense>
      <PeerReviewPanel />
    </Suspense>
  );
}

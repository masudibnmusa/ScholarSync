import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfilePanel } from "@/components/app/profile";

export const metadata: Metadata = { title: "Profile" };

export default function Page() {
  return (
    <Suspense>
      <ProfilePanel />
    </Suspense>
  );
}

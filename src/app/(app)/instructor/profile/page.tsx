import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { Suspense } from "react";
import { ProfilePanel } from "@/components/app/profile";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Profile");

export default function Page() {
  return (
    <Suspense>
      <ProfilePanel />
    </Suspense>
  );
}

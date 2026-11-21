import type { Metadata } from "next";
import { AtRiskPanel } from "@/components/instructor/at-risk";

export const metadata: Metadata = { title: "At risk" };

export default function Page() {
  return <AtRiskPanel />;
}

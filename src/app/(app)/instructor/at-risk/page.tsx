import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { AtRiskPanel } from "@/components/instructor/at-risk";

export const generateMetadata = (): Promise<Metadata> => pageTitle("At risk");

export default function Page() {
  return <AtRiskPanel />;
}

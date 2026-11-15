import { redirect } from "next/navigation";

export default async function Page({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const { team } = await searchParams;
  redirect(team ? `/instructor?team=${encodeURIComponent(team)}` : "/instructor");
}

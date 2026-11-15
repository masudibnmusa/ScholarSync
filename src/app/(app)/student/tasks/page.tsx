import { redirect } from "next/navigation";

export default async function Page({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  redirect(isNew === "1" ? "/student?new=1" : "/student");
}

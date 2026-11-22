import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { CourseDetail } from "@/components/app/course-detail";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Course");

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CourseDetail id={id} />;
}

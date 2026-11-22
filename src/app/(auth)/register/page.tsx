import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { AuthForm } from "@/components/auth/auth-form";
import { safeNext } from "@/lib/utils";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Create your account");

// ?next= returns the user to where they came from (e.g. an invite link) after signing in.
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return <AuthForm mode="register" next={safeNext((await searchParams).next)} />;
}

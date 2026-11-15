import "server-only";
import { cache } from "react";
import { getProfile } from "@/app/actions";
import { AuthError } from "@/db";
import type { UserProfile } from "@/lib/types";

/** The signed-in user's profile, or null when signed out. Cached per request so layouts can share it. */
export const getSessionProfile = cache(async (): Promise<UserProfile | null> => {
  try {
    return await getProfile();
  } catch (err) {
    if (err instanceof AuthError) return null;
    throw err; // database down etc.: let the error page show, don't bounce to /login
  }
});

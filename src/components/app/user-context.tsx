"use client";

import * as React from "react";
import { useAppStore } from "@/lib/store";
import type { UserProfile } from "@/lib/types";

const UserContext = React.createContext<UserProfile | null>(null);

export function UserProvider({ user, children }: { user: UserProfile; children: React.ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/** The signed-in user: the server-rendered profile, replaced by the store's copy once the user edits it. */
export function useUser(): UserProfile {
  const fromServer = React.useContext(UserContext);
  const fromStore = useAppStore((s) => s.currentUser);
  const user = fromStore ?? fromServer;
  if (!user) throw new Error("useUser must be used inside the signed-in app");
  return user;
}

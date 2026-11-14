import { createBrowserClient } from "@supabase/ssr";

// Browser client: auth, Realtime and Storage. The session lives in cookies so Server Actions see it too.
let client: ReturnType<typeof createBrowserClient> | undefined;

export function supabaseBrowser() {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}

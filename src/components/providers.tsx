"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/overlays";

function Toasts() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      offset={{ bottom: 104 }} // clear the floating chat button
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-2xl !border !border-border !bg-popover !text-popover-foreground !shadow-lift !font-sans",
          description: "!text-muted-foreground",
        },
      }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {/* reducedMotion="user": framer-motion skips transforms for people who ask for less motion */}
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
      </MotionConfig>
      <Toasts />
    </ThemeProvider>
  );
}

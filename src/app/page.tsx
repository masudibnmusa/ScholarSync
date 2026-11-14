"use client";

import { useAppStore } from "@/lib/store";
import { AuthPage } from "@/components/auth-page";
import { AppSidebar } from "@/components/app-sidebar";
import { StudentDashboard } from "@/components/student-dashboard";
import { ChatPanel } from "@/components/chat-panel";
import { KanbanBoard } from "@/components/kanban-board";
import { FilesPanel } from "@/components/files-panel";
import { NotificationsPanel } from "@/components/notifications-panel";
import { PeerReviewPanel } from "@/components/peer-review-panel";
import { ProfilePanel } from "@/components/profile-panel";
import { InstructorDashboard } from "@/components/instructor-dashboard";
import { TeamsPanel } from "@/components/teams-panel";
import { AnalyticsPanel } from "@/components/analytics-panel";
import { ConflictsPanel } from "@/components/conflicts-panel";
import { AIMatchingPanel } from "@/components/ai-matching-panel";
import { AITaskModal } from "@/components/ai-task-modal";
import { LandingPage } from "@/components/landing-page";
import { MenuToggle } from "@/components/menu-toggle";
import { navLabel } from "@/components/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap } from "@/components/icons";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

// Shaped like the app (sidebar, header, cards) so the restore does not jump.
function AppSkeleton() {
  return (
    <div className="flex h-dvh bg-background" aria-busy="true" aria-label="Loading your workspace">
      <div className="hidden md:block w-[260px] bg-sidebar p-4 space-y-3">
        <Skeleton className="h-9 w-36 bg-sidebar-accent" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-sidebar-accent" />
        ))}
      </div>
      <div className="flex-1 p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function AppShell() {
  const { currentView, currentUser, sessionChecked } = useAppStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const renderContent = () => {
    switch (currentView) {
      case "student-dashboard":
        return <StudentDashboard />;
      case "student-chat":
        return <ChatPanel />;
      case "student-tasks":
        return <KanbanBoard />;
      case "student-files":
        return <FilesPanel />;
      case "student-notifications":
        return <NotificationsPanel />;
      case "student-peer-review":
        return <PeerReviewPanel />;
      case "student-profile":
        return <ProfilePanel />;
      case "instructor-dashboard":
        return <InstructorDashboard />;
      case "instructor-teams":
        return <TeamsPanel />;
      case "instructor-analytics":
        return <AnalyticsPanel />;
      case "instructor-conflicts":
        return <ConflictsPanel />;
      case "instructor-matching":
        return <AIMatchingPanel />;
      default:
        return <StudentDashboard />;
    }
  };

  if (!sessionChecked) return <AppSkeleton />;
  if (!currentUser) return currentView === "landing" ? <LandingPage /> : <AuthPage />;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div className="hidden md:flex">
        <AppSidebar />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Phone top bar */}
        <header className="md:hidden flex items-center gap-3 h-16 px-4 border-b border-sidebar-border bg-sidebar text-sidebar-foreground shrink-0 z-50">
          <span className="w-8 h-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center">
            <GraduationCap className="w-5 h-5" />
          </span>
          <p className="title-3 flex-1 truncate">{menuOpen ? "CampusNova" : navLabel(currentView)}</p>
          <MenuToggle open={menuOpen} onToggle={() => setMenuOpen(!menuOpen)} controls="app-menu" className="hover:bg-sidebar-accent" />
        </header>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              id="app-menu"
              className="md:hidden fixed inset-x-0 top-16 bottom-0 z-40 bg-sidebar/95 backdrop-blur-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease }}
            >
              <AppSidebar mobile onNavigate={() => setMenuOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        <main id="main" className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentView}
              className="h-full"
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <AITaskModal />
    </div>
  );
}

export default function Home() {
  return <AppShell />;
}

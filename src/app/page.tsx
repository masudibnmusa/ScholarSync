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

function AppShell() {
  const { currentView, currentUser, sidebarCollapsed } = useAppStore();

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

  if (!currentUser) return <AuthPage />;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-hidden">{renderContent()}</main>
      <AITaskModal />
    </div>
  );
}

export default function Home() {
  return <AppShell />;
}

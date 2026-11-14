"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  GripVertical,
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
  Filter,
  MoreHorizontal,
  AlertCircle,
  Trash2,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import type { KanbanTask } from "@/lib/store";

const columns: {
  id: KanbanTask["status"];
  title: string;
  icon: typeof Circle;
  color: string;
  bg: string;
}[] = [
  {
    id: "todo",
    title: "To Do",
    icon: Circle,
    color: "text-muted-foreground",
    bg: "bg-muted/50",
  },
  {
    id: "in-progress",
    title: "In Progress",
    icon: Loader2,
    color: "text-blue-500",
    bg: "bg-blue-50",
  },
  {
    id: "done",
    title: "Done",
    icon: CheckCircle2,
    color: "text-green-500",
    bg: "bg-green-50",
  },
];

const priorityConfig = {
  high: { label: "High", color: "bg-red-100 text-red-700 border-red-200" },
  medium: {
    label: "Medium",
    color: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  low: { label: "Low", color: "bg-green-100 text-green-700 border-green-200" },
};

export function KanbanBoard() {
  const { kanbanTasks, selectedTeam, updateTask, createTask, deleteTask } =
    useAppStore();
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "medium",
    dueDate: "",
    assigneeId: "",
  });

  const handleDragStart = (taskId: string) => {
    setDraggedTask(taskId);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverCol(colId);
  };

  const handleDrop = (colId: KanbanTask["status"]) => {
    if (draggedTask) {
      updateTask(draggedTask, { status: colId });
    }
    setDraggedTask(null);
    setDragOverCol(null);
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim() || !selectedTeam) return;
    await createTask(selectedTeam.id, newTask);
    setNewTask({
      title: "",
      description: "",
      priority: "medium",
      dueDate: "",
      assigneeId: "",
    });
    setShowCreateDialog(false);
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2);

  return (
    <div className="flex flex-col h-full">
      {/* Board Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 bg-card/50">
        <div>
          <h2 className="title-2">Kanban Board</h2>
          <p className="text-sm text-muted-foreground">
            Track and manage project tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="w-3.5 h-3.5" />
            Filter
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Task
          </Button>
        </div>
      </div>

      {/* Board Columns */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-[900px]">
          {columns.map((col) => {
            const tasks = kanbanTasks.filter((t) => t.status === col.id);
            return (
              <div
                key={col.id}
                className={cn(
                  "flex-1 rounded-xl transition-colors duration-200",
                  dragOverCol === col.id ? col.bg : ""
                )}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDrop={() => handleDrop(col.id)}
                onDragLeave={() => setDragOverCol(null)}
              >
                {/* Column Header */}
                <div className="flex items-center gap-2 mb-3 px-1">
                  <col.icon className={cn("w-4 h-4", col.color)} />
                  <h3 className="font-semibold text-sm">{col.title}</h3>
                  <Badge variant="secondary" className="text-xs ml-1">
                    {tasks.length}
                  </Badge>
                </div>

                {/* Task Cards */}
                <ScrollArea className="h-[calc(100vh-260px)]">
                  <div className="space-y-3 px-0.5 pb-4">
                    {tasks.map((task) => (
                      <Card
                        key={task.id}
                        draggable
                        onDragStart={() => handleDragStart(task.id)}
                        className={cn(
                          "p-4 cursor-grab active:cursor-grabbing border border-border hover:shadow-md transition-all duration-200 group",
                          draggedTask === task.id &&
                            "opacity-50 scale-95 rotate-1"
                        )}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium text-sm leading-tight mb-1">
                              {task.title}
                            </h4>
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                              {task.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0 ml-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:text-destructive"
                              onClick={() => deleteTask(task.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs px-2 py-0 border",
                              priorityConfig[task.priority].color
                            )}
                          >
                            {priorityConfig[task.priority].label}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                            <GripVertical className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                              <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                                {getInitials(task.assigneeName)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                              {task.assigneeName === "You"
                                ? "You"
                                : task.assigneeName.split(" ").pop()}
                            </span>
                          </div>
                          {task.dueDate && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {new Date(task.dueDate).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })}
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}

                    {/* Add Task Button */}
                    <button
                      className="w-full py-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors flex items-center justify-center gap-2"
                      onClick={() => setShowCreateDialog(true)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add task
                    </button>
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Task Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                placeholder="Task title"
                value={newTask.title}
                onChange={(e) =>
                  setNewTask((t) => ({ ...t, title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-desc">Description</Label>
              <Textarea
                id="task-desc"
                placeholder="Task description"
                className="min-h-[80px] resize-none"
                value={newTask.description}
                onChange={(e) =>
                  setNewTask((t) => ({ ...t, description: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="task-priority">Priority</Label>
                <select
                  id="task-priority"
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={newTask.priority}
                  onChange={(e) =>
                    setNewTask((t) => ({ ...t, priority: e.target.value }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-due">Due Date</Label>
                <Input
                  id="task-due"
                  type="date"
                  value={newTask.dueDate}
                  onChange={(e) =>
                    setNewTask((t) => ({ ...t, dueDate: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-assignee">Assignee</Label>
              <select
                id="task-assignee"
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                value={newTask.assigneeId}
                onChange={(e) =>
                  setNewTask((t) => ({ ...t, assigneeId: e.target.value }))
                }
              >
                <option value="">Unassigned</option>
                {selectedTeam?.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateTask}>Create Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  User,
  Mail,
  Shield,
  Edit2,
  Save,
  Clock,
  X,
  Loader2,
  Plus,
  Activity,
  MessageSquare,
  FolderOpen,
  CheckCircle2,
  Star,
} from "@/components/icons";
import { useAppStore } from "@/lib/store";
import { getInitials } from "@/lib/utils";

export function ProfilePanel() {
  const { currentUser, updateProfile, isLoading, kanbanTasks, chatMessages, files, selectedTeam } = useAppStore();
  const [isEditing, setIsEditing] = useState(false);
  const [bio, setBio] = useState(currentUser?.bio || "");
  const [skills, setSkills] = useState<string[]>(currentUser?.skills || []);
  const [availability, setAvailability] = useState(currentUser?.availability || "");
  const [newSkill, setNewSkill] = useState("");

  const handleSave = async () => {
    await updateProfile({ bio, skills, availability });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setBio(currentUser?.bio || "");
    setSkills(currentUser?.skills || []);
    setAvailability(currentUser?.availability || "");
    setIsEditing(false);
  };

  const handleAddSkill = () => {
    const trimmed = newSkill.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills([...skills, trimmed]);
      setNewSkill("");
    }
  };

  const handleRemoveSkill = (skill: string) => {
    setSkills(skills.filter((s) => s !== skill));
  };

  const teamId = selectedTeam?.id || "";
  const doneTasks = kanbanTasks.filter((t) => t.status === "done").length;
  const messageCount = chatMessages[teamId]?.length || 0;

  const contributions = [
    { label: "Tasks Completed", value: doneTasks, icon: CheckCircle2 },
    { label: "Messages Sent", value: messageCount, icon: MessageSquare },
    { label: "Files Shared", value: files.length, icon: FolderOpen },
    { label: "Reviews Given", value: 0, icon: Star },
  ];

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="heading-6">My Profile</h2>
          <p className="text-sm text-muted-foreground">
            Manage your account and skills
          </p>
        </div>
        {!isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => setIsEditing(true)}
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Profile Card */}
        <Card className="col-span-2 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Personal Information</h3>
              {isEditing && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="gap-2" onClick={handleCancel}>
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </Button>
                  <Button size="sm" className="gap-2" onClick={handleSave} disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="w-20 h-20">
                <AvatarFallback className="bg-primary text-primary-foreground heading-6">
                  {getInitials(currentUser?.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="heading-6">{currentUser?.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {currentUser?.email}
                </p>
                <Badge variant="secondary" className="mt-1">
                  <Shield className="w-3 h-3 mr-1" />
                  {currentUser?.role === "instructor" ? "Instructor" : "Student"}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Full Name</Label>
                <Input defaultValue={currentUser?.name || ""} className="h-9" disabled />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  University Email
                </Label>
                <Input defaultValue={currentUser?.email || ""} className="h-9" disabled />
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-xs text-muted-foreground">Bio</Label>
                {isEditing ? (
                  <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="min-h-[60px] resize-none"
                    placeholder="Tell us about yourself..."
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {bio || "No bio yet."}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Availability
                </Label>
                {isEditing ? (
                  <Input
                    value={availability}
                    onChange={(e) => setAvailability(e.target.value)}
                    className="h-9"
                    placeholder="e.g., Mon-Fri, 9AM - 8PM"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>{availability || "Not set"}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Skills */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <h3 className="font-semibold">Skills & Expertise</h3>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <Badge
                  key={skill}
                  variant="secondary"
                  className="px-3 py-1 text-xs"
                >
                  {isEditing && (
                    <button
                      onClick={() => handleRemoveSkill(skill)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {skill}
                </Badge>
              ))}
            </div>
            {isEditing && (
              <div className="flex gap-2">
                <Input
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  placeholder="Add skill"
                  className="h-8 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSkill();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={handleAddSkill}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            <Separator className="my-3" />

            {!isEditing && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">
                  Availability
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span>{availability || "Not set"}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contribution Stats */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <h3 className="font-semibold">My Contributions</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {contributions.map((c) => (
              <div
                key={c.label}
                className="flex items-center gap-3 p-4 rounded-xl bg-muted/50"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <c.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="title-2">{c.value}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

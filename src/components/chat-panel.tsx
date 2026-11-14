"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  Send,
  Paperclip,
  Smile,
  Sparkles,
  Hash,
  Phone,
  Video,
  Search,
  Pin,
  Image,
  Users,
  MessageSquare,
} from "@/components/icons";
import { cn, getInitials } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";

export function ChatPanel() {
  const {
    selectedTeam,
    chatMessages,
    currentUser,
    sendMessage,
  } = useAppStore();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);


  const teamId = selectedTeam?.id || "";
  const messages = teamId ? chatMessages[teamId] || [] : [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const emitTyping = useCallback(() => {
    // No-op: socket.io removed with Firebase conversion
  }, []);

  const handleSend = async () => {
    if (!input.trim() || !teamId) return;
    const content = input.trim();
    setInput("");

    await sendMessage(teamId, content);
  };

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="flex h-full">
      {/* Channel List */}
      <div className="w-64 border-r border-border bg-card/50 flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-semibold text-sm">{selectedTeam?.name || "Select a team"}</h3>
            <Badge variant="secondary" className="text-xs">
              {selectedTeam?.members.length || 0} members
            </Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search messages..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <ScrollArea className="flex-1 p-2">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider px-2 py-1">
              Channels
            </p>
            {["general", "development", "design", "random"].map((ch) => (
              <button
                key={ch}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  ch === "general"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                <Hash className="w-3.5 h-3.5 shrink-0" />
                <span>{ch}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-0.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider px-2 py-1">
              Members
            </p>
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-600">
              <Users className="w-3.5 h-3.5" />
              <span className="text-xs">{selectedTeam?.members.length || 0} members</span>
            </div>
            {selectedTeam?.members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground"
              >
                <Avatar className="w-6 h-6">
                  <AvatarFallback className="text-xs bg-muted">
                    {getInitials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs truncate">{m.name || "Unknown"}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="h-14 px-4 border-b border-border flex items-center justify-between bg-card/80 shrink-0">
          <div className="flex items-center gap-3">
            <Hash className="w-5 h-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-sm">general</h3>
              <p className="text-xs text-muted-foreground">
                {selectedTeam?.description || "Group project discussion"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Phone className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Video className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Pin className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="AI task suggestions"
              onClick={() => {
                useAppStore.setState({ showAIModal: true });
                if (teamId) useAppStore.getState().fetchSuggestions(teamId);
              }}
            >
              <Sparkles className="w-4 h-4 text-primary" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4 max-w-3xl mx-auto">
            {/* Date Divider */}
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground font-medium">
                Today
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {messages.length === 0 && (
              <EmptyState
                icon={MessageSquare}
                title="Say hello to your team"
                body="Agree on who does what here. Work your team agrees on in chat shows up as suggested tasks a few minutes later."
              />
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("group flex gap-3", msg.isMe && "flex-row-reverse")}
              >
                <Avatar className="w-9 h-9 shrink-0 mt-0.5">
                  <AvatarFallback
                    className={cn(
                      "text-xs font-bold",
                      msg.isMe
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {getInitials(msg.senderName)}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "flex-1 max-w-[70%]",
                    msg.isMe && "flex flex-col items-end"
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center gap-2 mb-1",
                      msg.isMe && "flex-row-reverse"
                    )}
                  >
                    <span className="text-sm font-semibold">
                      {msg.senderName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      msg.isMe
                        ? "bg-primary text-primary-foreground rounded-tr-md"
                        : "bg-card border border-border rounded-tl-md"
                    )}
                  >
                    {msg.content}
                  </div>
                  {msg.fileName && (
                    <Card
                      className="mt-2 p-3 max-w-xs border border-border cursor-pointer hover:border-primary/30"
                      onClick={() => msg.filePath && useAppStore.getState().downloadFile(msg.filePath)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                          <Image className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xs font-medium">
                            {msg.fileName}
                          </p>
                          {msg.fileSize && (
                            <p className="text-xs text-muted-foreground">
                              {msg.fileSize}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {/* Socket.io removed — typing indicator disabled */}
          </div>
        </ScrollArea>

        {/* Message Input */}
        <div className="p-4 border-t border-border bg-card/80 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 bg-background rounded-xl border border-border p-2">
              <div className="flex items-center gap-1 px-1">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Paperclip className="w-4 h-4" />
                </Button>
              </div>
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  emitTyping();
                }}
                placeholder="Type a message... (Press Enter to send)"
                className="flex-1 bg-transparent resize-none outline-none text-sm min-h-[36px] max-h-32 py-2 leading-relaxed"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <div className="flex items-center gap-1 px-1">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Smile className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  className="h-8 w-8 rounded-lg bg-primary hover:bg-primary/90"
                  onClick={handleSend}
                >
                  <Send className="w-4 h-4 text-primary-foreground" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              <Sparkles className="w-3 h-3 inline mr-1 text-primary" />
              NLP Engine active — tasks are being extracted from conversations
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

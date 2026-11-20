"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, CaretDown, ChatsCircle, DownloadSimple, FileArrowUp, FileText, FolderOpen, PaperPlaneTilt, Paperclip, X } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { MAX_FILE_BYTES, useAppStore } from "@/lib/store";
import { clockTime, cn, dayLabel, formatBytes, isMentionOf, MENTION_RE, mentionHandle } from "@/lib/utils";
import { useUser } from "@/components/app/user-context";
import type { ChatMessage, Team } from "@/lib/types";
import { EmptyState } from "@/components/app/page";
import { FilesView } from "@/components/student/files";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/overlays";
import { Skeleton } from "@/components/ui/skeleton";

const GROUP_GAP_MS = 5 * 60 * 1000;

type Row = { kind: "day"; key: string; label: string } | { kind: "msg"; key: string; msg: ChatMessage; head: boolean; tail: boolean };

/** Adds day separators and marks where a run of messages from one sender starts and ends. */
function toRows(messages: ChatMessage[]): Row[] {
  const rows: Row[] = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const day = new Date(msg.timestamp).toDateString();
    const newDay = !prev || new Date(prev.timestamp).toDateString() !== day;
    if (newDay) rows.push({ kind: "day", key: `day-${day}`, label: dayLabel(msg.timestamp) });
    const near = (a: ChatMessage, b: ChatMessage) => a.senderId === b.senderId && Math.abs(new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) < GROUP_GAP_MS;
    const head = newDay || !near(prev, msg);
    const tail = !next || new Date(next.timestamp).toDateString() !== day || !near(msg, next);
    rows.push({ kind: "msg", key: msg.id, msg, head, tail });
  });
  return rows;
}

function FileChip({ msg }: { msg: ChatMessage }) {
  const download = useAppStore((s) => s.downloadFile);
  if (!msg.fileName) return null;
  return (
    <button
      type="button"
      onClick={() => msg.filePath && download(msg.filePath)}
      aria-label={`Download ${msg.fileName}`}
      className={cn(
        "tap group/file flex w-full max-w-xs items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
        msg.isMe ? "border-white/20 bg-white/10 hover:bg-white/20 dark:border-primary-foreground/20 dark:bg-primary-foreground/10" : "bg-card hover:border-primary/40",
        msg.content && "mt-2",
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", msg.isMe ? "bg-white/15" : "bg-secondary text-primary")}>
        <FileText weight="duotone" className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{msg.fileName}</span>
        <span className={cn("block text-xs", msg.isMe ? "opacity-80" : "text-muted-foreground")}>{msg.fileSize}</span>
      </span>
      <DownloadSimple className="size-4 shrink-0 opacity-70 transition-transform group-hover/file:translate-y-0.5" aria-hidden />
    </button>
  );
}

/** Message text with @mentions of team members highlighted; a mention of the reader stands out more. */
function MessageText({ content, names, me, onPrimary }: { content: string; names: string[]; me: string; onPrimary: boolean }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of content.matchAll(MENTION_RE)) {
    const name = names.find((n) => isMentionOf(m[2], n));
    if (!name) continue;
    const start = m.index + m[1].length;
    parts.push(content.slice(last, start));
    const mine = name === me;
    parts.push(
      <span key={start} className={cn("rounded px-0.5 font-semibold", onPrimary ? "bg-white/20" : mine ? "bg-warm/35" : "bg-primary/10 text-primary")}>
        {content.slice(start, start + 1 + m[2].length)}
      </span>,
    );
    last = start + 1 + m[2].length;
  }
  parts.push(content.slice(last));
  return <p className="whitespace-pre-wrap break-words">{parts}</p>;
}

function Bubble({ row, names, me }: { row: Extract<Row, { kind: "msg" }>; names: string[]; me: string }) {
  const { msg, head, tail } = row;
  return (
    <motion.li
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={cn("flex items-end gap-2.5", msg.isMe && "flex-row-reverse", head ? "mt-4" : "mt-1")}
    >
      <div className="w-8 shrink-0">{!msg.isMe && tail && <Avatar name={msg.senderName} size="sm" />}</div>
      <div className={cn("flex min-w-0 max-w-[82%] flex-col sm:max-w-[68%]", msg.isMe ? "items-end" : "items-start")}>
        {head && !msg.isMe && (
          <p className="mb-1 ml-1 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            {msg.senderName}
            {msg.fromInstructor && <Badge variant="warm" className="px-1.5 py-0 text-[0.625rem]">Instructor</Badge>}
          </p>
        )}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed",
            msg.isMe ? "bg-primary text-primary-foreground" : msg.fromInstructor ? "bg-warm/10 text-foreground ring-1 ring-warm/30" : "bg-muted text-foreground",
            tail && (msg.isMe ? "rounded-br-md" : "rounded-bl-md"),
          )}
        >
          {msg.content && <MessageText content={msg.content} names={names} me={me} onPrimary={msg.isMe} />}
          <FileChip msg={msg} />
        </div>
        {tail && <time dateTime={msg.timestamp} className="mx-1 mt-1 text-[0.6875rem] text-muted-foreground">{clockTime(msg.timestamp)}</time>}
      </div>
    </motion.li>
  );
}

/** Messages + composer for one team. Fills its parent; `instructor` adjusts the copy for the course instructor. */
export function ChatThread({ team, instructor }: { team: Team; instructor?: boolean }) {
  const messages = useAppStore((s) => s.chatMessages[team.id]);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const uploadFile = useAppStore((s) => s.uploadFile);

  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [sending, setSending] = React.useState(false);
  const [atBottom, setAtBottom] = React.useState(true);
  const [dragging, setDragging] = React.useState(false);
  const dragDepth = React.useRef(0); // dragenter/leave also fire for children; count to know when the pointer really leaves
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const count = messages?.length ?? 0;
  const rows = React.useMemo(() => toRows(messages ?? []), [messages]);

  // @mentions: the word being typed right before the caret, and the teammates it could mean.
  const user = useUser();
  const memberNames = React.useMemo(() => team.members.map((m) => m.name), [team.members]);
  const [caret, setCaret] = React.useState(0);
  const [mentionIndex, setMentionIndex] = React.useState(0);
  const [mentionClosedAt, setMentionClosedAt] = React.useState<number | null>(null);
  const mentionQuery = /(?:^|\s)@([\p{L}\p{N}_.]*)$/u.exec(text.slice(0, caret))?.[1] ?? null;
  const candidates = mentionQuery === null ? [] : team.members
    .filter((m) => m.userId !== user.id && m.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(mentionQuery.toLowerCase())))
    .slice(0, 6);
  const mentionOpen = candidates.length > 0 && mentionClosedAt !== caret;
  const activeMention = Math.min(mentionIndex, candidates.length - 1);

  function pickMention(name: string) {
    const before = text.slice(0, caret).replace(/@[\p{L}\p{N}_.]*$/u, `@${mentionHandle(name)} `);
    const next = before + text.slice(caret);
    setText(next);
    setCaret(before.length);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(before.length, before.length);
      grow();
    });
  }

  const scrollToBottom = React.useCallback((smooth = true) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Follow new messages only while the reader is already at the bottom. The thread remounts per team (key).
  const firstPaint = React.useRef(true);
  React.useEffect(() => {
    if (!count) return;
    if (firstPaint.current) {
      scrollToBottom(false);
      firstPaint.current = false;
    } else if (atBottom) scrollToBottom();
  }, [count]);

  const grow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  // One file per message, from the paperclip or a drop. Size is checked now so the draft isn't lost at send time.
  function attach(files: FileList | null | undefined) {
    const f = files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) return void toast.error("File is too large", { description: `${f.name} is over 50 MB.` });
    if (files.length > 1) toast.info("One file per message", { description: `Attached ${f.name}.` });
    setFile(f);
    inputRef.current?.focus();
  }

  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  const drop = {
    onDragEnter: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragging(true); },
    onDragOver: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; },
    onDragLeave: (e: React.DragEvent) => { if (!hasFiles(e)) return; if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (!sending) attach(e.dataTransfer.files);
    },
  };

  async function send() {
    if (sending) return;
    const content = text.trim();
    if (!content && !file) return;
    setSending(true);
    let fileId: string | undefined;
    if (file) {
      const id = await uploadFile(team.id, file);
      if (!id) return setSending(false); // upload failed: keep the draft
      fileId = id;
    }
    const ok = await sendMessage(team.id, content, fileId);
    if (ok) {
      setText("");
      setFile(null);
      requestAnimationFrame(() => { grow(); scrollToBottom(); });
    }
    setSending(false);
    inputRef.current?.focus();
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col" {...drop}>
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-secondary/90 text-center backdrop-blur-sm"
          >
            <FileArrowUp weight="duotone" className="size-10 text-primary" aria-hidden />
            <p className="text-sm font-bold text-foreground">Drop to attach</p>
            <p className="text-xs text-muted-foreground">One file, up to 50 MB</p>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={(e) => { const el = e.currentTarget; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80); }}
          className="h-full overflow-y-auto px-4 pb-4 scroll-thin"
          tabIndex={0}
          role="log"
          aria-label={`Messages in ${team.name}`}
          aria-live="polite"
        >
          {!messages ? (
            <div className="space-y-4 pt-5" aria-busy="true">
              <Skeleton className="h-12 w-2/3" /><Skeleton className="ml-auto h-12 w-1/2" /><Skeleton className="h-16 w-3/5" />
            </div>
          ) : count === 0 ? (
            <EmptyState icon={ChatsCircle} title={instructor ? "No messages yet" : "Start the conversation"}
              description={instructor ? "This team hasn't started talking. Say hello to get them going." : "Say hello, share a file, or agree who does what. The AI suggests tasks from what you write."} className="h-full" />
          ) : (
            <ul>
              {rows.map((row) => row.kind === "day" ? (
                <li key={row.key} className="mt-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" aria-hidden />
                  <span className="rounded-full border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">{row.label}</span>
                  <span className="h-px flex-1 bg-border" aria-hidden />
                </li>
              ) : <Bubble key={row.key} row={row} names={memberNames} me={user.name} />)}
            </ul>
          )}
        </div>
        <AnimatePresence>
          {!atBottom && count > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute bottom-3 left-1/2 -translate-x-1/2">
              <Button size="sm" variant="outline" className="rounded-full shadow-lift" onClick={() => scrollToBottom()}><ArrowDown aria-hidden /> Latest</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <form className="shrink-0 border-t p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {file && (
          <div className="mb-2 flex w-fit max-w-full items-center gap-2.5 rounded-xl border bg-muted py-1.5 pl-3 pr-1.5">
            <FileText weight="duotone" className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">{file.name}</span><span className="block text-xs text-muted-foreground">{formatBytes(file.size)}</span></span>
            <button type="button" onClick={() => setFile(null)} aria-label={`Remove ${file.name}`} className="tap flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
          </div>
        )}
        {mentionOpen && (
          <ul id={`mention-list-${team.id}`} role="listbox" aria-label="Mention a teammate" className="mb-2 max-w-xs overflow-hidden rounded-2xl border bg-popover p-1 shadow-lift">
            {candidates.map((m, i) => (
              <li key={m.userId} id={`mention-${team.id}-${m.userId}`} role="option" aria-selected={i === activeMention}
                onMouseDown={(e) => { e.preventDefault(); pickMention(m.name); }}
                onMouseEnter={() => setMentionIndex(i)}
                className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm", i === activeMention && "bg-accent")}>
                <Avatar name={m.name} size="xs" />
                <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>
                <span className="text-xs text-muted-foreground">@{mentionHandle(m.name)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-1.5 rounded-2xl border border-input bg-background p-1.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25">
          <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { attach(e.target.files); e.target.value = ""; }} />
          <Tooltip label="Attach a file, or drop it here" side="top">
            <Button type="button" variant="ghost" size="icon" aria-label="Attach a file" onClick={() => fileRef.current?.click()} disabled={sending}><Paperclip className="size-5" /></Button>
          </Tooltip>
          <label htmlFor={`chat-input-${team.id}`} className="sr-only">Message {team.name}</label>
          <textarea
            id={`chat-input-${team.id}`}
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={4000}
            role="combobox"
            aria-expanded={mentionOpen}
            aria-autocomplete="list"
            aria-controls={mentionOpen ? `mention-list-${team.id}` : undefined}
            aria-activedescendant={mentionOpen ? `mention-${team.id}-${candidates[activeMention].userId}` : undefined}
            onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart); setMentionClosedAt(null); grow(); }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={(e) => {
              if (mentionOpen) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const step = e.key === "ArrowDown" ? 1 : -1;
                  setMentionIndex((activeMention + step + candidates.length) % candidates.length);
                  return;
                }
                if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) { e.preventDefault(); pickMention(candidates[activeMention].name); return; }
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMentionClosedAt(caret); return; }
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            placeholder={`Message ${team.name}…`}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-base leading-snug outline-none placeholder:text-muted-foreground md:text-[0.9375rem]"
          />
          <Button type="submit" size="icon" aria-label="Send message" loading={sending} disabled={!text.trim() && !file}>
            {!sending && <PaperPlaneTilt weight="fill" className="size-5" />}
          </Button>
        </div>
        <p className="mt-1.5 hidden px-1 text-[0.6875rem] text-muted-foreground sm:block">
          {instructor ? "Every team member is notified. " : null}<kbd className="font-sans font-semibold">Enter</kbd> to send · <kbd className="font-sans font-semibold">Shift + Enter</kbd> for a new line · <kbd className="font-sans font-semibold">@</kbd> to mention
        </p>
      </form>
    </div>
  );
}

const time = (m: ChatMessage) => new Date(m.timestamp).getTime();

type Tab = "chat" | "files";
const VIEWS: Tab[] = ["chat", "files"];

/** Popup shell: anchored bottom-right on desktop, full screen on phones. */
function FloatingPanel({ id, label, icon: Icon, title, subtitle, onClose, panelRef, children }: {
  id: string; label: string; icon: typeof ChatsCircle; title: string; subtitle: React.ReactNode;
  onClose: () => void; panelRef: React.RefObject<HTMLDivElement | null>; children: React.ReactNode;
}) {
  return (
    <motion.div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformOrigin: "bottom right" }}
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-card outline-none",
        "lg:absolute lg:inset-auto lg:bottom-24 lg:right-6 lg:z-40 lg:h-[min(40rem,calc(100%-8rem))] lg:w-[24rem] lg:overflow-hidden lg:rounded-3xl lg:border lg:shadow-lift xl:w-[26rem]",
      )}
    >
      <div className="flex shrink-0 items-center gap-3 border-b px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:pt-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
          <Icon weight="duotone" className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold leading-tight">{title}</p>
          <div className="text-xs font-medium text-muted-foreground">{subtitle}</div>
        </div>
        <Tooltip label="Close (Esc)">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={`Close ${label}`}>
            <X className="size-5 lg:hidden" aria-hidden /><CaretDown className="hidden size-5 lg:block" aria-hidden />
          </Button>
        </Tooltip>
      </div>
      <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)] lg:pb-0">{children}</div>
    </motion.div>
  );
}

function CountBadge({ n, className }: { n: number; className: string }) {
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.span key="n" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} aria-hidden
          className={cn("absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-extrabold tabular-nums ring-2 ring-background", className)}>
          {n > 99 ? "99+" : n}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/**
 * Floating chat button in the bottom-right corner of a workspace that opens Chat and Files in one popup.
 * `?view=chat|files` opens it on that tab, so old links and notifications still work.
 * Place it inside a `relative` container that fills the workspace; remount per team with `key`.
 */
export function ChatWidget({ team, instructor }: { team: Team; instructor?: boolean }) {
  const messages = useAppStore((s) => s.chatMessages[team.id]);
  const fileCount = useAppStore((s) => s.files.length);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("chat");
  const [seenAt, setSeenAt] = React.useState<number | null>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const show = (t: Tab) => { setTab(t); setOpen(true); };

  // ?view=… is a one-time "open this" signal: open during render, then drop it from the URL.
  const wanted = VIEWS.find((v) => v === params.get("view")) ?? null;
  const [prevWanted, setPrevWanted] = React.useState<Tab | null>(null);
  if (wanted !== prevWanted) {
    setPrevWanted(wanted);
    if (wanted) show(wanted);
  }
  React.useEffect(() => {
    if (!wanted) return;
    const next = new URLSearchParams(params.toString());
    next.delete("view");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [wanted, params, pathname, router]);

  // Everything on screen at load, or while the chat tab is open, counts as read.
  const chatVisible = open && tab === "chat";
  const latest = messages?.length ? time(messages[messages.length - 1]) : 0;
  if (messages && (chatVisible || seenAt === null) && seenAt !== latest) setSeenAt(latest);
  const unread = messages && seenAt !== null ? messages.filter((m) => !m.isMe && time(m) > seenAt).length : 0;

  const close = React.useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => button.current?.focus());
  }, []);
  React.useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const chatLabel = open ? "Close team chat and files" : `Open team chat and files${unread ? `, ${unread} new ${unread === 1 ? "message" : "messages"}` : ""}`;
  const live = (
    <span className="flex items-center gap-1.5">
      <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-success" /><span className="relative size-2 rounded-full bg-success" /></span>
      Live
    </span>
  );

  return (
    <>
      <AnimatePresence>
        {open && (
          <FloatingPanel key="chat" id={`chat-panel-${team.id}`} label="team chat and files" icon={tab === "chat" ? ChatsCircle : FolderOpen}
            title={team.name} subtitle={live} onClose={close} panelRef={panelRef}>
            <div className="shrink-0 border-b px-3 py-2">
              <Segmented label="Chat or files" value={tab} onChange={setTab} className="w-full [&>button]:flex-1 [&>button]:justify-center" options={[
                { value: "chat", label: <><ChatsCircle aria-hidden className="size-4" />Chat</> },
                { value: "files", label: <><FolderOpen aria-hidden className="size-4" />Files{fileCount > 0 && <span className="rounded-full bg-muted px-1.5 text-[0.625rem] font-extrabold tabular-nums text-muted-foreground">{fileCount}</span>}</> },
              ]} />
            </div>
            <div className="min-h-0 flex-1">
              {tab === "chat"
                ? <ChatThread team={team} instructor={instructor} />
                : <div className="h-full overflow-y-auto p-4 scroll-thin"><FilesView team={team} readOnly={instructor} /></div>}
            </div>
          </FloatingPanel>
        )}
      </AnimatePresence>

      <motion.button
        ref={button}
        type="button"
        onClick={() => (open ? close() : show(tab))}
        // Dragging a file over the button opens the chat, so it can be dropped on the thread.
        onDragEnter={(e) => { if (e.dataTransfer.types.includes("Files")) show("chat"); }}
        aria-label={chatLabel}
        aria-expanded={open}
        aria-controls={open ? `chat-panel-${team.id}` : undefined}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn("absolute bottom-4 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lift outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:bottom-6 lg:right-6", open && "max-lg:hidden")}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={open ? "close" : "chat"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
            {open ? <X weight="bold" className="size-6" aria-hidden /> : <ChatsCircle weight="fill" className="size-7" aria-hidden />}
          </motion.span>
        </AnimatePresence>
        <CountBadge n={open ? 0 : unread} className="bg-warm text-warm-foreground" />
      </motion.button>
    </>
  );
}

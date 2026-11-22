"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowBendUpLeft, ArrowDown, CaretDown, ChatsCircle, DownloadSimple, FileArrowUp, FileText, FolderOpen, Lock, MagnifyingGlass, PaperPlaneTilt, Paperclip, Smiley, X } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { MAX_FILE_BYTES, useAppStore } from "@/lib/store";
import { clockTime, cn, dayLabel, formatBytes, isMentionOf, MENTION_RE, mentionHandle } from "@/lib/utils";
import { useUser } from "@/components/app/user-context";
import { searchTeam } from "@/app/actions";
import { REACTIONS, type ChatMessage, type ChatSearchHit, type Team } from "@/lib/types";
import { EmptyState } from "@/components/app/page";
import { FilesView } from "@/components/student/files";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/overlays";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";
import { t } from "@/lib/i18n";

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
  const { t } = useT();
  const download = useAppStore((s) => s.downloadFile);
  if (!msg.fileName) return null;
  return (
    <button
      type="button"
      onClick={() => msg.filePath && download(msg.filePath)}
      aria-label={t("Download {fileName}", { fileName: msg.fileName })}
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

type BubbleActions = { onReply: (m: ChatMessage) => void; onReact: (m: ChatMessage, emoji: string) => void; onJump: (id: string) => void } | null;

function Bubble({ row, names, me, actions: allActions, highlighted }: { row: Extract<Row, { kind: "msg" }>; names: string[]; me: string; actions: BubbleActions; highlighted: boolean }) {
  const { t } = useT();
  const { msg, head, tail } = row;
  const actions = msg.pending ? null : allActions; // not on the server yet: nothing to reply to or react to
  const reactions = msg.reactions ?? [];
  return (
    <motion.li
      id={`msg-${msg.id}`}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={cn("group/msg flex items-end gap-2.5 rounded-2xl transition-colors duration-700", msg.isMe && "flex-row-reverse", head ? "mt-4" : "mt-1", highlighted && "bg-warm/20")}
    >
      <div className="w-8 shrink-0">{!msg.isMe && tail && <Avatar name={msg.senderName} id={msg.senderId} size="sm" />}</div>
      <div className={cn("flex min-w-0 max-w-[82%] flex-col sm:max-w-[68%]", msg.isMe ? "items-end" : "items-start")}>
        {head && !msg.isMe && (
          <p className="mb-1 ml-1 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            {msg.senderName}
            {msg.fromInstructor && <Badge variant="warm" className="px-1.5 py-0 text-[0.625rem]">{t("Instructor")}</Badge>}
          </p>
        )}
        <div className={cn("flex max-w-full items-center gap-1", msg.isMe && "flex-row-reverse")}>
          <div
            className={cn(
              "min-w-0 rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed",
              msg.pending && "opacity-60",
              msg.isMe ? "bg-primary text-primary-foreground" : msg.fromInstructor ? "bg-warm/10 text-foreground ring-1 ring-warm/30" : "bg-muted text-foreground",
              tail && (msg.isMe ? "rounded-br-md" : "rounded-bl-md"),
            )}
          >
            {msg.replyTo && (
              <button type="button" onClick={() => actions?.onJump(msg.replyTo!.id)} aria-label={t("Replying to {senderName}: {snippet}. Show the original.", { senderName: msg.replyTo.senderName, snippet: msg.replyTo.snippet })}
                className={cn("mb-1.5 block w-full rounded-lg border-l-[3px] px-2.5 py-1 text-left text-xs transition-opacity hover:opacity-80",
                  msg.isMe ? "border-white/60 bg-white/15" : "border-primary/60 bg-card/70")}>
                <span className="block font-bold">{msg.replyTo.senderName}</span>
                <span className="line-clamp-2 opacity-85">{msg.replyTo.snippet || t("Message")}</span>
              </button>
            )}
            {msg.content && <MessageText content={msg.content} names={names} me={me} onPrimary={msg.isMe} />}
            <FileChip msg={msg} />
          </div>
          {actions && (
            // Shown on hover or keyboard focus; always on touch screens, which have no hover.
            <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100 [@media(hover:none)]:opacity-100">
              <Tooltip label={t("Reply")}>
                <button type="button" onClick={() => actions.onReply(msg)} aria-label={(msg.isMe ? t("Reply to your message") : t("Reply to {name}", { name: msg.senderName }))}
                  className="tap flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"><ArrowBendUpLeft className="size-4" aria-hidden /></button>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger aria-label={t("Add a reaction")} className="tap flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  <Smiley className="size-4" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align={msg.isMe ? "end" : "start"} className="flex min-w-0 gap-0.5 p-1">
                  {REACTIONS.map((e) => (
                    <DropdownMenuItem key={e} onSelect={() => actions.onReact(msg, e)} aria-label={t("React with {e}", { e })} className="size-9 justify-center p-0 text-lg">{e}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        {reactions.length > 0 && (
          <div className={cn("mt-1 flex flex-wrap gap-1", msg.isMe && "justify-end")}>
            {reactions.map((r) => (
              <button key={r.emoji} type="button" disabled={!actions} onClick={() => actions?.onReact(msg, r.emoji)} aria-pressed={r.mine}
                title={r.names.join(", ")} aria-label={`${r.emoji} ${r.count}: ${r.names.join(", ")}${r.mine ? t(". Click to remove yours") : ""}`}
                className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors disabled:cursor-default",
                  r.mine ? "border-primary/40 bg-primary/10 text-primary" : "bg-card text-muted-foreground enabled:hover:border-primary/30")}>
                <span className="text-sm leading-none">{r.emoji}</span>{r.count}
              </button>
            ))}
          </div>
        )}
        {msg.pending
          ? <span className="mx-1 mt-1 text-[0.6875rem] font-semibold text-muted-foreground">{t("Waiting to send")}</span>
          : tail && <time dateTime={msg.timestamp} className="mx-1 mt-1 text-[0.6875rem] text-muted-foreground">{clockTime(msg.timestamp)}</time>}
      </div>
    </motion.li>
  );
}

/** Messages + composer for one team. Fills its parent; `instructor` adjusts the copy for the course instructor. */
export function ChatThread({ team, instructor }: { team: Team; instructor?: boolean }) {
  const { t } = useT();
  const messages = useAppStore((s) => s.chatMessages[team.id]);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const uploadFile = useAppStore((s) => s.uploadFile);
  const toggleReaction = useAppStore((s) => s.toggleReaction);
  const download = useAppStore((s) => s.downloadFile);
  const readOnly = team.courseArchived;
  const [replyingTo, setReplyingTo] = React.useState<ChatMessage | null>(null);
  const [highlight, setHighlight] = React.useState<string | null>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<ChatSearchHit[] | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Search after a short pause in typing; at least 2 characters.
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let live = true;
    const t = setTimeout(() => searchTeam(team.id, q).then((h) => live && setHits(h), (err) => {
      console.error("Search failed:", err);
      if (live) setHits([]);
    }), 250);
    return () => { live = false; clearTimeout(t); };
  }, [query, team.id]);

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
    if (f.size > MAX_FILE_BYTES) return void toast.error(t("File is too large"), { description: t("{name} is over 50 MB.", { name: f.name }) });
    if (files.length > 1) toast.info(t("One file per message"), { description: `Attached ${f.name}.` });
    setFile(f);
    inputRef.current?.focus();
  }

  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes(t("Files"));
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

  function jump(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return void toast.info(t("That message is older than the 200 shown here."));
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(id);
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1600);
  }

  function reply(m: ChatMessage) {
    setReplyingTo(m);
    inputRef.current?.focus();
  }

  const actions: BubbleActions = readOnly ? null : {
    onReply: reply,
    onReact: (m, emoji) => { toggleReaction(team.id, m.id, emoji); },
    onJump: jump,
  };

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
    setHits(null);
  }

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
    const ok = await sendMessage(team.id, content, fileId, replyingTo?.id);
    if (ok) {
      setText("");
      setFile(null);
      setReplyingTo(null);
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
            <p className="text-sm font-bold text-foreground">{t("Drop to attach")}</p>
            <p className="text-xs text-muted-foreground">{t("One file, up to 50 MB")}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        {searchOpen ? (
          <div className="relative flex-1">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input ref={searchRef} type="search" value={query} autoFocus aria-label={t("Search messages and files in {name}", { name: team.name })}
              onChange={(e) => { setQuery(e.target.value); if (e.target.value.trim().length < 2) setHits(null); }}
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSearch(); } }}
              placeholder={t("Search messages and files…")} className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25" />
          </div>
        ) : <p className="flex-1 text-xs font-semibold text-muted-foreground">{count ? `${count} ${count === 1 ? "message" : "messages"}` : ""}</p>}
        <Tooltip label={searchOpen ? t("Close search") : t("Search messages and files")}>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={searchOpen ? t("Close search") : t("Search messages and files")} onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}>
            {searchOpen ? <X aria-hidden /> : <MagnifyingGlass aria-hidden />}
          </Button>
        </Tooltip>
      </div>
      <div className="relative min-h-0 flex-1">
        {searchOpen && query.trim().length >= 2 && (
          <div className="absolute inset-0 z-10 overflow-y-auto bg-card p-2 scroll-thin" role="region" aria-label={t("Search results")}>
            {!hits ? (
              <div className="space-y-2 p-2" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            ) : hits.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t("Nothing matches “")}{query.trim()}”.</p>
            ) : (
              <ul className="space-y-1">
                {hits.map((h) => (
                  <li key={`${h.kind}-${h.id}`}>
                    <button type="button" className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-accent"
                      onClick={() => { if (h.kind === "file") download(h.storagePath); else { closeSearch(); requestAnimationFrame(() => jump(h.id)); } }}>
                      {h.kind === "file"
                        ? <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><FileText weight="duotone" className="size-4" aria-hidden /></span>
                        : <Avatar name={h.senderName} size="sm" />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                          <span className="truncate font-bold text-foreground">{h.kind === "file" ? h.name : h.senderName}</span>
                          <span className="shrink-0">{dayLabel(h.timestamp)}</span>
                        </span>
                        <span className="line-clamp-2 text-sm">{h.kind === "file" ? t("File · {size} · shared by {uploadedBy}", { size: h.size, uploadedBy: h.uploadedBy }) : <Highlighted text={h.content} query={query.trim()} />}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div
          ref={listRef}
          onScroll={(e) => { const el = e.currentTarget; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80); }}
          className="h-full overflow-y-auto px-4 pb-4 scroll-thin"
          tabIndex={0}
          role="log"
          aria-label={t("Messages in {name}", { name: team.name })}
          aria-live="polite"
        >
          {!messages ? (
            <div className="space-y-4 pt-5" aria-busy="true">
              <Skeleton className="h-12 w-2/3" /><Skeleton className="ml-auto h-12 w-1/2" /><Skeleton className="h-16 w-3/5" />
            </div>
          ) : count === 0 ? (
            <EmptyState icon={ChatsCircle} title={instructor ? t("No messages yet") : t("Start the conversation")}
              description={instructor ? t("This team hasn't started talking. Say hello to get them going.") : t("Say hello, share a file, or agree who does what. The AI suggests tasks from what you write.")} className="h-full" />
          ) : (
            <ul>
              {rows.map((row) => row.kind === "day" ? (
                <li key={row.key} className="mt-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" aria-hidden />
                  <span className="rounded-full border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">{row.label}</span>
                  <span className="h-px flex-1 bg-border" aria-hidden />
                </li>
              ) : <Bubble key={row.key} row={row} names={memberNames} me={user.name} actions={actions} highlighted={highlight === row.msg.id} />)}
            </ul>
          )}
        </div>
        <AnimatePresence>
          {!atBottom && count > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute bottom-3 left-1/2 -translate-x-1/2">
              <Button size="sm" variant="outline" className="rounded-full shadow-lift" onClick={() => scrollToBottom()}><ArrowDown aria-hidden /> {t("Latest")}</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {readOnly ? (
        <p className="flex shrink-0 items-center gap-2 border-t px-4 py-3 text-sm text-muted-foreground"><Lock className="size-4 shrink-0" aria-hidden />{t("This course is archived, so the chat is read-only.")}</p>
      ) : (
      <form className="shrink-0 border-t p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border-l-[3px] border-primary bg-muted py-1.5 pl-3 pr-1.5" role="status">
            <ArrowBendUpLeft className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 text-xs">
              <span className="block font-bold">{t("Replying to")} {replyingTo.isMe ? t("yourself") : replyingTo.senderName}</span>
              <span className="block truncate text-muted-foreground">{replyingTo.content || (replyingTo.fileName ? `📎 ${replyingTo.fileName}` : "")}</span>
            </span>
            <button type="button" onClick={() => setReplyingTo(null)} aria-label={t("Cancel reply")} className="tap flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
          </div>
        )}
        {file && (
          <div className="mb-2 flex w-fit max-w-full items-center gap-2.5 rounded-xl border bg-muted py-1.5 pl-3 pr-1.5">
            <FileText weight="duotone" className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">{file.name}</span><span className="block text-xs text-muted-foreground">{formatBytes(file.size)}</span></span>
            <button type="button" onClick={() => setFile(null)} aria-label={t("Remove {name}", { name: file.name })} className="tap flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
          </div>
        )}
        {mentionOpen && (
          <ul id={`mention-list-${team.id}`} role="listbox" aria-label={t("Mention a teammate")} className="mb-2 max-w-xs overflow-hidden rounded-2xl border bg-popover p-1 shadow-lift">
            {candidates.map((m, i) => (
              <li key={m.userId} id={`mention-${team.id}-${m.userId}`} role="option" aria-selected={i === activeMention}
                onMouseDown={(e) => { e.preventDefault(); pickMention(m.name); }}
                onMouseEnter={() => setMentionIndex(i)}
                className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm", i === activeMention && "bg-accent")}>
                <Avatar name={m.name} id={m.userId} size="xs" />
                <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>
                <span className="text-xs text-muted-foreground">@{mentionHandle(m.name)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-1.5 rounded-2xl border border-input bg-background p-1.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25">
          <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { attach(e.target.files); e.target.value = ""; }} />
          <Tooltip label={t("Attach a file, or drop it here")} side="top">
            <Button type="button" variant="ghost" size="icon" aria-label={t("Attach a file")} onClick={() => fileRef.current?.click()} disabled={sending}><Paperclip className="size-5" /></Button>
          </Tooltip>
          <label htmlFor={`chat-input-${team.id}`} className="sr-only">{t("Message")} {team.name}</label>
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
              if (e.key === "Escape" && replyingTo) { e.preventDefault(); e.stopPropagation(); setReplyingTo(null); return; }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            placeholder={t("Message {name}…", { name: team.name })}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-base leading-snug outline-none placeholder:text-muted-foreground md:text-[0.9375rem]"
          />
          <Button type="submit" size="icon" aria-label={t("Send message")} loading={sending} disabled={!text.trim() && !file}>
            {!sending && <PaperPlaneTilt weight="fill" className="size-5" />}
          </Button>
        </div>
        <p className="mt-1.5 hidden px-1 text-[0.6875rem] text-muted-foreground sm:block">
          {instructor ? t("Every team member is notified. ") : null}<kbd className="font-sans font-semibold">{t("Enter")}</kbd> {t("to send ·")} <kbd className="font-sans font-semibold">{t("Shift + Enter")}</kbd> {t("for a new line ·")} <kbd className="font-sans font-semibold">@</kbd> {t("to mention")}
        </p>
      </form>
      )}
    </div>
  );
}

/** Text with each occurrence of `query` (any case) marked. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-butter px-0.5 text-foreground">{p}</mark> : p))}</>;
}

const time = (m: ChatMessage) => new Date(m.timestamp).getTime();

type Tab = "chat" | "files";
const VIEWS: Tab[] = ["chat", "files"];

/** Popup shell: anchored bottom-right on desktop, full screen on phones. */
function FloatingPanel({ id, label, icon: Icon, title, subtitle, onClose, panelRef, children }: {
  id: string; label: string; icon: typeof ChatsCircle; title: string; subtitle: React.ReactNode;
  onClose: () => void; panelRef: React.RefObject<HTMLDivElement | null>; children: React.ReactNode;
}) {
  const { t } = useT();
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
      style={{ transformOrigin: t("bottom right") }}
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
        <Tooltip label={t("Close (Esc)")}>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("Close {label}", { label })}>
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
  const { t, tn } = useT();
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

  const show = (tt: Tab) => { setTab(tt); setOpen(true); };

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

  const chatLabel = open ? t("Close team chat and files") : (unread ? tn(unread, "Open team chat and files, {n} new message", "Open team chat and files, {n} new messages") : t("Open team chat and files"));
  const live = (
    <span className="flex items-center gap-1.5">
      <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-success" /><span className="relative size-2 rounded-full bg-success" /></span>
      {t("Live")}
    </span>
  );

  return (
    <>
      <AnimatePresence>
        {open && (
          <FloatingPanel key="chat" id={`chat-panel-${team.id}`} label={t("team chat and files")} icon={tab === "chat" ? ChatsCircle : FolderOpen}
            title={team.name} subtitle={live} onClose={close} panelRef={panelRef}>
            <div className="shrink-0 border-b px-3 py-2">
              <Segmented label={t("Chat or files")} value={tab} onChange={setTab} className="w-full [&>button]:flex-1 [&>button]:justify-center" options={[
                { value: "chat", label: <><ChatsCircle aria-hidden className="size-4" />{t("Chat")}</> },
                { value: "files", label: <><FolderOpen aria-hidden className="size-4" />{t("Files")}{fileCount > 0 && <span className="rounded-full bg-muted px-1.5 text-[0.625rem] font-extrabold tabular-nums text-muted-foreground">{fileCount}</span>}</> },
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
        onDragEnter={(e) => { if (e.dataTransfer.types.includes(t("Files"))) show("chat"); }}
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

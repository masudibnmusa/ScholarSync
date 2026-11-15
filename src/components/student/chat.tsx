"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ChatsCircle, DownloadSimple, FileText, PaperPlaneTilt, Paperclip, X } from "@phosphor-icons/react/dist/ssr";
import { useAppStore } from "@/lib/store";
import { clockTime, cn, dayLabel, formatBytes } from "@/lib/utils";
import type { ChatMessage, Team } from "@/lib/types";
import { EmptyState } from "@/components/app/page";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

function Bubble({ row }: { row: Extract<Row, { kind: "msg" }> }) {
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
        {head && !msg.isMe && <p className="mb-1 ml-1 text-xs font-bold text-muted-foreground">{msg.senderName}</p>}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed",
            msg.isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            tail && (msg.isMe ? "rounded-br-md" : "rounded-bl-md"),
          )}
        >
          {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
          <FileChip msg={msg} />
        </div>
        {tail && <time dateTime={msg.timestamp} className="mx-1 mt-1 text-[0.6875rem] text-muted-foreground">{clockTime(msg.timestamp)}</time>}
      </div>
    </motion.li>
  );
}

/** Messages + composer for one team. Fills its parent; `readOnly` hides the composer (instructors). */
export function ChatThread({ team, readOnly }: { team: Team; readOnly?: boolean }) {
  const messages = useAppStore((s) => s.chatMessages[team.id]);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const uploadFile = useAppStore((s) => s.uploadFile);

  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [sending, setSending] = React.useState(false);
  const [atBottom, setAtBottom] = React.useState(true);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const count = messages?.length ?? 0;
  const rows = React.useMemo(() => toRows(messages ?? []), [messages]);

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
    <div className="flex h-full min-h-0 flex-col">
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
            <EmptyState icon={ChatsCircle} title={readOnly ? "No messages yet" : "Start the conversation"}
              description={readOnly ? "This team hasn't started talking." : "Say hello, share a file, or agree who does what. The AI suggests tasks from what you write."} className="h-full" />
          ) : (
            <ul>
              {rows.map((row) => row.kind === "day" ? (
                <li key={row.key} className="mt-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" aria-hidden />
                  <span className="rounded-full border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">{row.label}</span>
                  <span className="h-px flex-1 bg-border" aria-hidden />
                </li>
              ) : <Bubble key={row.key} row={row} />)}
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

      {readOnly ? (
        <p className="shrink-0 border-t px-4 py-3 text-xs text-muted-foreground">Read-only. Students aren&apos;t notified when you read their chat.</p>
      ) : (
        <form className="shrink-0 border-t p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          {file && (
            <div className="mb-2 flex w-fit max-w-full items-center gap-2.5 rounded-xl border bg-muted py-1.5 pl-3 pr-1.5">
              <FileText weight="duotone" className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{file.name}</span><span className="block text-xs text-muted-foreground">{formatBytes(file.size)}</span></span>
              <button type="button" onClick={() => setFile(null)} aria-label={`Remove ${file.name}`} className="tap flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
            </div>
          )}
          <div className="flex items-end gap-1.5 rounded-2xl border border-input bg-background p-1.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25">
            <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; inputRef.current?.focus(); }} />
            <Tooltip label="Attach a file" side="top">
              <Button type="button" variant="ghost" size="icon" aria-label="Attach a file" onClick={() => fileRef.current?.click()} disabled={sending}><Paperclip className="size-5" /></Button>
            </Tooltip>
            <label htmlFor={`chat-input-${team.id}`} className="sr-only">Message {team.name}</label>
            <textarea
              id={`chat-input-${team.id}`}
              ref={inputRef}
              rows={1}
              value={text}
              maxLength={4000}
              onChange={(e) => { setText(e.target.value); grow(); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              placeholder={`Message ${team.name}…`}
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-base leading-snug outline-none placeholder:text-muted-foreground md:text-[0.9375rem]"
            />
            <Button type="submit" size="icon" aria-label="Send message" loading={sending} disabled={!text.trim() && !file}>
              {!sending && <PaperPlaneTilt weight="fill" className="size-5" />}
            </Button>
          </div>
          <p className="mt-1.5 hidden px-1 text-[0.6875rem] text-muted-foreground sm:block"><kbd className="font-sans font-semibold">Enter</kbd> to send · <kbd className="font-sans font-semibold">Shift + Enter</kbd> for a new line</p>
        </form>
      )}
    </div>
  );
}

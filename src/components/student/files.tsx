"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CloudArrowUp, DownloadSimple, File as FileIcon, FileCode, FileDoc, FileImage, FilePdf, FilePpt, FileXls, FileZip, FolderOpen, MagnifyingGlass, Trash,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { cn, formatBytes, timeAgo } from "@/lib/utils";
import type { FileUpload, Team } from "@/lib/types";
import { EmptyState } from "@/components/app/page";
import { useUser } from "@/components/app/user-context";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/overlays";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";
import { t, num } from "@/lib/i18n";

type Kind = "doc" | "image" | "code" | "other";

export function fileMeta(f: Pick<FileUpload, "fileName" | "fileType">): { icon: Icon; className: string; kind: Kind } {
  const ext = f.fileName.split(".").pop()?.toLowerCase() ?? "";
  const type = f.fileType;
  if (type.startsWith("image/")) return { icon: FileImage, className: "bg-chart-4/15 text-chart-4", kind: "image" };
  if (ext === "pdf") return { icon: FilePdf, className: "bg-destructive/12 text-destructive", kind: "doc" };
  if (["doc", "docx", "txt", "md", "rtf", "odt"].includes(ext)) return { icon: FileDoc, className: "bg-info/12 text-info", kind: "doc" };
  if (["xls", "xlsx", "csv"].includes(ext)) return { icon: FileXls, className: "bg-success/12 text-success", kind: "doc" };
  if (["ppt", "pptx", "key"].includes(ext)) return { icon: FilePpt, className: "bg-warm/15 text-warm-text", kind: "doc" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { icon: FileZip, className: "bg-warning/14 text-warning", kind: "other" };
  if (["js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "html", "css", "json", "sql", "sh", "go", "rs"].includes(ext)) return { icon: FileCode, className: "bg-primary/10 text-primary", kind: "code" };
  return { icon: FileIcon, className: "bg-muted text-muted-foreground", kind: "other" };
}

export function FileRow({ file, teamId }: { file: FileUpload; teamId: string }) {
  const { t } = useT();
  const download = useAppStore((s) => s.downloadFile);
  const remove = useAppStore((s) => s.deleteFile);
  const user = useUser();
  const [confirming, setConfirming] = React.useState(false);
  // Matches RLS: the uploader, or the course instructor (who only sees their own courses' teams).
  const canDelete = file.uploaderId === user.id || user.role === "instructor";
  const meta = fileMeta(file);
  return (
    <div className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-accent/50">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 ease-out-expo group-hover:scale-110", meta.className)}>
        <meta.icon weight="duotone" className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{file.fileName}</p>
        <p className="truncate text-xs text-muted-foreground">{formatBytes(file.fileSize)} · {file.uploadedBy} · <time dateTime={file.createdAt}>{timeAgo(file.createdAt)}</time></p>
      </div>
      <Tooltip label={t("Download")}>
        <Button variant="ghost" size="icon" aria-label={t("Download {fileName}", { fileName: file.fileName })} onClick={() => download(file.storagePath)}>
          <DownloadSimple className="size-5" />
        </Button>
      </Tooltip>
      {canDelete && (
        <Tooltip label={t("Delete")}>
          <Button variant="ghost" size="icon" aria-label={t("Delete {fileName}", { fileName: file.fileName })} className="text-muted-foreground hover:text-destructive" onClick={() => setConfirming(true)}>
            <Trash className="size-5" />
          </Button>
        </Tooltip>
      )}
      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title={t("Delete {fileName}?", { fileName: file.fileName })}
        description={t("It is removed for the whole team. Chat messages that shared it will say it was deleted.")}
        onConfirm={async () => { if (await remove(teamId, file.id)) toast.success(t("File deleted")); }} />
    </div>
  );
}

/** Upload zone, filters and the file list for one team. `readOnly` hides uploading (instructors can only read). */
export function FilesView({ team, readOnly }: { team: Team; readOnly?: boolean }) {
  const { t } = useT();
  const files = useAppStore((s) => s.files);
  const filesLoaded = useAppStore((s) => s.loaded.files);
  const uploadFile = useAppStore((s) => s.uploadFile);

  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<"all" | Kind>("all");
  const [dragOver, setDragOver] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(list: FileList | File[]) {
    const picked = Array.from(list);
    if (!picked.length) return;
    let ok = 0;
    setProgress({ done: 0, total: picked.length });
    for (const [i, f] of picked.entries()) {
      if (await uploadFile(team.id, f)) ok++;
      setProgress({ done: i + 1, total: picked.length });
    }
    setProgress(null);
    if (ok) toast.success(ok === 1 ? t("File uploaded") : t("{ok} files uploaded", { ok }), { description: ok === 1 ? picked[0].name : undefined });
  }

  const q = query.trim().toLowerCase();
  const visible = files.filter((f) => (kind === "all" || fileMeta(f).kind === kind) && (!q || `${f.fileName} ${f.uploadedBy}`.toLowerCase().includes(q)));
  const totalBytes = files.reduce((sum, f) => sum + f.fileSize, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{num(files.length)} {files.length === 1 ? t("file") : t("files")}{files.length ? ` · ${formatBytes(totalBytes)}` : ""} {t("shared in")} {team.name}</p>

      {!readOnly && (
        <>
          <input ref={inputRef} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
          {/* Drop zone: also a normal button, so it works with a keyboard */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
            disabled={!!progress}
            className={cn(
              "group relative flex w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border-2 border-dashed px-5 py-7 text-center transition-[border-color,background-color,transform] duration-300 ease-out-expo",
              dragOver ? "scale-[1.01] border-primary bg-secondary" : "border-input bg-card hover:border-primary/60 hover:bg-secondary/40",
            )}
          >
            <span className={cn("flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary transition-transform duration-300 ease-out-expo group-hover:-translate-y-1", dragOver && "-translate-y-1")}>
              <CloudArrowUp weight="duotone" className="size-6" aria-hidden />
            </span>
            <span className="text-sm font-bold" role="status">
              {progress ? t("Uploading {n} of {total}…", { n: Math.min(progress.done + 1, progress.total), total: progress.total }) : dragOver ? t("Drop to upload") : t("Drop files here, or click to browse")}
            </span>
            <span className="text-xs text-muted-foreground">{t("Up to 50 MB per file")}</span>
            {progress && (
              <span className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </span>
            )}
          </button>
        </>
      )}

      <div className="space-y-2.5">
        <div className="relative">
          <MagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search files…")} aria-label={t("Search files")} className="pl-10" />
        </div>
        <Segmented label={t("File type")} value={kind} onChange={setKind}
          options={[{ value: "all", label: t("All") }, { value: "doc", label: t("Docs") }, { value: "image", label: t("Images") }, { value: "code", label: t("Code") }, { value: "other", label: t("Other") }]} />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        {!filesLoaded ? (
          <div className="space-y-3 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : files.length === 0 ? (
          <EmptyState icon={FolderOpen} title={t("No files yet")} description={readOnly ? t("Nothing has been uploaded by this team.") : t("Upload the brief, your drafts and slides so the whole team works from the same versions.")} className="py-10" />
        ) : visible.length === 0 ? (
          <EmptyState icon={MagnifyingGlass} title={t("No files match")} description={t("Try a different search or file type.")} className="py-10">
            <Button variant="outline" size="sm" onClick={() => { setQuery(""); setKind("all"); }}>{t("Clear filters")}</Button>
          </EmptyState>
        ) : (
          <ul className="divide-y">
            <AnimatePresence initial={false}>
              {visible.map((f) => (
                <motion.li key={f.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  <FileRow file={f} teamId={team.id} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}

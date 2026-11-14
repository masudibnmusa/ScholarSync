"use client";

import { useRef } from "react";
import { useAppStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FolderOpen,
  File,
  FileText,
  FileCode,
  Image,
  Download,
  Upload,
  Search,
  Grid3X3,
  List,
  Clock,
  MoreVertical,
  Loader2,
} from "@/components/icons";
import { EmptyState } from "@/components/empty-state";

const getFileIcon = (type: string) => {
  switch (type) {
    case "pdf":
      return <FileText className="w-8 h-8 text-red-500" />;
    case "code":
      return <FileCode className="w-8 h-8 text-emerald-500" />;
    case "image":
      return <Image className="w-8 h-8 text-teal-500" />;
    default:
      return <File className="w-8 h-8 text-blue-500" />;
  }
};

const getFileType = (fileName: string): string => {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["js", "ts", "py", "sql", "ipynb", "jsx", "tsx"].includes(ext || "")) return "code";
  if (["png", "jpg", "jpeg", "gif", "svg", "fig"].includes(ext || "")) return "image";
  return "doc";
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

export function FilesPanel() {
  const files = useAppStore((s) => s.files) || [];
  const { selectedTeam, uploadFile, downloadFile, isLoading } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedTeam) {
      await uploadFile(selectedTeam.id, file);
    }
    // Reset input so same file can be uploaded again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 bg-card/50">
        <div>
          <h2 className="title-2">Shared Files</h2>
          <p className="text-sm text-muted-foreground">
            Upload and manage project files
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleUploadClick}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Upload File
          </Button>
          <div className="flex items-center border border-border rounded-md">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-r-none">
              <Grid3X3 className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-l-none">
              <List className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-border bg-card/30 shrink-0">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Search files by name..."
            className="w-full h-9 pl-10 pr-3 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* File Grid */}
      <ScrollArea className="flex-1 p-6">
        {files.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No shared files yet"
            body="Upload drafts, datasets or slides and everyone on your team can download them."
          />
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {files.map((file) => (
              <Card
                key={file.id}
                onClick={() => downloadFile(file.storagePath)}
                className="group cursor-pointer hover:border-primary/30 hover:shadow-md transition-all duration-200"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center">
                      {getFileIcon(getFileType(file.fileName))}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="font-medium text-sm truncate mb-0.5">
                    {file.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.fileSize)}
                  </p>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {formatDate(file.createdAt)}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Download ${file.fileName}`}
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

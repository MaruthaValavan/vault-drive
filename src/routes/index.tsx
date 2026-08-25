import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  CloudUpload,
  File as FileIcon,
  FileImage,
  FileText,
  Folder,
  FolderPlus,
  Home,
  LogOut,
  MoreVertical,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  breadcrumbFor,
  createFolder,
  downloadFile,
  formatBytes,
  listAllFolders,
  listFiles,
  listFolders,
  listTrash,
  moveItem,
  purgeFile,
  purgeFolder,
  renameItem,
  restoreItem,
  searchFiles,
  trashItem,
  uploadFile,
  type DriveFile,
  type DriveFolder,
} from "@/lib/drive";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vaultly — Private Cloud File Storage" },
      {
        name: "description",
        content:
          "Vaultly is a private cloud drive: upload files, organize them in folders, search instantly and restore from trash.",
      },
      { property: "og:title", content: "Vaultly — Private Cloud File Storage" },
      {
        property: "og:description",
        content: "Upload, organize, search and restore your files in a fast private cloud drive.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DrivePage,
});

type View = "drive" | "trash";
type Target = { kind: "file" | "folder"; id: string; name: string };

function iconFor(mime: string | null) {
  if (mime?.startsWith("image/")) return FileImage;
  if (mime?.startsWith("text/") || mime === "application/pdf") return FileText;
  return FileIcon;
}

function DrivePage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const qc = useQueryClient();

  const [view, setView] = useState<View>("drive");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameTarget, setRenameTarget] = useState<Target | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveTarget, setMoveTarget] = useState<Target | null>(null);
  const [moveDest, setMoveDest] = useState<string>("root");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const enabled = !!user;
  const searching = debounced.length > 0 && view === "drive";

  const folders = useQuery({
    queryKey: ["folders", folderId],
    queryFn: () => listFolders(folderId),
    enabled: enabled && view === "drive" && !searching,
  });
  const files = useQuery({
    queryKey: ["files", folderId],
    queryFn: () => listFiles(folderId),
    enabled: enabled && view === "drive" && !searching,
  });
  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => searchFiles(debounced),
    enabled: enabled && searching,
  });
  const trail = useQuery({
    queryKey: ["trail", folderId],
    queryFn: () => breadcrumbFor(folderId),
    enabled: enabled && view === "drive",
  });
  const trash = useQuery({
    queryKey: ["trash"],
    queryFn: listTrash,
    enabled: enabled && view === "trash",
  });
  const allFolders = useQuery({
    queryKey: ["all-folders"],
    queryFn: listAllFolders,
    enabled: enabled && !!moveTarget,
  });

  function refresh() {
    qc.invalidateQueries();
  }

  async function run(fn: () => Promise<void>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  async function handleUpload(list: FileList | null) {
    if (!list?.length) return;
    setUploading(list.length);
    let done = 0;
    for (const file of Array.from(list)) {
      try {
        await uploadFile(file, folderId);
        done += 1;
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
      setUploading(list.length - done);
    }
    setUploading(0);
    if (done) toast.success(`${done} file${done > 1 ? "s" : ""} uploaded`);
    refresh();
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading your drive…
      </div>
    );
  }

  const shownFolders = searching ? [] : (folders.data ?? []);
  const shownFiles = searching ? (results.data ?? []) : (files.data ?? []);
  const empty = shownFolders.length === 0 && shownFiles.length === 0;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="mb-8 flex items-center gap-2">
          <CloudUpload className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">Vaultly</span>
        </div>
        <nav className="space-y-1">
          <Button
            variant={view === "drive" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => {
              setView("drive");
              setFolderId(null);
            }}
          >
            <Home className="h-4 w-4" /> My drive
          </Button>
          <Button
            variant={view === "trash" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => setView("trash")}
          >
            <Trash2 className="h-4 w-4" /> Trash
          </Button>
        </nav>
        <div className="mt-auto space-y-2 pt-6">
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      <main
        className="app-glow flex-1 px-4 py-6 md:px-8"
        onDragOver={(e) => {
          e.preventDefault();
          if (view === "drive") setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (view === "drive") void handleUpload(e.dataTransfer.files);
        }}
      >
        <header className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search your files"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          {view === "drive" && (
            <>
              <Button variant="secondary" onClick={() => setNewFolderOpen(true)}>
                <FolderPlus className="h-4 w-4" /> New folder
              </Button>
              <Button onClick={() => inputRef.current?.click()}>
                <Upload className="h-4 w-4" /> Upload
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleUpload(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </header>

        {view === "drive" ? (
          <div className="mt-6 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <button className="hover:text-foreground" onClick={() => setFolderId(null)}>
              My drive
            </button>
            {(trail.data ?? []).map((f) => (
              <span key={f.id} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5" />
                <button className="hover:text-foreground" onClick={() => setFolderId(f.id)}>
                  {f.name}
                </button>
              </span>
            ))}
            {searching && <span className="ml-2">· results for “{debounced}”</span>}
          </div>
        ) : (
          <h1 className="mt-6 text-sm text-muted-foreground">
            Deleted items — restore or delete forever
          </h1>
        )}

        {uploading > 0 && (
          <p className="mt-4 text-sm text-primary">Uploading {uploading} file(s)…</p>
        )}

        {view === "drive" ? (
          <section className="mt-4 space-y-2">
            {empty && (
              <div
                className={`surface-panel flex flex-col items-center justify-center gap-2 p-16 text-center ${
                  dragging ? "border-primary" : ""
                }`}
              >
                <CloudUpload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {searching ? "No files match your search." : "Drop files here or use Upload."}
                </p>
              </div>
            )}

            {shownFolders.map((folder: DriveFolder) => (
              <Row
                key={folder.id}
                icon={<Folder className="h-5 w-5 text-primary" />}
                title={folder.name}
                meta="Folder"
                onOpen={() => setFolderId(folder.id)}
                actions={
                  <ItemMenu
                    onRename={() => {
                      setRenameTarget({ kind: "folder", id: folder.id, name: folder.name });
                      setRenameValue(folder.name);
                    }}
                    onMove={() => {
                      setMoveTarget({ kind: "folder", id: folder.id, name: folder.name });
                      setMoveDest("root");
                    }}
                    onTrash={() =>
                      run(() => trashItem("folder", folder.id), "Moved to trash")
                    }
                  />
                }
              />
            ))}

            {shownFiles.map((file: DriveFile) => {
              const Icon = iconFor(file.mime_type);
              return (
                <Row
                  key={file.id}
                  icon={<Icon className="h-5 w-5 text-muted-foreground" />}
                  title={file.name}
                  meta={`${formatBytes(file.size_bytes)} · ${new Date(file.updated_at).toLocaleDateString()}`}
                  onOpen={() => void downloadFile(file)}
                  actions={
                    <ItemMenu
                      onDownload={() => void downloadFile(file)}
                      onRename={() => {
                        setRenameTarget({ kind: "file", id: file.id, name: file.name });
                        setRenameValue(file.name);
                      }}
                      onMove={() => {
                        setMoveTarget({ kind: "file", id: file.id, name: file.name });
                        setMoveDest("root");
                      }}
                      onTrash={() => run(() => trashItem("file", file.id), "Moved to trash")}
                    />
                  }
                />
              );
            })}
          </section>
        ) : (
          <section className="mt-4 space-y-2">
            {(trash.data?.folders.length ?? 0) === 0 &&
              (trash.data?.files.length ?? 0) === 0 && (
                <div className="surface-panel p-16 text-center text-sm text-muted-foreground">
                  Trash is empty.
                </div>
              )}
            {trash.data?.folders.map((folder) => (
              <Row
                key={folder.id}
                icon={<Folder className="h-5 w-5 text-muted-foreground" />}
                title={folder.name}
                meta="Folder"
                actions={
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => run(() => restoreItem("folder", folder.id), "Restored")}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => run(() => purgeFolder(folder.id), "Deleted forever")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                }
              />
            ))}
            {trash.data?.files.map((file) => (
              <Row
                key={file.id}
                icon={<FileIcon className="h-5 w-5 text-muted-foreground" />}
                title={file.name}
                meta={formatBytes(file.size_bytes)}
                actions={
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => run(() => restoreItem("file", file.id), "Restored")}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => run(() => purgeFile(file), "Deleted forever")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                }
              />
            ))}
          </section>
        )}
      </main>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="folder-name">Name</Label>
            <Input
              id="folder-name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (!newFolderName.trim()) return;
                await run(() => createFolder(newFolderName.trim(), folderId), "Folder created");
                setNewFolderName("");
                setNewFolderOpen(false);
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          <DialogFooter>
            <Button
              onClick={async () => {
                if (!renameTarget || !renameValue.trim()) return;
                await run(
                  () => renameItem(renameTarget.kind, renameTarget.id, renameValue.trim()),
                  "Renamed",
                );
                setRenameTarget(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveTarget} onOpenChange={(o) => !o && setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move “{moveTarget?.name}”</DialogTitle>
          </DialogHeader>
          <Select value={moveDest} onValueChange={setMoveDest}>
            <SelectTrigger>
              <SelectValue placeholder="Destination" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">My drive</SelectItem>
              {(allFolders.data ?? [])
                .filter((f) => f.id !== moveTarget?.id)
                .map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (!moveTarget) return;
                await run(
                  () =>
                    moveItem(
                      moveTarget.kind,
                      moveTarget.id,
                      moveDest === "root" ? null : moveDest,
                    ),
                  "Moved",
                );
                setMoveTarget(null);
              }}
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({
  icon,
  title,
  meta,
  onOpen,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
  onOpen?: () => void;
  actions: React.ReactNode;
}) {
  return (
    <div className="surface-panel flex items-center gap-3 px-4 py-3 transition-colors hover:border-primary/40">
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={onOpen}
        disabled={!onOpen}
      >
        {icon}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">{meta}</span>
        </span>
      </button>
      {actions}
    </div>
  );
}

function ItemMenu({
  onDownload,
  onRename,
  onMove,
  onTrash,
}: {
  onDownload?: () => void;
  onRename: () => void;
  onMove: () => void;
  onTrash: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Item actions">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onDownload && <DropdownMenuItem onClick={onDownload}>Download</DropdownMenuItem>}
        <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
        <DropdownMenuItem onClick={onMove}>Move</DropdownMenuItem>
        <DropdownMenuItem onClick={onTrash}>Move to trash</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

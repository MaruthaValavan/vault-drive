import { supabase } from "@/integrations/supabase/client";

export type DriveFolder = {
  id: string;
  name: string;
  parent_id: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type DriveFile = {
  id: string;
  name: string;
  mime_type: string | null;
  size_bytes: number;
  storage_key: string;
  folder_id: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type SortKey = "name" | "updated_at" | "size_bytes";

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export async function listFolders(parentId: string | null) {
  let query = supabase.from("folders").select("*").eq("is_deleted", false);
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
  const { data, error } = await query.order("name");
  if (error) throw error;
  return (data ?? []) as DriveFolder[];
}

export async function listFiles(folderId: string | null) {
  let query = supabase.from("files").select("*").eq("is_deleted", false);
  query = folderId ? query.eq("folder_id", folderId) : query.is("folder_id", null);
  const { data, error } = await query.order("name");
  if (error) throw error;
  return (data ?? []) as DriveFile[];
}

export async function listAllFolders() {
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("is_deleted", false)
    .order("name");
  if (error) throw error;
  return (data ?? []) as DriveFolder[];
}

export async function searchFiles(term: string) {
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .eq("is_deleted", false)
    .ilike("name", `%${term}%`)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as DriveFile[];
}

export async function listTrash() {
  const [files, folders] = await Promise.all([
    supabase
      .from("files")
      .select("*")
      .eq("is_deleted", true)
      .order("deleted_at", { ascending: false }),
    supabase
      .from("folders")
      .select("*")
      .eq("is_deleted", true)
      .order("deleted_at", { ascending: false }),
  ]);
  if (files.error) throw files.error;
  if (folders.error) throw folders.error;
  return {
    files: (files.data ?? []) as DriveFile[],
    folders: (folders.data ?? []) as DriveFolder[],
  };
}

export async function breadcrumbFor(folderId: string | null) {
  const trail: DriveFolder[] = [];
  let current = folderId;
  while (current) {
    const { data, error } = await supabase
      .from("folders")
      .select("*")
      .eq("id", current)
      .maybeSingle();
    if (error) throw error;
    if (!data) break;
    const folder = data as DriveFolder;
    trail.unshift(folder);
    current = folder.parent_id;
  }
  return trail;
}

export async function createFolder(name: string, parentId: string | null) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { error } = await supabase
    .from("folders")
    .insert({ name, parent_id: parentId, owner_id: auth.user.id });
  if (error) throw error;
}

export async function uploadFile(file: File, folderId: string | null) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const key = `${auth.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error: upErr } = await supabase.storage.from("drive").upload(key, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) throw upErr;
  const { error } = await supabase.from("files").insert({
    name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    storage_key: key,
    folder_id: folderId,
    owner_id: auth.user.id,
  });
  if (error) throw error;
}

export async function downloadFile(file: DriveFile) {
  const { data, error } = await supabase.storage
    .from("drive")
    .createSignedUrl(file.storage_key, 60, { download: file.name });
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

export async function renameItem(kind: "file" | "folder", id: string, name: string) {
  const { error } = await supabase
    .from(kind === "file" ? "files" : "folders")
    .update({ name })
    .eq("id", id);
  if (error) throw error;
}

export async function moveItem(
  kind: "file" | "folder",
  id: string,
  destinationId: string | null,
) {
  const { error } =
    kind === "file"
      ? await supabase.from("files").update({ folder_id: destinationId }).eq("id", id)
      : await supabase.from("folders").update({ parent_id: destinationId }).eq("id", id);
  if (error) throw error;
}


export async function trashItem(kind: "file" | "folder", id: string) {
  const { error } = await supabase
    .from(kind === "file" ? "files" : "folders")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreItem(kind: "file" | "folder", id: string) {
  const { error } = await supabase
    .from(kind === "file" ? "files" : "folders")
    .update({ is_deleted: false, deleted_at: null })
    .eq("id", id);
  if (error) throw error;
}

export async function purgeFile(file: DriveFile) {
  await supabase.storage.from("drive").remove([file.storage_key]);
  const { error } = await supabase.from("files").delete().eq("id", file.id);
  if (error) throw error;
}

export async function purgeFolder(id: string) {
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) throw error;
}

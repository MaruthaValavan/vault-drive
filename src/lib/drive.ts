import { apiFetch } from "./api";
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
  const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
  return (await apiFetch(`/api/folders${qs}`)) as DriveFolder[];
}

export async function listFiles(folderId: string | null) {
  const qs = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
  return (await apiFetch(`/api/files${qs}`)) as DriveFile[];
}

export async function listAllFolders() {
  return (await apiFetch("/api/folders/all")) as DriveFolder[];
}

export async function searchFiles(term: string) {
  return (await apiFetch(`/api/files/search?q=${encodeURIComponent(term)}`)) as DriveFile[];
}

export async function listTrash() {
  return (await apiFetch("/api/trash")) as {
    files: DriveFile[];
    folders: DriveFolder[];
  };
}

export async function breadcrumbFor(folderId: string | null) {
  if (!folderId) return [];
  return (await apiFetch(
    `/api/folders/trail?folderId=${encodeURIComponent(folderId)}`,
  )) as DriveFolder[];
}

export async function createFolder(name: string, parentId: string | null) {
  await apiFetch("/api/folders", {
    method: "POST",
    body: JSON.stringify({ name, parentId }),
  });
}

export async function uploadFile(file: File, folderId: string | null) {
  const form = new FormData();
  form.append("file", file);
  if (folderId) form.append("folderId", folderId);

  try {
    await apiFetch("/api/files", {
      method: "POST",
      body: form,
    });
    return;
  } catch (error) {
    // The standalone Backend is the primary path. The browser-client fallback
    // keeps uploads working in the hosted preview, where localhost:4000 is not
    // available, while still enforcing the signed-in user's storage policies.
    if (!(error instanceof Error && /file service is unavailable/i.test(error.message))) {
      throw error;
    }
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Your session has expired. Please sign in again.");

  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const storageKey = `${userData.user.id}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("drive").upload(storageKey, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error: insertError } = await supabase.from("files").insert({
    name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    storage_key: storageKey,
    folder_id: folderId,
    owner_id: userData.user.id,
  });
  if (insertError) {
    await supabase.storage.from("drive").remove([storageKey]);
    throw new Error(insertError.message);
  }
}

export async function downloadFile(file: DriveFile) {
  const { signedUrl } = (await apiFetch(`/api/files/${file.id}/download`)) as {
    signedUrl: string;
  };
  window.open(signedUrl, "_blank", "noopener");
}

export async function renameItem(kind: "file" | "folder", id: string, name: string) {
  await apiFetch(`/api/${kind}s/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function moveItem(
  kind: "file" | "folder",
  id: string,
  destinationId: string | null,
) {
  const body = kind === "file" ? { folderId: destinationId } : { parentId: destinationId };
  await apiFetch(`/api/${kind}s/${id}/move`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function trashItem(kind: "file" | "folder", id: string) {
  await apiFetch(`/api/${kind}s/${id}/trash`, { method: "PATCH" });
}

export async function restoreItem(kind: "file" | "folder", id: string) {
  await apiFetch(`/api/${kind}s/${id}/restore`, { method: "PATCH" });
}

export async function purgeFile(file: DriveFile) {
  await apiFetch(`/api/files/${file.id}`, { method: "DELETE" });
}

export async function purgeFolder(id: string) {
  await apiFetch(`/api/folders/${id}`, { method: "DELETE" });
}

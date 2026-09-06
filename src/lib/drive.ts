import { apiFetch, isApiUnavailable } from "./api";
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

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  return data.user.id;
}

function shouldUseBrowserFallback(error: unknown) {
  return isApiUnavailable(error);
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export async function listFolders(parentId: string | null) {
  const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
  try {
    return (await apiFetch(`/api/folders${qs}`)) as DriveFolder[];
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    let query = supabase
      .from("folders")
      .select("*")
      .eq("is_deleted", false)
      .order("name");
    query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
    const { data, error: fallbackError } = await query;
    if (fallbackError) throw new Error(fallbackError.message);
    return (data ?? []) as DriveFolder[];
  }
}

export async function listFiles(folderId: string | null) {
  const qs = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
  try {
    return (await apiFetch(`/api/files${qs}`)) as DriveFile[];
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    let query = supabase
      .from("files")
      .select("*")
      .eq("is_deleted", false)
      .order("name");
    query = folderId ? query.eq("folder_id", folderId) : query.is("folder_id", null);
    const { data, error: fallbackError } = await query;
    if (fallbackError) throw new Error(fallbackError.message);
    return (data ?? []) as DriveFile[];
  }
}

export async function listAllFolders() {
  try {
    return (await apiFetch("/api/folders/all")) as DriveFolder[];
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    const { data, error: fallbackError } = await supabase
      .from("folders")
      .select("*")
      .eq("is_deleted", false)
      .order("name");
    if (fallbackError) throw new Error(fallbackError.message);
    return (data ?? []) as DriveFolder[];
  }
}

export async function searchFiles(term: string) {
  try {
    return (await apiFetch(`/api/files/search?q=${encodeURIComponent(term)}`)) as DriveFile[];
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    const { data, error: fallbackError } = await supabase
      .from("files")
      .select("*")
      .eq("is_deleted", false)
      .ilike("name", `%${term}%`)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (fallbackError) throw new Error(fallbackError.message);
    return (data ?? []) as DriveFile[];
  }
}

export async function listTrash() {
  try {
    return (await apiFetch("/api/trash")) as { files: DriveFile[]; folders: DriveFolder[] };
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    const [files, folders] = await Promise.all([
      supabase.from("files").select("*").eq("is_deleted", true).order("deleted_at", { ascending: false }),
      supabase.from("folders").select("*").eq("is_deleted", true).order("deleted_at", { ascending: false }),
    ]);
    if (files.error) throw new Error(files.error.message);
    if (folders.error) throw new Error(folders.error.message);
    return { files: (files.data ?? []) as DriveFile[], folders: (folders.data ?? []) as DriveFolder[] };
  }
}

export async function breadcrumbFor(folderId: string | null) {
  if (!folderId) return [];
  try {
    return (await apiFetch(
      `/api/folders/trail?folderId=${encodeURIComponent(folderId)}`,
    )) as DriveFolder[];
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    const { data, error: fallbackError } = await supabase
      .from("folders")
      .select("*")
      .eq("is_deleted", false);
    if (fallbackError) throw new Error(fallbackError.message);
    const folders = (data ?? []) as DriveFolder[];
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const trail: DriveFolder[] = [];
    let current: string | null = folderId;
    while (current) {
      const folder = byId.get(current);
      if (!folder) break;
      trail.unshift(folder);
      current = folder.parent_id;
    }
    return trail;
  }
}

export async function createFolder(name: string, parentId: string | null) {
  try {
    await apiFetch("/api/folders", {
      method: "POST",
      body: JSON.stringify({ name, parentId }),
    });
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    const ownerId = await currentUserId();
    const { error: fallbackError } = await supabase.from("folders").insert({
      name,
      parent_id: parentId,
      owner_id: ownerId,
    });
    if (fallbackError) throw new Error(fallbackError.message);
  }
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

  const ownerId = await currentUserId();

  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const storageKey = `${ownerId}/${crypto.randomUUID()}-${safeName}`;
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
    owner_id: ownerId,
  });
  if (insertError) {
    await supabase.storage.from("drive").remove([storageKey]);
    throw new Error(insertError.message);
  }
}

export async function downloadFile(file: DriveFile) {
  let signedUrl: string;
  try {
    ({ signedUrl } = (await apiFetch(`/api/files/${file.id}/download`)) as { signedUrl: string });
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    const { data, error: fallbackError } = await supabase.storage
      .from("drive")
      .createSignedUrl(file.storage_key, 60, { download: file.name });
    if (fallbackError) throw new Error(fallbackError.message);
    signedUrl = data.signedUrl;
  }
  window.open(signedUrl, "_blank", "noopener");
}

export async function renameItem(kind: "file" | "folder", id: string, name: string) {
  try {
    await apiFetch(`/api/${kind}s/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    const { error: fallbackError } = await supabase
      .from(kind === "file" ? "files" : "folders")
      .update({ name })
      .eq("id", id);
    if (fallbackError) throw new Error(fallbackError.message);
  }
}

export async function moveItem(
  kind: "file" | "folder",
  id: string,
  destinationId: string | null,
) {
  const body = kind === "file" ? { folderId: destinationId } : { parentId: destinationId };
  try {
    await apiFetch(`/api/${kind}s/${id}/move`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    const { error: fallbackError } = await supabase
      .from(kind === "file" ? "files" : "folders")
      .update(kind === "file" ? { folder_id: destinationId } : { parent_id: destinationId })
      .eq("id", id);
    if (fallbackError) throw new Error(fallbackError.message);
  }
}

export async function trashItem(kind: "file" | "folder", id: string) {
  try {
    await apiFetch(`/api/${kind}s/${id}/trash`, { method: "PATCH" });
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    const { error: fallbackError } = await supabase
      .from(kind === "file" ? "files" : "folders")
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (fallbackError) throw new Error(fallbackError.message);
  }
}

export async function restoreItem(kind: "file" | "folder", id: string) {
  try {
    await apiFetch(`/api/${kind}s/${id}/restore`, { method: "PATCH" });
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    const { error: fallbackError } = await supabase
      .from(kind === "file" ? "files" : "folders")
      .update({ is_deleted: false, deleted_at: null })
      .eq("id", id);
    if (fallbackError) throw new Error(fallbackError.message);
  }
}

export async function purgeFile(file: DriveFile) {
  try {
    await apiFetch(`/api/files/${file.id}`, { method: "DELETE" });
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    const { error: storageError } = await supabase.storage.from("drive").remove([file.storage_key]);
    if (storageError) throw new Error(storageError.message);
    const { error: fallbackError } = await supabase.from("files").delete().eq("id", file.id);
    if (fallbackError) throw new Error(fallbackError.message);
  }
}

export async function purgeFolder(id: string) {
  try {
    await apiFetch(`/api/folders/${id}`, { method: "DELETE" });
  } catch (error) {
    if (!shouldUseBrowserFallback(error)) throw error;
    const { error: fallbackError } = await supabase.from("folders").delete().eq("id", id);
    if (fallbackError) throw new Error(fallbackError.message);
  }
}

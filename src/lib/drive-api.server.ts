import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]!;
const SUPABASE_KEY =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Ctx = { db: SupabaseClient; userId: string };

async function authed(request: Request): Promise<Ctx | Response> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return json({ error: "Missing authorization token" }, 401);

  const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return json({ error: "Invalid or expired token" }, 401);
  return { db, userId: data.user.id };
}

export async function handleDriveApi(request: Request): Promise<Response> {
  const ctx = await authed(request);
  if (ctx instanceof Response) return ctx;
  const { db, userId } = ctx;

  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  const [resource, ...rest] = segments;
  const method = request.method.toUpperCase();

  try {
    if (resource === "trash" && method === "GET") {
      const [files, folders] = await Promise.all([
        db
          .from("files")
          .select("*")
          .eq("owner_id", userId)
          .eq("is_deleted", true)
          .order("deleted_at", { ascending: false }),
        db
          .from("folders")
          .select("*")
          .eq("owner_id", userId)
          .eq("is_deleted", true)
          .order("deleted_at", { ascending: false }),
      ]);
      if (files.error) throw files.error;
      if (folders.error) throw folders.error;
      return json({ files: files.data ?? [], folders: folders.data ?? [] });
    }

    if (resource === "folders") return await folders(db, userId, url, rest, method, request);
    if (resource === "files") return await files(db, userId, url, rest, method, request);

    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Internal server error" }, 500);
  }
}

async function folders(
  db: SupabaseClient,
  userId: string,
  url: URL,
  rest: string[],
  method: string,
  request: Request,
): Promise<Response> {
  const [first, action] = rest;

  if (method === "GET" && !first) {
    const parentId = url.searchParams.get("parentId");
    let query = db
      .from("folders")
      .select("*")
      .eq("owner_id", userId)
      .eq("is_deleted", false);
    query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
    const { data, error } = await query.order("name");
    if (error) throw error;
    return json(data ?? []);
  }

  if (method === "GET" && first === "all") {
    const { data, error } = await db
      .from("folders")
      .select("*")
      .eq("owner_id", userId)
      .eq("is_deleted", false)
      .order("name");
    if (error) throw error;
    return json(data ?? []);
  }

  if (method === "GET" && first === "trail") {
    const trail: Record<string, unknown>[] = [];
    let current: string | null = url.searchParams.get("folderId");
    while (current) {
      const { data, error } = await db
        .from("folders")
        .select("*")
        .eq("id", current)
        .eq("owner_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) break;
      trail.unshift(data);
      current = (data as { parent_id: string | null }).parent_id;
    }
    return json(trail);
  }

  if (method === "POST" && !first) {
    const body = (await request.json()) as { name: string; parentId?: string | null };
    if (!body?.name?.trim()) return json({ error: "Name is required" }, 400);
    const { error } = await db.from("folders").insert({
      name: body.name.trim(),
      parent_id: body.parentId ?? null,
      owner_id: userId,
    });
    if (error) throw error;
    return json({ ok: true }, 201);
  }

  if (method === "PATCH" && first) {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      parentId?: string | null;
    };
    let patch: Record<string, unknown>;
    if (action === "move") patch = { parent_id: body.parentId ?? null };
    else if (action === "trash")
      patch = { is_deleted: true, deleted_at: new Date().toISOString() };
    else if (action === "restore") patch = { is_deleted: false, deleted_at: null };
    else patch = { name: body.name };

    const { error } = await db
      .from("folders")
      .update(patch)
      .eq("id", first)
      .eq("owner_id", userId);
    if (error) throw error;
    return json({ ok: true });
  }

  if (method === "DELETE" && first) {
    const { error } = await db
      .from("folders")
      .delete()
      .eq("id", first)
      .eq("owner_id", userId)
      .eq("is_deleted", true);
    if (error) throw error;
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}

async function files(
  db: SupabaseClient,
  userId: string,
  url: URL,
  rest: string[],
  method: string,
  request: Request,
): Promise<Response> {
  const [first, action] = rest;

  if (method === "GET" && !first) {
    const folderId = url.searchParams.get("folderId");
    let query = db.from("files").select("*").eq("owner_id", userId).eq("is_deleted", false);
    query = folderId ? query.eq("folder_id", folderId) : query.is("folder_id", null);
    const { data, error } = await query.order("name");
    if (error) throw error;
    return json(data ?? []);
  }

  if (method === "GET" && first === "search") {
    const q = url.searchParams.get("q") ?? "";
    const { data, error } = await db
      .from("files")
      .select("*")
      .eq("owner_id", userId)
      .eq("is_deleted", false)
      .ilike("name", `%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return json(data ?? []);
  }

  if (method === "POST" && !first) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "No file provided" }, 400);
    const folderId = (form.get("folderId") as string | null) || null;

    const safeName = file.name.replace(/[^\w.\-]/g, "_");
    const storageKey = `${userId}/${crypto.randomUUID()}-${safeName}`;

    const { error: upErr } = await db.storage
      .from("drive")
      .upload(storageKey, await file.arrayBuffer(), {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) throw upErr;

    const { error: dbErr } = await db.from("files").insert({
      name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      storage_key: storageKey,
      folder_id: folderId,
      owner_id: userId,
    });
    if (dbErr) {
      await db.storage.from("drive").remove([storageKey]);
      throw dbErr;
    }
    return json({ ok: true }, 201);
  }

  if (method === "GET" && first && action === "download") {
    const { data: file, error } = await db
      .from("files")
      .select("*")
      .eq("id", first)
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!file) return json({ error: "File not found" }, 404);

    const { data, error: urlErr } = await db.storage
      .from("drive")
      .createSignedUrl((file as { storage_key: string }).storage_key, 60, {
        download: (file as { name: string }).name,
      });
    if (urlErr) throw urlErr;
    return json({ signedUrl: data.signedUrl });
  }

  if (method === "PATCH" && first) {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      folderId?: string | null;
    };
    let patch: Record<string, unknown>;
    if (action === "move") patch = { folder_id: body.folderId ?? null };
    else if (action === "trash")
      patch = { is_deleted: true, deleted_at: new Date().toISOString() };
    else if (action === "restore") patch = { is_deleted: false, deleted_at: null };
    else patch = { name: body.name };

    const { error } = await db
      .from("files")
      .update(patch)
      .eq("id", first)
      .eq("owner_id", userId);
    if (error) throw error;
    return json({ ok: true });
  }

  if (method === "DELETE" && first) {
    const { data: file, error } = await db
      .from("files")
      .select("storage_key")
      .eq("id", first)
      .eq("owner_id", userId)
      .eq("is_deleted", true)
      .maybeSingle();
    if (error) throw error;
    if (file?.storage_key) {
      await db.storage.from("drive").remove([file.storage_key as string]);
    }
    const { error: delErr } = await db
      .from("files")
      .delete()
      .eq("id", first)
      .eq("owner_id", userId)
      .eq("is_deleted", true);
    if (delErr) throw delErr;
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}

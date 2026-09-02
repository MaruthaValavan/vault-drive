import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.use(requireAuth);

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

// List files in a folder
router.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const folderId = req.query.folderId as string | undefined;
    const ownerId = req.userId!;

    let query = supabaseAdmin
      .from("files")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("is_deleted", false);

    query = folderId ? query.eq("folder_id", folderId) : query.is("folder_id", null);
    const { data, error } = await query.order("name");
    if (error) throw error;
    res.json(data ?? []);
  } catch (e) {
    next(e);
  }
});

// Search files by name
router.get("/search", async (req: AuthenticatedRequest, res, next) => {
  try {
    const q = (req.query.q as string) ?? "";
    const ownerId = req.userId!;

    const { data, error } = await supabaseAdmin
      .from("files")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("is_deleted", false)
      .ilike("name", `%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data ?? []);
  } catch (e) {
    next(e);
  }
});

// Upload a file
router.post(
  "/",
  upload.single("file"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const ownerId = req.userId!;
      const folderId = (req.body.folderId as string | undefined) || null;
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const safeName = file.originalname.replace(/[^\w.\-]/g, "_");
      const storageKey = `${ownerId}/${crypto.randomUUID()}-${safeName}`;

      const { error: upErr } = await supabaseAdmin.storage
        .from("drive")
        .upload(storageKey, file.buffer, {
          contentType: file.mimetype || "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabaseAdmin.from("files").insert({
        name: file.originalname,
        mime_type: file.mimetype || null,
        size_bytes: file.size,
        storage_key: storageKey,
        folder_id: folderId ?? null,
        owner_id: ownerId,
      });
      if (dbErr) {
        // Rollback storage upload on DB failure
        await supabaseAdmin.storage.from("drive").remove([storageKey]);
        throw dbErr;
      }

      res.status(201).json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

// Get signed download URL
router.get("/:id/download", async (req: AuthenticatedRequest, res, next) => {
  try {
    const ownerId = req.userId!;
    const { id } = req.params;

    const { data: file, error } = await supabaseAdmin
      .from("files")
      .select("*")
      .eq("id", id)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw error;
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const { data, error: urlErr } = await supabaseAdmin.storage
      .from("drive")
      .createSignedUrl(file.storage_key, 60, { download: file.name });
    if (urlErr) throw urlErr;

    res.json({ signedUrl: data.signedUrl });
  } catch (e) {
    next(e);
  }
});

// Rename file
router.patch("/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const { name } = updateSchema.parse(req.body);
    const ownerId = req.userId!;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("files")
      .update({ name })
      .eq("id", id)
      .eq("owner_id", ownerId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Move file
router.patch("/:id/move", async (req: AuthenticatedRequest, res, next) => {
  try {
    const { folderId } = updateSchema.parse(req.body);
    const ownerId = req.userId!;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("files")
      .update({ folder_id: folderId ?? null })
      .eq("id", id)
      .eq("owner_id", ownerId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Trash file
router.patch("/:id/trash", async (req: AuthenticatedRequest, res, next) => {
  try {
    const ownerId = req.userId!;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("files")
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", ownerId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Restore file
router.patch("/:id/restore", async (req: AuthenticatedRequest, res, next) => {
  try {
    const ownerId = req.userId!;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("files")
      .update({ is_deleted: false, deleted_at: null })
      .eq("id", id)
      .eq("owner_id", ownerId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Purge file
router.delete("/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const ownerId = req.userId!;
    const { id } = req.params;

    const { data: file, error } = await supabaseAdmin
      .from("files")
      .select("storage_key")
      .eq("id", id)
      .eq("owner_id", ownerId)
      .eq("is_deleted", true)
      .maybeSingle();
    if (error) throw error;

    if (file?.storage_key) {
      await supabaseAdmin.storage.from("drive").remove([file.storage_key]);
    }

    const { error: delErr } = await supabaseAdmin
      .from("files")
      .delete()
      .eq("id", id)
      .eq("owner_id", ownerId)
      .eq("is_deleted", true);
    if (delErr) throw delErr;

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;

import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

// All folder routes require authentication
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

// List folders under a parent
router.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parentId = req.query.parentId as string | undefined;
    const ownerId = req.userId!;

    let query = supabaseAdmin
      .from("folders")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("is_deleted", false);

    query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
    const { data, error } = await query.order("name");
    if (error) throw error;
    res.json(data ?? []);
  } catch (e) {
    next(e);
  }
});

// List all folders for the current user (used by move dialog)
router.get("/all", async (req: AuthenticatedRequest, res, next) => {
  try {
    const ownerId = req.userId!;
    const { data, error } = await supabaseAdmin
      .from("folders")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("is_deleted", false)
      .order("name");
    if (error) throw error;
    res.json(data ?? []);
  } catch (e) {
    next(e);
  }
});

// Breadcrumb trail for a folder
router.get("/trail", async (req: AuthenticatedRequest, res, next) => {
  try {
    const folderId = req.query.folderId as string | undefined;
    const ownerId = req.userId!;
    const trail = [];
    let current: string | undefined = folderId;

    while (current) {
      const { data, error } = await supabaseAdmin
        .from("folders")
        .select("*")
        .eq("id", current)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (error) throw error;
      if (!data) break;
      trail.unshift(data);
      current = data.parent_id ?? undefined;
    }

    res.json(trail);
  } catch (e) {
    next(e);
  }
});

// Create folder
router.post("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const { name, parentId } = createSchema.parse(req.body);
    const ownerId = req.userId!;

    const { error } = await supabaseAdmin.from("folders").insert({
      name,
      parent_id: parentId ?? null,
      owner_id: ownerId,
    });
    if (error) throw error;
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Rename folder
router.patch("/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const { name } = updateSchema.parse(req.body);
    const ownerId = req.userId!;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("folders")
      .update({ name })
      .eq("id", id)
      .eq("owner_id", ownerId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Move folder
router.patch("/:id/move", async (req: AuthenticatedRequest, res, next) => {
  try {
    const { parentId } = updateSchema.parse(req.body);
    const ownerId = req.userId!;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("folders")
      .update({ parent_id: parentId ?? null })
      .eq("id", id)
      .eq("owner_id", ownerId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Trash folder
router.patch("/:id/trash", async (req: AuthenticatedRequest, res, next) => {
  try {
    const ownerId = req.userId!;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("folders")
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", ownerId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Restore folder
router.patch("/:id/restore", async (req: AuthenticatedRequest, res, next) => {
  try {
    const ownerId = req.userId!;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("folders")
      .update({ is_deleted: false, deleted_at: null })
      .eq("id", id)
      .eq("owner_id", ownerId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Purge folder
router.delete("/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const ownerId = req.userId!;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("folders")
      .delete()
      .eq("id", id)
      .eq("owner_id", ownerId)
      .eq("is_deleted", true);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;

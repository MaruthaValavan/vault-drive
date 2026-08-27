import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const ownerId = req.userId!;
    const [files, folders] = await Promise.all([
      supabaseAdmin
        .from("files")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("is_deleted", true)
        .order("deleted_at", { ascending: false }),
      supabaseAdmin
        .from("folders")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("is_deleted", true)
        .order("deleted_at", { ascending: false }),
    ]);
    if (files.error) throw files.error;
    if (folders.error) throw folders.error;
    res.json({ files: files.data ?? [], folders: folders.data ?? [] });
  } catch (e) {
    next(e);
  }
});

export default router;

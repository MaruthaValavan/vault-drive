import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import type { Database } from "./database.types.js";

export const supabaseAdmin = createClient<Database>(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
    },
  },
);

import "dotenv/config";

export const config = {
  port: Number(process.env["PORT"] ?? "4000"),
  corsOrigin: process.env["CORS_ORIGIN"] ?? "http://localhost:8080",
  supabaseUrl: process.env["SUPABASE_URL"]!,
  supabaseServiceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
};

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables",
  );
}

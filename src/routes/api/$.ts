import { createFileRoute } from "@tanstack/react-router";
import { handleDriveApi } from "@/lib/drive-api.server";

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleDriveApi(request),
      POST: ({ request }) => handleDriveApi(request),
      PATCH: ({ request }) => handleDriveApi(request),
      DELETE: ({ request }) => handleDriveApi(request),
    },
  },
});

import { supabase } from "@/integrations/supabase/client";

export const API_URL = import.meta.env["VITE_API_URL"] ?? "http://localhost:4000";

export function isApiUnavailable(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message));
}

export async function apiToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await apiToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    if (isApiUnavailable(error)) {
      throw new Error(
        "The file service is unavailable. Start the separate Backend service or configure VITE_API_URL.",
      );
    }
    throw error;
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  // No content
  if (res.status === 204) return null as unknown;
  return res.json();
}

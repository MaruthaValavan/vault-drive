import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Vaultly Cloud Storage" },
      {
        name: "description",
        content: "Set a new password for your Vaultly private cloud storage account.",
      },
      { property: "og:title", content: "Reset password — Vaultly Cloud Storage" },
      {
        property: "og:description",
        content: "Set a new password for your Vaultly private cloud storage account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [isRecovery, setIsRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    setIsRecovery(new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery");
  }, []);

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      setComplete(true);
      toast.success("Your password has been updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-glow flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <Link to="/auth" className="mb-8 flex items-center justify-center gap-2">
          <CloudUpload className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold tracking-tight">Vaultly</span>
        </Link>
        <div className="surface-panel p-6">
          <h1 className="text-xl font-semibold tracking-tight">Create a new password</h1>
          {complete ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Your password is ready. Sign in with your new password to open your drive.
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Back to sign in
              </Button>
            </div>
          ) : !isRecovery ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                This page is only available from a password-reset link. Request a new link to
                continue.
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Request a reset link
              </Button>
            </div>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={updatePassword}>
              <p className="text-sm text-muted-foreground">Choose a password with at least 6 characters.</p>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  minLength={6}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  minLength={6}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
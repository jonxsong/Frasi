import { useState } from "react";
import { LogOut, X } from "lucide-react";
import { ApiError, apiFetch, type TokenResponse } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import styles from "./Studio.module.css";

interface AuthDialogProps {
  onClose: () => void;
  onNotify: (message: string) => void;
}

export function AuthDialog({ onClose, onNotify }: AuthDialogProps) {
  const user = useAuthStore((state) => state.user);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload =
        mode === "register"
          ? { email, password, display_name: displayName }
          : { email, password };
      const session = await apiFetch<TokenResponse>(`/api/v1/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSession(session.user, session.access_token, session.refresh_token);
      onNotify(mode === "register" ? "Your Frasi studio is ready" : "Welcome back to Frasi");
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (refreshToken) {
      await apiFetch("/api/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => undefined);
    }
    clearSession();
    onNotify("Signed out — local controls remain available");
    onClose();
  }

  return (
    <div className={styles.dialogBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={`${styles.dialog} ${styles.authDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className={styles.dialogClose} onClick={onClose} aria-label="Close" type="button">
          <X size={18} />
        </button>
        <p className={styles.eyebrow}>YOUR STUDIO</p>
        {user ? (
          <div className={styles.accountSummary}>
            <div>{user.display_name.slice(0, 1).toUpperCase()}</div>
            <h2 id="account-title">{user.display_name}</h2>
            <p>{user.email}</p>
            <button onClick={() => void signOut()} type="button">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        ) : (
          <>
            <h2 id="account-title">{mode === "login" ? "Return to your phrases" : "Create your studio"}</h2>
            <p className={styles.dialogIntro}>
              Sync private transcriptions, revisions, vocabulary, and practice progress.
            </p>
            <div className={styles.dialogTabs} role="tablist" aria-label="Account action">
              <button
                className={mode === "login" ? styles.dialogTabActive : styles.dialogTab}
                onClick={() => setMode("login")}
                type="button"
              >
                Sign in
              </button>
              <button
                className={mode === "register" ? styles.dialogTabActive : styles.dialogTab}
                onClick={() => setMode("register")}
                type="button"
              >
                Create account
              </button>
            </div>
            <form className={styles.authForm} onSubmit={(event) => void submit(event)}>
              {mode === "register" && (
                <label>
                  Display name
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    autoComplete="name"
                    minLength={1}
                    maxLength={120}
                    required
                  />
                </label>
              )}
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={12}
                  required
                />
              </label>
              {error && <p className={styles.formError}>{error}</p>}
              <button className={styles.primaryFormButton} disabled={busy} type="submit">
                {busy ? "Connecting…" : mode === "login" ? "Sign in" : "Create private studio"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

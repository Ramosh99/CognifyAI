"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Tab = "signin" | "signup";

export default function LoginPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [tab, setTab]       = useState<Tab>("signin");
  const [email, setEmail]   = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (tab === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else {
        setSuccess("Account created. Check your email for a confirmation link, then sign in.");
      }
    }

    setLoading(false);
  };

  return (
    <div style={{ width: "100%", maxWidth: "380px" }}>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 className="grad-text" style={{ fontSize: "1.75rem" }}>CognifyAI</h1>
        <p style={{ marginTop: "0.35rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          {tab === "signin" ? "Sign in to continue" : "Create your account"}
        </p>
      </div>

      {/* Card */}
      <div className="card" style={{ padding: "1.75rem" }}>
        {/* Tab Toggle */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0",
            marginBottom: "1.5rem",
            background: "var(--bg-base)",
            borderRadius: "var(--radius-sm)",
            padding: "3px",
            border: "1px solid var(--border)",
          }}
        >
          {(["signin", "signup"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); setSuccess(""); }}
              style={{
                padding: "0.5rem",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: "0.825rem",
                transition: "all 0.15s ease",
                background: tab === t ? "var(--bg-card)" : "transparent",
                color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {t === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div>
            <label
              htmlFor="email"
              style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder={tab === "signup" ? "Min 6 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
            />
          </div>

          {error   && <div className="feedback-box error">{error}</div>}
          {success && <div className="feedback-box success">{success}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: "100%", padding: "0.65rem", marginTop: "0.25rem" }}
          >
            {loading
              ? <><span className="spinner" /> {tab === "signin" ? "Signing in..." : "Creating account..."}</>
              : tab === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>

      <p style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
        {tab === "signin" ? "No account? " : "Have an account? "}
        <button
          onClick={() => { setTab(tab === "signin" ? "signup" : "signin"); setError(""); setSuccess(""); }}
          style={{ background: "none", border: "none", color: "var(--accent-1)", cursor: "pointer", fontWeight: 500, fontSize: "0.8rem" }}
        >
          {tab === "signin" ? "Sign up" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

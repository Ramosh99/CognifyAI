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
        setSuccess(
          "🎉 Account created! Check your email for a confirmation link, then sign in."
        );
      }
    }

    setLoading(false);
  };

  return (
    <div style={{ width: "100%", maxWidth: "420px" }}>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 className="grad-text" style={{ fontSize: "2rem" }}>CognifyAI</h1>
        <p style={{ marginTop: "0.3rem", fontSize: "0.9rem" }}>
          {tab === "signin" ? "Sign in to your account" : "Create a new account"}
        </p>
      </div>

      {/* Card */}
      <div className="card" style={{ padding: "2rem" }}>
        {/* Tab Toggle */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.5rem",
            marginBottom: "1.75rem",
            background: "var(--bg-base)",
            borderRadius: "var(--radius-sm)",
            padding: "0.25rem",
          }}
        >
          {(["signin", "signup"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); setSuccess(""); }}
              style={{
                padding: "0.55rem",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.875rem",
                transition: "all 0.15s",
                background: tab === t ? "var(--bg-card)" : "transparent",
                color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
              }}
            >
              {t === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label
              htmlFor="email"
              style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}
            >
              Email address
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
              style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder={tab === "signup" ? "Minimum 6 characters" : "Enter your password"}
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
            style={{ width: "100%", padding: "0.75rem", marginTop: "0.25rem" }}
          >
            {loading
              ? <><span className="spinner" /> {tab === "signin" ? "Signing in..." : "Creating account..."}</>
              : tab === "signin" ? "Sign In →" : "Create Account →"}
          </button>
        </form>
      </div>

      <p style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
        {tab === "signin" ? "Don't have an account? " : "Already have an account? "}
        <button
          onClick={() => { setTab(tab === "signin" ? "signup" : "signin"); setError(""); setSuccess(""); }}
          style={{ background: "none", border: "none", color: "var(--accent-1)", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem" }}
        >
          {tab === "signin" ? "Sign up free" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

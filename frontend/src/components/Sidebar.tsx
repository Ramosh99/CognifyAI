"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/dashboard",          label: "Overview",    icon: "⬡" },
  { href: "/dashboard/chat",     label: "Chat",        icon: "💬" },
  { href: "/dashboard/visual",   label: "Visual Explain", icon: "✨" },
  { href: "/dashboard/upload",   label: "Upload Docs", icon: "📄" },
  { href: "/dashboard/quiz",     label: "Take Quiz",   icon: "🧠" },
  { href: "/dashboard/search",   label: "Search",      icon: "🔍" },
  { href: "/dashboard/analytics",label: "Analytics",   icon: "📊" },
];

export default function Sidebar() {
  const path     = usePathname();
  const router   = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="grad-text">CognifyAI</span>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${path === item.href ? "active" : ""}`}
          >
            <span style={{ fontSize: "1rem" }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User Info + Sign Out */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {email && (
          <div style={{ padding: "0 0.5rem" }}>
            <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.1rem" }}>Signed in as</p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</p>
          </div>
        )}
        <button
          onClick={signOut}
          className="nav-item"
          style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "var(--accent-danger)" }}
        >
          <span style={{ fontSize: "1rem" }}>→</span>
          Sign Out
        </button>
        <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center", padding: "0 0.5rem" }}>
          Powered by pgvector + OpenRouter
        </p>
      </div>
    </aside>
  );
}

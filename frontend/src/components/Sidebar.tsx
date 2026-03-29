"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

const NAV = [
  { href: "/dashboard",          label: "Overview",      icon: "overview" },
  { href: "/dashboard/chat",     label: "Chat",          icon: "chat" },
  { href: "/dashboard/visual",   label: "Visual Explain", icon: "visual" },
  { href: "/dashboard/upload",   label: "Upload",        icon: "upload" },
  { href: "/dashboard/quiz",     label: "Quiz",          icon: "quiz" },
  { href: "/dashboard/search",   label: "Search",        icon: "search" },
  { href: "/dashboard/analytics",label: "Analytics",     icon: "analytics" },
];

function NavIcon({ type, active }: { type: string; active: boolean }) {
  const color = active ? "var(--accent-1)" : "var(--text-muted)";
  const s = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: color, strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "overview": return <svg {...s}><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>;
    case "chat": return <svg {...s}><path d="M3 3h10a1 1 0 011 1v7a1 1 0 01-1 1H5l-3 3V4a1 1 0 011-1z"/></svg>;
    case "visual": return <svg {...s}><circle cx="8" cy="8" r="5"/><path d="M8 5v6M5 8h6"/></svg>;
    case "upload": return <svg {...s}><path d="M8 11V3M5 6l3-3 3 3"/><path d="M3 11v2h10v-2"/></svg>;
    case "quiz": return <svg {...s}><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M6 6h4M6 9h4M6 12h2"/></svg>;
    case "search": return <svg {...s}><circle cx="7" cy="7" r="4"/><path d="M10 10l3.5 3.5"/></svg>;
    case "analytics": return <svg {...s}><path d="M3 13V8M6 13V5M9 13V9M12 13V3"/></svg>;
    default: return null;
  }
}

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
        <span style={{ fontWeight: 800, fontSize: "1rem", letterSpacing: "-0.04em", fontFamily: "ui-monospace", color: "var(--text-primary)" }}>COGNIFY AI</span>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "1px", flex: 1 }}>
        {NAV.map((item) => {
          const isActive = path === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive ? "active" : ""}`}
            >
              <NavIcon type={item.icon} active={isActive} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <ThemeToggle />
        {email && (
          <div style={{ padding: "0.4rem 0.5rem" }}>
            <p style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: "0.1rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Signed in</p>
            <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</p>
          </div>
        )}
        <button
          onClick={signOut}
          className="nav-item"
          style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2H4a1 1 0 00-1 1v10a1 1 0 001 1h2"/><path d="M10 11l3-3-3-3"/><path d="M13 8H6"/></svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
}

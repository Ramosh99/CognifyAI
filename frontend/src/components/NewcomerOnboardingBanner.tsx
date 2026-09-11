"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getLearnerWeights } from "@/lib/api";

export default function NewcomerOnboardingBanner() {
  const pathname = usePathname();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if session storage already dismissed it
    if (typeof window !== "undefined" && sessionStorage.getItem("cognify_onboarding_dismissed")) {
      return;
    }

    getLearnerWeights()
      .then((data) => {
        if (!data.onboarding_done) {
          setNeedsOnboarding(true);
        }
      })
      .catch(() => {
        // Silently ignore if not logged in or backend temporarily unreachable
      });
  }, [pathname]);

  // Don't show if dismissed, on onboarding page, or onboarding is completed
  if (!needsOnboarding || dismissed || pathname === "/dashboard/onboarding") {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("cognify_onboarding_dismissed", "1");
    }
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "860px",
        marginBottom: "1.5rem",
        padding: "0.85rem 1.25rem",
        background: "linear-gradient(90deg, rgba(99, 102, 241, 0.12) 0%, rgba(236, 72, 153, 0.1) 100%)",
        border: "1px solid rgba(99, 102, 241, 0.25)",
        borderRadius: "var(--radius-md)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        flexWrap: "wrap",
        animation: "fadeUp 0.3s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ fontSize: "1.3rem" }}>🧠</span>
        <div>
          <p style={{ fontSize: "0.85rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Welcome newcomer! Personalize your learning engine
          </p>
          <p style={{ fontSize: "0.76rem", color: "var(--text-secondary)", margin: "0.15rem 0 0 0" }}>
            Take the 2-minute diagnostic to test your Visual, Auditory, Textual, and Applied learning styles.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Link
          href="/dashboard/onboarding"
          className="btn btn-primary"
          style={{ fontSize: "0.78rem", padding: "0.4rem 0.85rem", fontWeight: 600 }}
        >
          Setup Profile →
        </Link>
        <button
          onClick={handleDismiss}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: "0.78rem",
            cursor: "pointer",
            padding: "0.4rem 0.6rem",
          }}
        >
          Later
        </button>
      </div>
    </div>
  );
}

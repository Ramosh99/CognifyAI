import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CognifyAI – Adaptive Truth-Aware Learning",
  description:
    "An AI-powered personalized learning platform that adapts content to your learner type, generates concept-aware quizzes, and provides truth-validated explanations.",
};

import { Toaster } from "react-hot-toast";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var t = localStorage.getItem('theme');
                if (t === 'light' || t === 'dark') {
                  document.documentElement.setAttribute('data-theme', t);
                } else {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        <Toaster position="bottom-right" toastOptions={{ 
          style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' },
          success: { iconTheme: { primary: 'var(--accent-success)', secondary: '#fff' } },
          error: { iconTheme: { primary: 'var(--accent-danger)', secondary: '#fff' } },
        }} />
        {children}
      </body>
    </html>
  );
}

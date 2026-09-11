import type { Metadata } from "next";
import { Newsreader, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CognifyAI – Adaptive Truth-Aware Learning",
  description:
    "An AI-powered personalized learning platform that adapts content to your learner type, generates concept-aware quizzes, and provides truth-validated explanations.",
};

import { Toaster } from "react-hot-toast";
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('theme');
                  if (t === 'light' || t === 'dark') {
                    document.documentElement.setAttribute('data-theme', t);
                  } else {
                    document.documentElement.setAttribute('data-theme', 'dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />

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

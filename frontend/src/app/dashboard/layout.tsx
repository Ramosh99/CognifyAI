import Sidebar from "@/components/Sidebar";
import NewcomerOnboardingBanner from "@/components/NewcomerOnboardingBanner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main className="page-content" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <NewcomerOnboardingBanner />
        {children}
      </main>
    </div>
  );
}


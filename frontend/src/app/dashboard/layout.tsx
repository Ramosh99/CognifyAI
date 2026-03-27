import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main className="page-content" style={{ flex: 1 }}>
        {children}
      </main>
    </div>
  );
}

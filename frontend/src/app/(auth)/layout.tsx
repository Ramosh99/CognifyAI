export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "radial-gradient(ellipse at 50% 0%, rgba(79,110,247,0.1) 0%, transparent 60%)",
      }}
    >
      {children}
    </div>
  );
}

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0f" }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
        <span className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Loading...</span>
      </div>
    </div>
  );
}

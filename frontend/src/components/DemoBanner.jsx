// Shown only when the server runs the stub provider (CLAUDE.md: simulated behaviour must be labelled).
export default function DemoBanner() {
  return (
    <div className="flex h-9 flex-none items-center gap-3 border-b border-hairline bg-accent-tint px-8 text-xs text-secondary">
      <span className="font-semibold text-accent-dark">SIMULATED AI</span>
      <span>SubPilot and its accounts are fictional. Answers are scripted; there is no retrieval or model call.</span>
    </div>
  );
}

import type { ReactNode } from "react";

const TONES = {
  white: "bg-white",
  sun: "bg-sun",
  mint: "bg-mint",
  sky: "bg-sky",
  blush: "bg-blush",
  ink: "bg-ink text-white",
  hero: "bg-gradient-to-br from-violet to-rose text-white",
  muted: "bg-ink/5 text-ink/50",
} as const;

export type Tone = keyof typeof TONES;

export function Tile({ tone = "white", className = "", title, children }: {
  tone?: Tone; className?: string; title?: ReactNode; children: ReactNode;
}) {
  return (
    <section className={`relative overflow-hidden rounded-3xl p-5 ${TONES[tone]} ${className}`}>
      {title && <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider opacity-70">{title}</h2>}
      {children}
    </section>
  );
}

export function Unavailable({ error }: { error: string }) {
  return (
    <p className="text-sm" title={error}>
      Donnée indisponible
    </p>
  );
}

const TZ = "Europe/Paris";

export function formatInt(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);
}

export function formatBytes(b: number): string {
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let v = b;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = v >= 10 || i === 0 ? 0 : 1;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(v)} ${units[i]}`;
}

export function formatPct(x: number): string {
  return `${Math.round(x * 100)} %`;
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return `${email.slice(0, 3)}…`;
  return `${email.slice(0, Math.min(3, at))}…${email.slice(at)}`;
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

export function formatParis(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, ...opts }).format(new Date(iso));
}

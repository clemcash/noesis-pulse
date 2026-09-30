const TZ = "Europe/Paris";

function parts(d: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out;
}

/** Décalage de Paris par rapport à UTC, en minutes, à l'instant donné. */
function offsetMinutes(d: Date): number {
  const p = parts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

export function parisHour(d: Date): number {
  return parts(d).hour;
}

/** Minuit Paris (en UTC) pour une date calendaire y-m-d. */
function parisMidnight(y: number, m: number, day: number): Date {
  const guess = Date.UTC(y, m - 1, day, 0, 0, 0);
  const first = guess - offsetMinutes(new Date(guess)) * 60000;
  // 2ᵉ passe : le décalage peut changer entre guess et le vrai minuit (jour de changement d'heure).
  return new Date(guess - offsetMinutes(new Date(first)) * 60000);
}

/** Bornes [from, to[ du jour calendaire parisien décalé de offsetDays par rapport à `now`. */
export function parisDayBounds(now: Date, offsetDays: number): { from: Date; to: Date } {
  const p = parts(now);
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day + offsetDays));
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + offsetDays + 1));
  return {
    from: parisMidnight(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate()),
    to: parisMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()),
  };
}

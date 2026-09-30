const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|merge|vacuum|reindex|cluster|comment|lock|set|reset|listen|notify|prepare|execute|refresh|security|pg_terminate_backend|pg_cancel_backend|pg_sleep|lo_import|lo_export|dblink)\b/i;

/** Retire les littéraux '...' et les commentaires pour ne pas y chercher de mots-clés. */
function stripLiterals(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
}

export function assertReadOnly(sql: string): void {
  const body = stripLiterals(sql).trim().replace(/;\s*$/, "");
  if (!body) throw new Error("Requête refusée : vide");
  if (body.includes(";")) throw new Error("Requête refusée : une seule instruction autorisée");
  if (!/^(select|with)\b/i.test(body)) throw new Error("Requête refusée : SELECT uniquement");
  const m = body.match(FORBIDDEN);
  if (m) throw new Error(`Requête refusée : mot-clé interdit « ${m[1]} »`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export const lit = {
  ts(d: Date): string {
    if (Number.isNaN(d.getTime())) throw new Error("Date invalide");
    return `'${d.toISOString()}'::timestamptz`;
  },
  uuid(s: string): string {
    if (!isUuid(s)) throw new Error("UUID invalide");
    return `'${s.toLowerCase()}'::uuid`;
  },
  int(n: number): string {
    if (!Number.isInteger(n)) throw new Error("Entier invalide");
    return String(n);
  },
};

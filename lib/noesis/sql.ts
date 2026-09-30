// Defense-in-depth for code-authored SQL; the primary control is Supabase's read_only transaction.
const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|merge|vacuum|reindex|cluster|comment|lock|set|reset|listen|notify|prepare|execute|refresh|security|pg_terminate_backend|pg_cancel_backend|pg_sleep|into|nextval|setval|set_config|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_advisory_lock|pg_advisory_xact_lock|dblink)\b/i;

// Match lo_* and pg_advisory* functions via additional alternation
const FORBIDDEN_FUNCS = /\b(lo_\w+|pg_advisory\w*)\b/i;

/**
 * Single-pass literal scanner: consumes single-quoted strings (handling '' escapes),
 * replaces each with '', throws if unterminated or if dangerous constructs found.
 */
function stripLiterals(sql: string): string {
  // Check for backslash (escape sequences not allowed)
  if (sql.includes("\\")) throw new Error("Requête refusée : caractère interdit");

  // Check for E-string prefix (e/E followed by ' where char before is not alphanumeric/_)
  if (/(?<![a-zA-Z0-9_])[eE]'/.test(sql)) throw new Error("Requête refusée : caractère interdit");

  let result = "";
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
      // Consume literal: read until closing ' ('' is escape and continues)
      i++;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (i + 1 < sql.length && sql[i + 1] === "'") {
            // Escaped quote: skip both
            i += 2;
          } else {
            // Closing quote
            i++;
            break;
          }
        } else {
          i++;
        }
      }
      // If we reached end without closing quote, throw
      if (i > sql.length || (i === sql.length && sql[i - 1] !== "'")) {
        // More precisely: if we exited the inner loop without breaking on closing quote
        if (i === sql.length && sql[sql.length - 1] !== "'") {
          throw new Error("Requête refusée : littéral non fermé");
        }
      }
      result += "''"; // Replace entire literal with ''
    } else {
      result += sql[i];
      i++;
    }
  }
  return result;
}

export function assertReadOnly(sql: string): void {
  // Strip literals (throws on backslash, E-prefix, unterminated literal)
  const body = stripLiterals(sql).trim().replace(/;\s*$/, "");

  // Check for empty
  if (!body) throw new Error("Requête refusée : vide");

  // Check for multiple statements (semicolon in middle)
  if (body.includes(";")) throw new Error("Requête refusée : une seule instruction autorisée");

  // Forbid comments, $, and double quotes
  if (body.includes("--") || body.includes("/*") || body.includes("*/") || body.includes("$") || body.includes('"'))
    throw new Error("Requête refusée : commentaires, $ et guillemets doubles interdits");

  // Check must start with SELECT or WITH
  if (!/^(select|with)\b/i.test(body)) throw new Error("Requête refusée : SELECT uniquement");

  // Check forbidden keywords
  const m = body.match(FORBIDDEN);
  if (m) throw new Error(`Requête refusée : mot-clé interdit « ${m[1]} »`);

  // Check forbidden function patterns
  const mFunc = body.match(FORBIDDEN_FUNCS);
  if (mFunc) throw new Error(`Requête refusée : mot-clé interdit « ${mFunc[1]} »`);
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
    if (!Number.isSafeInteger(n)) throw new Error("Entier invalide");
    return String(n);
  },
};

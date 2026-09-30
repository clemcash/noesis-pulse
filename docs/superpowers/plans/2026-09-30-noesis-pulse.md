# Noesis Pulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire « Noesis Pulse », un tableau de bord privé, déployé, en bento coloré, qui suit Noesis (en ligne, demandes IA, utilisateurs, santé Groq/Supabase) avec relevés toutes les 5 min, alertes et résumé quotidien Telegram — sans aucune modification de Noesis.

**Architecture:** App Next.js 16 (App Router) sur Vercel. Un projet Supabase séparé (« Pulse ») stocke les relevés/alertes, gère l'auth (lien magique, un seul email autorisé) et déclenche la collecte via `pg_cron` + `pg_net`. Noesis est lu uniquement en SQL `SELECT` via la Supabase Management API (module unique `lib/noesis/`). Toute la logique (règles d'alerte, résumé, agrégations, construction d'un relevé) est en fonctions pures testées ; les pages sont des Server Components qui lisent une couche `lib/data/` renvoyant des `Result<T>` par bloc.

**Tech Stack:** Next.js 16.3.5, React 19.2.8, TypeScript 5, Tailwind 4, Recharts 3, `@supabase/supabase-js` + `@supabase/ssr`, Vitest, `@electric-sql/pglite` (tests SQL), Telegram Bot API, Groq API.

**Spec:** `docs/superpowers/specs/2026-09-30-noesis-pulse-design.md` (lire en entier avant de commencer).

## Global Constraints

- **Aucune modification de Noesis** (`C:\Users\clecl\OneDrive\Bureau\intellect-lab\intellect-lab`) : ni code, ni migration, ni rôle/table/fonction dans sa base. Ne jamais ouvrir ce dossier en écriture.
- Tout accès à la base Noesis passe par `lib/noesis/client.ts` → `runNoesisSql()`, qui refuse tout ce qui n'est pas un `SELECT`/`WITH … SELECT` unique.
- Ne jamais lire les colonnes `content` (messages, tours), `question`/`goal` (défis), `topic` (débats).
- **Jamais de repli silencieux vers des données fictives en production.** Mode démo seulement si `PULSE_DEMO=1` **et** `NODE_ENV !== "production"`.
- Secrets uniquement côté serveur ; ne jamais logger `SUPABASE_MANAGEMENT_TOKEN`, `GROQ_API_KEY`, `TELEGRAM_BOT_TOKEN`, `PULSE_SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
- Fuseau d'affichage et de calcul des jours : `Europe/Paris`. Langue de l'UI et des messages : français.
- Dev server : port **3020**.
- Modèles Groq : `openai/gpt-oss-120b` (principal, sonde toutes les 30 min), `openai/gpt-oss-20b` (secours, toutes les 60 min) ; `GET /openai/v1/models` à chaque relevé.
- Limites par défaut Supabase gratuit : base 500 Mo, stockage 1024 Mo (surchargeables par `NOESIS_DB_LIMIT_MB`, `NOESIS_STORAGE_LIMIT_MB`).
- Rétention des relevés : 90 jours.
- Next.js 16 : `middleware` s'appelle `proxy.ts` ; `searchParams`/`params` des pages sont des `Promise`. Avant d'écrire du code Next, lire le guide concerné dans `node_modules/next/dist/docs/`.
- Commits : messages en français, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Structure des fichiers

```
noesis-pulse/
├─ package.json · tsconfig.json · next.config.ts · postcss.config.mjs · eslint.config.mjs · vitest.config.ts
├─ .env.example · README.md · proxy.ts
├─ supabase/migrations/0001_pulse.sql        tables + RLS + règles par défaut
├─ supabase/migrations/0002_cron.sql         jobs pg_cron (collect, health-check, digest)
├─ lib/
│  ├─ env.ts            accès typé aux variables + isDemo()
│  ├─ types.ts          types partagés (Snapshot, GroqStatus, Alert, …)
│  ├─ result.ts         Result<T> + settle()
│  ├─ format.ts         nombres, octets, dates Paris, maskEmail, timeAgo
│  ├─ time.ts           parisHour(), parisDayBounds()
│  ├─ period.ts         Period → bornes + taille de tranche
│  ├─ stats.ts          pctChange, perHour, peak, availability
│  ├─ noesis/sql.ts     garde lecture seule + littéraux SQL sûrs
│  ├─ noesis/client.ts  runNoesisSql() via Management API
│  ├─ noesis/queries.ts requêtes SQL + mappers typés
│  ├─ sources/supabase-usage.ts  compteurs de requêtes API
│  ├─ sources/groq.ts            checkGroqApi, probeGroqModel, latestProbes, shouldProbe
│  ├─ store.ts          accès base Pulse (service role)
│  ├─ collect.ts        buildSnapshot() (pur, deps injectées)
│  ├─ alerts/rules.ts   checkRule(), diffAlerts() (purs)
│  ├─ alerts/telegram.ts sendTelegram()
│  ├─ alerts/run.ts     runAlerts() (ouvre/résout + notifie)
│  ├─ digest.ts         buildDigest() (pur)
│  ├─ cron-auth.ts      isCronAuthorized()
│  ├─ auth/allowed.ts   isAllowedEmail()
│  ├─ supabase/server.ts client SSR (auth Pulse) + requireUser()
│  ├─ demo.ts           données fictives déterministes
│  └─ data/{overview,users,apis,alerts}.ts  couche lue par les pages
├─ app/
│  ├─ layout.tsx · globals.css
│  ├─ login/page.tsx · login/actions.ts · auth/callback/route.ts
│  ├─ (dash)/layout.tsx · (dash)/page.tsx
│  ├─ (dash)/users/page.tsx · (dash)/users/[id]/page.tsx
│  ├─ (dash)/apis/page.tsx
│  ├─ (dash)/alerts/page.tsx · (dash)/alerts/actions.ts
│  └─ api/{collect,digest,health-check}/route.ts
├─ components/
│  ├─ nav.tsx · period-select.tsx · auto-refresh.tsx
│  ├─ bento/tile.tsx · bento/stat.tsx · bento/feature-bar.tsx · bento/health-row.tsx
│  ├─ charts/area-spark.tsx · charts/bars.tsx · charts/lines.tsx
│  └─ users-table.tsx
└─ tests/ (fixtures PGlite) ; tests unitaires colocalisés `*.test.ts`
```

---

### Task 1: Squelette du projet (Next 16 + Tailwind 4 + Vitest)

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.env.example`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx` (temporaire), `lib/result.ts`, `lib/result.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `type Result<T> = { ok: true; data: T } | { ok: false; error: string }` ; `settle<T>(p: Promise<T>): Promise<Result<T>>` ; `errorMessage(e: unknown): string`

Le dossier `noesis-pulse/` existe déjà (git initialisé, `docs/`, `.gitignore`). Ne pas lancer `create-next-app` (il refuse un dossier non vide) : créer les fichiers à la main.

- [ ] **Step 1: Créer `package.json`**

```json
{
  "name": "noesis-pulse",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3020",
    "build": "next build",
    "start": "next start -p 3020",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Installer les dépendances**

Run:
```bash
npm install next@16.3.5 react@19.2.8 react-dom@19.2.8 @supabase/supabase-js @supabase/ssr recharts
npm install -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss eslint eslint-config-next@16.3.5 vitest @electric-sql/pglite
```
Expected: installation sans erreur.

- [ ] **Step 3: Fichiers de config**

`tsconfig.json` :
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts` :
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

`postcss.config.mjs` :
```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

`eslint.config.mjs` :
```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".superpowers/**"]),
]);
```

`vitest.config.ts` :
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: { environment: "node", include: ["**/*.test.ts"], exclude: ["node_modules/**", ".next/**"] },
});
```

`.gitignore` (remplacer le contenu) :
```
.superpowers/
node_modules/
.next/
.env*.local
.vercel/
next-env.d.ts
*.tsbuildinfo
```

`.env.example` :
```bash
# --- Noesis (lecture seule, via Supabase Management API) ---
NOESIS_PROJECT_REF=            # ref du projet Supabase de Noesis (ex: abcdefghijklmnop)
SUPABASE_MANAGEMENT_TOKEN=     # jeton d'accès personnel Supabase (Account > Access Tokens) — accès TOTAL au compte, serveur uniquement
NOESIS_DB_LIMIT_MB=500
NOESIS_STORAGE_LIMIT_MB=1024

# --- Groq (clé de Noesis : les sondes consomment ~72 requêtes/jour de son quota) ---
GROQ_API_KEY=

# --- Base Pulse (projet Supabase séparé) ---
NEXT_PUBLIC_PULSE_SUPABASE_URL=
NEXT_PUBLIC_PULSE_SUPABASE_ANON_KEY=
PULSE_SUPABASE_SERVICE_ROLE_KEY=

# --- Accès ---
ALLOWED_EMAIL=                 # seul email autorisé à se connecter
CRON_SECRET=                   # secret partagé avec pg_cron (openssl rand -hex 32)

# --- Telegram ---
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# --- Dev uniquement : données fictives, pas d'auth, aucune clé requise ---
PULSE_DEMO=1
```

- [ ] **Step 4: Layout et styles de base**

`app/globals.css` :
```css
@import "tailwindcss";

@theme {
  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --color-canvas: #f3f0ff;
  --color-ink: #1a1033;
  --color-violet: #7c3aed;
  --color-rose: #db2777;
  --color-sun: #fde68a;
  --color-mint: #a7f3d0;
  --color-sky: #bfdbfe;
  --color-blush: #fbcfe8;
  --color-ok: #4ade80;
  --color-warn: #fbbf24;
  --color-bad: #f87171;
}

html,
body {
  min-height: 100%;
}

body {
  background: var(--color-canvas);
  color: var(--color-ink);
  font-family: var(--font-sans);
}

@keyframes pulse-dot {
  50% {
    opacity: 0.3;
  }
}

.pulse-dot {
  animation: pulse-dot 1.4s infinite;
}

@media (prefers-reduced-motion: reduce) {
  .pulse-dot {
    animation: none;
  }
}
```

`app/layout.tsx` :
```tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Noesis Pulse",
  description: "Suivi en direct de Noesis : activité, utilisateurs, IA et APIs.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geist.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx` (temporaire, remplacé en Task 16) :
```tsx
export default function Page() {
  return <main className="p-8 text-2xl font-bold">Noesis Pulse</main>;
}
```

- [ ] **Step 5: Écrire le test de `lib/result.ts`**

`lib/result.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { errorMessage, settle } from "./result";

describe("settle", () => {
  it("enveloppe une valeur résolue", async () => {
    expect(await settle(Promise.resolve(42))).toEqual({ ok: true, data: 42 });
  });
  it("enveloppe une erreur sans la propager", async () => {
    expect(await settle(Promise.reject(new Error("boom")))).toEqual({ ok: false, error: "boom" });
  });
});

describe("errorMessage", () => {
  it("gère les non-Error", () => {
    expect(errorMessage("x")).toBe("x");
    expect(errorMessage(null)).toBe("Erreur inconnue");
  });
});
```

- [ ] **Step 6: Lancer le test (doit échouer)**

Run: `npx vitest run lib/result.test.ts`
Expected: FAIL (`Cannot find module './result'`).

- [ ] **Step 7: Implémenter `lib/result.ts`**

```ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Erreur inconnue";
}

/** Ne rejette jamais : transforme une promesse en Result (une tuile KO ne casse pas la page). */
export async function settle<T>(p: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await p };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
```

- [ ] **Step 8: Vérifier tests, types, build**

Run: `npm test && npm run typecheck && npm run build`
Expected: tests PASS, typecheck OK, build OK.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: squelette Next 16 + Tailwind 4 + Vitest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Types partagés, env, formatage, temps, périodes, stats

**Files:**
- Create: `lib/types.ts`, `lib/env.ts`, `lib/format.ts`, `lib/time.ts`, `lib/period.ts`, `lib/stats.ts`
- Test: `lib/format.test.ts`, `lib/time.test.ts`, `lib/period.test.ts`, `lib/stats.test.ts`

**Interfaces:**
- Produces (types, `lib/types.ts`) — utilisés partout ensuite :
```ts
export type Period = "24h" | "7d" | "30d";
export type FeatureKey = "chat" | "debates" | "challenges" | "documents";
export type ByFeature = Record<FeatureKey, number>;
export type GroqApiCheck = { ok: boolean; latencyMs: number | null; error?: string };
export type GroqModelProbe = {
  ok: boolean; latencyMs: number | null;
  remainingRequests: number | null; limitRequests: number | null;
  remainingTokens: number | null; limitTokens: number | null;
  error?: string; probedAt: string;
};
export type GroqStatus = { api: GroqApiCheck; models: Record<string, GroqModelProbe | null> };
export type SupabaseUsage = {
  apiRequests24h: number | null; dbBytes: number; dbLimitBytes: number;
  storageBytes: number; storageLimitBytes: number;
};
export type Snapshot = {
  id?: number; taken_at: string; online: number | null; ai_requests_5m: number | null;
  by_feature: ByFeature | null; groq: GroqStatus | null; supabase: SupabaseUsage | null;
  errors: Record<string, string> | null;
};
export type RuleKey = "groq_down" | "groq_slow" | "groq_quota" | "supabase_db" | "supabase_storage" | "activity_drop" | "collector_stale";
export type AlertRule = { key: RuleKey; enabled: boolean; threshold: number; params: Record<string, number> };
export type Alert = { id: number; rule_key: RuleKey; opened_at: string; resolved_at: string | null; message: string };
export const MODELS = { primary: "openai/gpt-oss-120b", fallback: "openai/gpt-oss-20b" } as const;
export const PROBE_INTERVAL_MIN: Record<string, number> = { [MODELS.primary]: 30, [MODELS.fallback]: 60 };
```
- Produces (`lib/env.ts`): `env` (getters qui lèvent si manquant), `isDemo(): boolean`, `limits(): { dbLimitBytes: number; storageLimitBytes: number }`
- Produces (`lib/format.ts`): `formatInt(n: number): string`, `formatBytes(b: number): string`, `formatPct(x: number): string` (x ∈ [0,1]), `maskEmail(e: string): string`, `timeAgo(iso: string, now?: Date): string`, `formatParis(iso: string, opts: Intl.DateTimeFormatOptions): string`
- Produces (`lib/time.ts`): `parisHour(d: Date): number`, `parisDayBounds(now: Date, offsetDays: number): { from: Date; to: Date }`
- Produces (`lib/period.ts`): `PERIODS: Period[]`, `parsePeriod(v: unknown): Period`, `periodRange(p: Period, now: Date): { from: Date; to: Date; prevFrom: Date; hours: number; bucket: "hour" | "day"; label: string }`
- Produces (`lib/stats.ts`): `pctChange(cur: number, prev: number): number | null`, `perHour(count: number, hours: number): number`, `peak(snaps: Pick<Snapshot,"taken_at"|"online">[]): { value: number; at: string } | null`, `availability(values: (boolean | null | undefined)[]): number | null`

- [ ] **Step 1: Écrire `lib/types.ts`** (contenu exact du bloc Interfaces ci-dessus, avec `export` sur chaque déclaration).

- [ ] **Step 2: Écrire `lib/env.ts`**

```ts
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const env = {
  get noesisRef() { return required("NOESIS_PROJECT_REF"); },
  get managementToken() { return required("SUPABASE_MANAGEMENT_TOKEN"); },
  get groqKey() { return required("GROQ_API_KEY"); },
  get pulseUrl() { return required("NEXT_PUBLIC_PULSE_SUPABASE_URL"); },
  get pulseAnonKey() { return required("NEXT_PUBLIC_PULSE_SUPABASE_ANON_KEY"); },
  get pulseServiceKey() { return required("PULSE_SUPABASE_SERVICE_ROLE_KEY"); },
  get allowedEmail() { return required("ALLOWED_EMAIL"); },
  get cronSecret() { return required("CRON_SECRET"); },
  get telegramToken() { return required("TELEGRAM_BOT_TOKEN"); },
  get telegramChatId() { return required("TELEGRAM_CHAT_ID"); },
};

/** Données fictives : uniquement en local, jamais en production. */
export function isDemo(): boolean {
  return process.env.PULSE_DEMO === "1" && process.env.NODE_ENV !== "production";
}

const MB = 1024 * 1024;

export function limits(): { dbLimitBytes: number; storageLimitBytes: number } {
  return {
    dbLimitBytes: Number(process.env.NOESIS_DB_LIMIT_MB || 500) * MB,
    storageLimitBytes: Number(process.env.NOESIS_STORAGE_LIMIT_MB || 1024) * MB,
  };
}
```

- [ ] **Step 3: Écrire les tests**

`lib/format.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { formatBytes, formatInt, formatPct, maskEmail, timeAgo } from "./format";

describe("format", () => {
  it("formatInt utilise l'espace fine française", () => {
    expect(formatInt(1204).replace(/\s/g, " ")).toBe("1 204");
  });
  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(212 * 1024 * 1024)).toBe("212 Mo");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1,5 Go");
  });
  it("formatPct", () => {
    expect(formatPct(0.643)).toBe("64 %");
  });
  it("maskEmail garde 3 caractères et le domaine", () => {
    expect(maskEmail("lea.martin@gmail.com")).toBe("lea…@gmail.com");
    expect(maskEmail("ab@x.fr")).toBe("ab…@x.fr");
    expect(maskEmail("pas-un-email")).toBe("pas…");
  });
  it("timeAgo", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(timeAgo("2026-09-30T11:59:40Z", now)).toBe("à l'instant");
    expect(timeAgo("2026-09-30T11:57:00Z", now)).toBe("il y a 3 min");
    expect(timeAgo("2026-09-30T09:00:00Z", now)).toBe("il y a 3 h");
    expect(timeAgo("2026-09-28T12:00:00Z", now)).toBe("il y a 2 j");
  });
});
```

`lib/time.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { parisDayBounds, parisHour } from "./time";

describe("time", () => {
  it("parisHour en heure d'été (UTC+2)", () => {
    expect(parisHour(new Date("2026-09-30T06:30:00Z"))).toBe(8);
  });
  it("parisHour en heure d'hiver (UTC+1)", () => {
    expect(parisHour(new Date("2026-12-01T07:30:00Z"))).toBe(8);
  });
  it("parisDayBounds(now, -1) = la veille à Paris", () => {
    const { from, to } = parisDayBounds(new Date("2026-09-30T06:00:00Z"), -1);
    expect(from.toISOString()).toBe("2026-09-28T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-29T22:00:00.000Z");
  });
  it("parisDayBounds gère le passage à l'heure d'hiver (journée de 25 h)", () => {
    const { from, to } = parisDayBounds(new Date("2026-10-26T10:00:00Z"), -1);
    expect(from.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});
```

`lib/period.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { parsePeriod, periodRange } from "./period";

describe("period", () => {
  it("parsePeriod retombe sur 24h", () => {
    expect(parsePeriod("7d")).toBe("7d");
    expect(parsePeriod("n'importe")).toBe("24h");
    expect(parsePeriod(undefined)).toBe("24h");
  });
  it("periodRange 7d", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    const r = periodRange("7d", now);
    expect(r.hours).toBe(168);
    expect(r.bucket).toBe("hour");
    expect(r.from.toISOString()).toBe("2026-09-23T12:00:00.000Z");
    expect(r.prevFrom.toISOString()).toBe("2026-09-16T12:00:00.000Z");
    expect(r.to).toEqual(now);
  });
  it("30d utilise des tranches journalières", () => {
    expect(periodRange("30d", new Date()).bucket).toBe("day");
  });
});
```

`lib/stats.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { availability, pctChange, peak, perHour } from "./stats";

describe("stats", () => {
  it("pctChange", () => {
    expect(pctChange(112, 100)).toBeCloseTo(0.12);
    expect(pctChange(5, 0)).toBeNull();
  });
  it("perHour arrondit", () => {
    expect(perHour(3412, 24)).toBe(142);
  });
  it("peak ignore les null", () => {
    expect(
      peak([
        { taken_at: "a", online: 3 },
        { taken_at: "b", online: null },
        { taken_at: "c", online: 27 },
      ]),
    ).toEqual({ value: 27, at: "c" });
    expect(peak([])).toBeNull();
  });
  it("availability ne compte que les valeurs connues", () => {
    expect(availability([true, true, false, null, undefined])).toBeCloseTo(2 / 3);
    expect(availability([null])).toBeNull();
  });
});
```

- [ ] **Step 4: Lancer les tests (doivent échouer)**

Run: `npx vitest run lib/format.test.ts lib/time.test.ts lib/period.test.ts lib/stats.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 5: Implémenter**

`lib/format.ts` :
```ts
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
```

`lib/time.ts` :
```ts
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
```

`lib/period.ts` :
```ts
import type { Period } from "./types";

export const PERIODS: Period[] = ["24h", "7d", "30d"];

const CONF: Record<Period, { hours: number; bucket: "hour" | "day"; label: string }> = {
  "24h": { hours: 24, bucket: "hour", label: "24 h" },
  "7d": { hours: 168, bucket: "hour", label: "7 jours" },
  "30d": { hours: 720, bucket: "day", label: "30 jours" },
};

export function parsePeriod(v: unknown): Period {
  return typeof v === "string" && (PERIODS as string[]).includes(v) ? (v as Period) : "24h";
}

export function periodRange(p: Period, now: Date) {
  const { hours, bucket, label } = CONF[p];
  const ms = hours * 3600_000;
  return {
    from: new Date(now.getTime() - ms),
    to: now,
    prevFrom: new Date(now.getTime() - 2 * ms),
    hours,
    bucket,
    label,
  };
}
```

`lib/stats.ts` :
```ts
import type { Snapshot } from "./types";

export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return (cur - prev) / prev;
}

export function perHour(count: number, hours: number): number {
  return Math.round(count / hours);
}

export function peak(snaps: Pick<Snapshot, "taken_at" | "online">[]): { value: number; at: string } | null {
  let best: { value: number; at: string } | null = null;
  for (const s of snaps) {
    if (s.online == null) continue;
    if (!best || s.online > best.value) best = { value: s.online, at: s.taken_at };
  }
  return best;
}

export function availability(values: (boolean | null | undefined)[]): number | null {
  const known = values.filter((v): v is boolean => typeof v === "boolean");
  if (known.length === 0) return null;
  return known.filter(Boolean).length / known.length;
}
```

- [ ] **Step 6: Lancer les tests**

Run: `npx vitest run lib/`
Expected: PASS (tous). Si `formatInt` renvoie une espace insécable fine (U+202F), le test la normalise déjà.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: types partagés, env, formatage, fuseau Paris, périodes, stats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Garde SQL lecture seule + littéraux sûrs

**Files:**
- Create: `lib/noesis/sql.ts`
- Test: `lib/noesis/sql.test.ts`

**Interfaces:**
- Produces: `assertReadOnly(sql: string): void` (lève `Error("Requête refusée : …")`), `lit.ts(d: Date): string` → `'2026-09-30T12:00:00.000Z'::timestamptz`, `lit.uuid(s: string): string` → `'…'::uuid` (lève si invalide), `lit.int(n: number): string` (lève si non entier), `isUuid(s: string): boolean`

La Management API ne prend pas de paramètres liés : toute valeur injectée dans le SQL passe par `lit.*`, qui valide strictement.

- [ ] **Step 1: Écrire le test**

```ts
import { describe, expect, it } from "vitest";
import { assertReadOnly, isUuid, lit } from "./sql";

describe("assertReadOnly", () => {
  it.each([
    "select 1",
    "  SELECT count(*) FROM public.messages",
    "with a as (select 1) select * from a",
    "select 1;",
    "select 'updated_at' as col",
  ])("accepte %s", (sql) => {
    expect(() => assertReadOnly(sql)).not.toThrow();
  });

  it.each([
    "delete from public.messages",
    "update auth.users set email = 'x'",
    "select 1; drop table public.messages",
    "with x as (delete from public.messages returning *) select * from x",
    "insert into a values (1)",
    "select pg_terminate_backend(1)",
    "create table x(id int)",
    "grant all on a to b",
    "copy a to '/tmp/x'",
    "",
  ])("refuse %s", (sql) => {
    expect(() => assertReadOnly(sql)).toThrow(/Requête refusée/);
  });
});

describe("lit", () => {
  it("ts", () => {
    expect(lit.ts(new Date("2026-09-30T12:00:00Z"))).toBe("'2026-09-30T12:00:00.000Z'::timestamptz");
  });
  it("uuid valide / invalide", () => {
    const id = "3f2b8c1e-9a4d-4c6e-8b1f-2a3c4d5e6f70";
    expect(isUuid(id)).toBe(true);
    expect(lit.uuid(id)).toBe(`'${id}'::uuid`);
    expect(() => lit.uuid("x'; drop table a; --")).toThrow();
  });
  it("int", () => {
    expect(lit.int(5)).toBe("5");
    expect(() => lit.int(1.5)).toThrow();
    expect(() => lit.int(Number.NaN)).toThrow();
  });
});
```

- [ ] **Step 2: Lancer (doit échouer)**

Run: `npx vitest run lib/noesis/sql.test.ts` → FAIL (module introuvable).

- [ ] **Step 3: Implémenter `lib/noesis/sql.ts`**

```ts
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
```

Note : le mot-clé `set` est interdit ; aucune requête de ce plan n'en a besoin (pas de `UPDATE … SET`, pas de `SET LOCAL`). Les noms de colonnes contenant ces mots (`updated_at`, `created_at`) ne déclenchent pas la garde grâce aux `\b` (`updated_at` ≠ `update`).

- [ ] **Step 4: Lancer les tests** → `npx vitest run lib/noesis/sql.test.ts` : PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(noesis): garde SQL lecture seule et littéraux validés

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client Noesis (Supabase Management API)

**Files:**
- Create: `lib/noesis/client.ts`
- Test: `lib/noesis/client.test.ts`

**Interfaces:**
- Consumes: `assertReadOnly` (Task 3), `env.noesisRef`, `env.managementToken` (Task 2)
- Produces: `runNoesisSql<T = Record<string, unknown>>(sql: string, opts?: { fetchImpl?: typeof fetch; ref?: string; token?: string; timeoutMs?: number }): Promise<T[]>` ; `MANAGEMENT_API = "https://api.supabase.com"`

Endpoint : `POST https://api.supabase.com/v1/projects/{ref}/database/query`, corps `{ "query": "...", "read_only": true }`, en-tête `Authorization: Bearer <PAT>`. Réponse : tableau JSON de lignes. `read_only: true` est une ceinture supplémentaire (exécution dans une transaction en lecture seule côté Supabase) ; la garde locale reste obligatoire. Vérifier dans la doc de l'API (https://api.supabase.com/api/v1) que `read_only` est accepté ; s'il provoque une erreur 400, le retirer (la garde locale suffit) et le noter dans le commit.

- [ ] **Step 1: Écrire le test**

```ts
import { describe, expect, it, vi } from "vitest";
import { runNoesisSql } from "./client";

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("runNoesisSql", () => {
  it("envoie la requête en lecture seule et renvoie les lignes", async () => {
    const f = fakeFetch(201, [{ n: 3 }]);
    const rows = await runNoesisSql<{ n: number }>("select 3 as n", { fetchImpl: f, ref: "abc", token: "t" });
    expect(rows).toEqual([{ n: 3 }]);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.supabase.com/v1/projects/abc/database/query");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer t");
    expect(JSON.parse(init.body)).toEqual({ query: "select 3 as n", read_only: true });
  });

  it("refuse une requête d'écriture sans appeler l'API", async () => {
    const f = fakeFetch(201, []);
    await expect(runNoesisSql("delete from x", { fetchImpl: f, ref: "a", token: "t" })).rejects.toThrow(/Requête refusée/);
    expect(f).not.toHaveBeenCalled();
  });

  it("remonte une erreur HTTP lisible sans le jeton", async () => {
    const f = fakeFetch(401, { message: "Unauthorized" });
    await expect(runNoesisSql("select 1", { fetchImpl: f, ref: "a", token: "secret-token" })).rejects.toThrow(
      /Management API 401/,
    );
    await expect(runNoesisSql("select 1", { fetchImpl: f, ref: "a", token: "secret-token" })).rejects.not.toThrow(
      /secret-token/,
    );
  });
});
```

- [ ] **Step 2: Lancer (doit échouer)** → `npx vitest run lib/noesis/client.test.ts` : FAIL.

- [ ] **Step 3: Implémenter `lib/noesis/client.ts`**

```ts
import { env } from "@/lib/env";
import { assertReadOnly } from "./sql";

export const MANAGEMENT_API = "https://api.supabase.com";

type Opts = { fetchImpl?: typeof fetch; ref?: string; token?: string; timeoutMs?: number };

/** Seul point d'accès à la base Noesis. SELECT uniquement. */
export async function runNoesisSql<T = Record<string, unknown>>(sql: string, opts: Opts = {}): Promise<T[]> {
  assertReadOnly(sql);
  const f = opts.fetchImpl ?? fetch;
  const ref = opts.ref ?? env.noesisRef;
  const token = opts.token ?? env.managementToken;
  const res = await f(`${MANAGEMENT_API}/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, read_only: true }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { message?: string };
      detail = j.message ? ` : ${j.message}` : "";
    } catch {
      /* corps non JSON */
    }
    throw new Error(`Management API ${res.status}${detail}`);
  }
  return (await res.json()) as T[];
}
```

- [ ] **Step 4: Tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(noesis): client SQL lecture seule via Management API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Requêtes SQL Noesis + tests sur PGlite

**Files:**
- Create: `lib/noesis/queries.ts`, `tests/noesis-fixture.ts`
- Test: `lib/noesis/queries.test.ts`

**Interfaces:**
- Consumes: `lit`, `assertReadOnly` (Task 3), types (Task 2)
- Produces (chaque fonction `xxxSql(...)` renvoie une chaîne SQL ; chaque `mapXxx(rows)` renvoie un objet typé) :
```ts
export type CollectRow = { online: number; ai5m: number; byFeature5m: ByFeature; ai2h: number; ai2hLastWeek: number; dbBytes: number; storageBytes: number };
export function collectSql(): string;
export function mapCollect(rows: Record<string, unknown>[]): CollectRow;

export type Kpis = { aiCount: number; aiPrev: number; usersTotal: number; usersNew: number; activePeriod: number; active7d: number; docErrors: number };
export function kpiSql(from: Date, prevFrom: Date): string;
export function mapKpis(rows: Record<string, unknown>[]): Kpis;

export type SeriesPoint = { t: string; n: number };
export function aiSeriesSql(from: Date, to: Date, bucket: "hour" | "day"): string;
export function mapSeries(rows: Record<string, unknown>[]): SeriesPoint[];

export type FeatureCount = { feature: FeatureKey; mode: string | null; n: number };
export function byFeatureSql(from: Date): string;
export function mapByFeature(rows: Record<string, unknown>[]): FeatureCount[];

export type Signup = { id: string; email: string; createdAt: string };
export function latestSignupsSql(limit: number): string;
export function mapSignups(rows: Record<string, unknown>[]): Signup[];

export type UserRow = { id: string; email: string; createdAt: string; lastSignInAt: string | null; lastActivity: string | null; aiRequests: number; features: FeatureKey[] };
export function usersListSql(): string;
export function mapUsers(rows: Record<string, unknown>[]): UserRow[];

export type UserDetail = { user: UserRow; documents: number; daily: { day: string; actions: number; ai: number }[]; features: { feature: FeatureKey; n: number }[]; skills: { skill: string; avg: number; n: number }[] };
export function userDetailSql(id: string): string;   // une seule requête renvoyant une ligne JSON
export function mapUserDetail(rows: Record<string, unknown>[]): UserDetail | null;
```

Les requêtes n'utilisent **jamais** `content`, `question`, `goal`, `topic`. Les nombres `bigint` sont castés en `::float8`/`::int` pour arriver en JSON numérique ; les mappers appliquent quand même `Number()`.

- [ ] **Step 1: Écrire la fixture PGlite `tests/noesis-fixture.ts`**

Reproduit le strict minimum du schéma Noesis (colonnes utilisées uniquement) pour exécuter les vraies requêtes.

```ts
import { PGlite } from "@electric-sql/pglite";

export const U1 = "11111111-1111-4111-8111-111111111111";
export const U2 = "22222222-2222-4222-8222-222222222222";
export const U3 = "33333333-3333-4333-8333-333333333333";

export async function makeNoesisDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now(), last_sign_in_at timestamptz);
    create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid, created_at timestamptz default now(), updated_at timestamptz default now(), refreshed_at timestamp);
    create table storage.objects (id uuid primary key default gen_random_uuid(), metadata jsonb);
    create table public.conversations (id uuid primary key default gen_random_uuid(), user_id uuid, mode text, created_at timestamptz default now());
    create table public.messages (id uuid primary key default gen_random_uuid(), conversation_id uuid, user_id uuid, role text, content text, created_at timestamptz default now());
    create table public.debate_turns (id uuid primary key default gen_random_uuid(), user_id uuid, role text, content text, created_at timestamptz default now());
    create table public.challenge_turns (id uuid primary key default gen_random_uuid(), user_id uuid, role text, content text, created_at timestamptz default now());
    create table public.documents (id uuid primary key default gen_random_uuid(), user_id uuid, status text default 'ready', created_at timestamptz default now());
    create table public.skill_events (id uuid primary key default gen_random_uuid(), user_id uuid, skill text, score int, created_at timestamptz default now());

    insert into auth.users values
      ('${U1}', 'lea@ex.fr', now() - interval '40 days', now() - interval '1 hour'),
      ('${U2}', 'tom@ex.fr', now() - interval '2 hours', now() - interval '2 hours'),
      ('${U3}', 'ines@ex.fr', now() - interval '10 days', null);

    -- U1 : actif maintenant en chat (mode 'coach')
    insert into public.conversations (id, user_id, mode) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${U1}', 'coach');
    insert into public.messages (conversation_id, user_id, role, content, created_at) values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${U1}', 'user', 'x', now() - interval '1 minute'),
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${U1}', 'assistant', 'x', now() - interval '1 minute'),
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${U1}', 'assistant', 'x', now() - interval '3 hours'),
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${U1}', 'assistant', 'x', now() - interval '7 days 1 hour');

    -- U2 : débat il y a 1 h, défi il y a 30 h
    insert into public.debate_turns (user_id, role, content, created_at) values
      ('${U2}', 'user', 'x', now() - interval '1 hour'),
      ('${U2}', 'assistant', 'x', now() - interval '1 hour');
    insert into public.challenge_turns (user_id, role, content, created_at) values
      ('${U2}', 'assistant', 'x', now() - interval '30 hours');

    -- U3 : session rafraîchie il y a 2 min (compte comme en ligne), un document en erreur
    insert into auth.sessions (user_id, refreshed_at) values ('${U3}', (now() - interval '2 minutes') at time zone 'utc');
    insert into public.documents (user_id, status, created_at) values ('${U3}', 'error', now() - interval '3 days');

    insert into public.skill_events (user_id, skill, score) values ('${U1}', 'logique', 80), ('${U1}', 'logique', 60);
    insert into storage.objects (metadata) values ('{"size": 1000}'), ('{"size": 500}');
  `);
  return db;
}

export async function query(db: PGlite, sql: string): Promise<Record<string, unknown>[]> {
  const res = await db.query<Record<string, unknown>>(sql);
  return res.rows;
}
```

- [ ] **Step 2: Écrire les tests `lib/noesis/queries.test.ts`**

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeNoesisDb, query, U1, U2, U3 } from "@/tests/noesis-fixture";
import { assertReadOnly } from "./sql";
import * as q from "./queries";

let db: PGlite;
beforeAll(async () => {
  db = await makeNoesisDb();
});

const now = () => new Date();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

describe("toutes les requêtes passent la garde lecture seule", () => {
  it.each([
    q.collectSql(),
    q.kpiSql(hoursAgo(24), hoursAgo(48)),
    q.aiSeriesSql(hoursAgo(24), now(), "hour"),
    q.byFeatureSql(hoursAgo(24)),
    q.latestSignupsSql(5),
    q.usersListSql(),
    q.userDetailSql(U1),
  ])("%#", (sql) => {
    expect(() => assertReadOnly(sql)).not.toThrow();
    expect(sql).not.toMatch(/\b(content|question|goal|topic)\b/);
  });
});

describe("collect", () => {
  it("compte en ligne, demandes, fenêtres et tailles", async () => {
    const r = q.mapCollect(await query(db, q.collectSql()));
    expect(r.online).toBe(2); // U1 (message) + U3 (session)
    expect(r.ai5m).toBe(1);
    expect(r.byFeature5m).toEqual({ chat: 1, debates: 0, challenges: 0, documents: 0 });
    expect(r.ai2h).toBe(2); // chat -1 min + débat -1 h
    expect(r.ai2hLastWeek).toBe(1); // chat -7 j 1 h
    expect(r.dbBytes).toBeGreaterThan(0);
    expect(r.storageBytes).toBe(1500);
  });
});

describe("kpis", () => {
  it("24 h", async () => {
    const k = q.mapKpis(await query(db, q.kpiSql(hoursAgo(24), hoursAgo(48))));
    expect(k.aiCount).toBe(3); // -1 min, -1 h, -3 h
    expect(k.aiPrev).toBe(1); // défi -30 h
    expect(k.usersTotal).toBe(3);
    expect(k.usersNew).toBe(1); // U2
    expect(k.activePeriod).toBe(2); // U1, U2
    expect(k.active7d).toBe(3); // U3 via document -3 j
    expect(k.docErrors).toBe(0); // l'erreur date de -3 j, hors 24 h
  });
});

describe("séries et répartition", () => {
  it("aiSeries renvoie 24 ou 25 tranches horaires, total = 3", async () => {
    const s = q.mapSeries(await query(db, q.aiSeriesSql(hoursAgo(24), now(), "hour")));
    expect(s.length).toBeGreaterThanOrEqual(24);
    expect(s.reduce((a, p) => a + p.n, 0)).toBe(3);
  });
  it("byFeature ventile le chat par mode", async () => {
    const f = q.mapByFeature(await query(db, q.byFeatureSql(hoursAgo(24))));
    expect(f).toContainEqual({ feature: "chat", mode: "coach", n: 2 });
    expect(f).toContainEqual({ feature: "debates", mode: null, n: 1 });
  });
});

describe("utilisateurs", () => {
  it("derniers inscrits", async () => {
    const s = q.mapSignups(await query(db, q.latestSignupsSql(2)));
    expect(s.map((x) => x.email)).toEqual(["tom@ex.fr", "ines@ex.fr"]);
  });
  it("liste", async () => {
    const users = q.mapUsers(await query(db, q.usersListSql()));
    const u1 = users.find((u) => u.id === U1)!;
    expect(u1.aiRequests).toBe(3);
    expect(u1.features).toEqual(["chat"]);
    const u2 = users.find((u) => u.id === U2)!;
    expect(u2.features.sort()).toEqual(["debates"]);
    expect(users.find((u) => u.id === U3)!.features).toEqual(["documents"]);
    expect(users[0].id).toBe(U1); // activité la plus récente en premier
  });
  it("fiche", async () => {
    const d = q.mapUserDetail(await query(db, q.userDetailSql(U1)))!;
    expect(d.user.email).toBe("lea@ex.fr");
    expect(d.daily.length).toBe(31);
    expect(d.features).toContainEqual({ feature: "chat", n: 3 });
    expect(d.skills).toEqual([{ skill: "logique", avg: 70, n: 2 }]);
    expect(d.documents).toBe(0);
  });
  it("fiche inconnue → null", async () => {
    expect(q.mapUserDetail(await query(db, q.userDetailSql("44444444-4444-4444-8444-444444444444")))).toBeNull();
  });
});
```

- [ ] **Step 3: Lancer (doit échouer)** → `npx vitest run lib/noesis/queries.test.ts` : FAIL (module `./queries` introuvable).

- [ ] **Step 4: Implémenter `lib/noesis/queries.ts`**

```ts
import type { ByFeature, FeatureKey } from "@/lib/types";
import { lit } from "./sql";

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v == null ? null : String(v));
const iso = (v: unknown) => (v == null ? null : new Date(String(v)).toISOString());

/** Réponses produites par l'IA, toutes fonctionnalités confondues. */
const AI_UNION = `
  select 'chat'::text as feature, m.user_id, m.created_at, m.conversation_id from public.messages m where m.role = 'assistant'
  union all select 'debates', d.user_id, d.created_at, null::uuid from public.debate_turns d where d.role = 'assistant'
  union all select 'challenges', c.user_id, c.created_at, null::uuid from public.challenge_turns c where c.role = 'assistant'`;

/** Actions faites par un utilisateur. */
const ACT_UNION = `
  select 'chat'::text as f, user_id, created_at from public.messages where role = 'user'
  union all select 'debates', user_id, created_at from public.debate_turns where role = 'user'
  union all select 'challenges', user_id, created_at from public.challenge_turns where role = 'user'
  union all select 'documents', user_id, created_at from public.documents`;

// ---------- Relevé (toutes les 5 min) ----------

export type CollectRow = {
  online: number; ai5m: number; byFeature5m: ByFeature; ai2h: number; ai2hLastWeek: number; dbBytes: number; storageBytes: number;
};

export function collectSql(): string {
  return `
with ai as (select feature, created_at from (${AI_UNION}) x where created_at > now() - interval '8 days'),
act as (
  select user_id from (${ACT_UNION}) a where created_at > now() - interval '5 minutes'
  union all
  select user_id from auth.sessions
  where coalesce(refreshed_at at time zone 'utc', updated_at) > now() - interval '5 minutes'
)
select
  (select count(distinct user_id) from act)::int as online,
  (select count(*) from ai where created_at > now() - interval '5 minutes')::int as ai_5m,
  (select count(*) from ai where feature = 'chat' and created_at > now() - interval '5 minutes')::int as chat_5m,
  (select count(*) from ai where feature = 'debates' and created_at > now() - interval '5 minutes')::int as debates_5m,
  (select count(*) from ai where feature = 'challenges' and created_at > now() - interval '5 minutes')::int as challenges_5m,
  (select count(*) from public.documents where created_at > now() - interval '5 minutes')::int as documents_5m,
  (select count(*) from ai where created_at > now() - interval '2 hours')::int as ai_2h,
  (select count(*) from ai where created_at > now() - interval '7 days 2 hours' and created_at <= now() - interval '7 days')::int as ai_2h_last_week,
  pg_database_size(current_database())::float8 as db_bytes,
  (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects)::float8 as storage_bytes`;
}

export function mapCollect(rows: Row[]): CollectRow {
  const r = rows[0] ?? {};
  return {
    online: num(r.online),
    ai5m: num(r.ai_5m),
    byFeature5m: {
      chat: num(r.chat_5m), debates: num(r.debates_5m), challenges: num(r.challenges_5m), documents: num(r.documents_5m),
    },
    ai2h: num(r.ai_2h),
    ai2hLastWeek: num(r.ai_2h_last_week),
    dbBytes: num(r.db_bytes),
    storageBytes: num(r.storage_bytes),
  };
}

// ---------- KPIs d'une période ----------

export type Kpis = { aiCount: number; aiPrev: number; usersTotal: number; usersNew: number; activePeriod: number; active7d: number; docErrors: number };

export function kpiSql(from: Date, prevFrom: Date): string {
  const f = lit.ts(from);
  const pf = lit.ts(prevFrom);
  return `
with ai as (select created_at from (${AI_UNION}) x where created_at > ${pf}),
act as (select user_id, created_at from (${ACT_UNION}) a where created_at > least(${f}, now() - interval '7 days'))
select
  (select count(*) from ai where created_at > ${f})::int as ai_count,
  (select count(*) from ai where created_at <= ${f})::int as ai_prev,
  (select count(*) from auth.users)::int as users_total,
  (select count(*) from auth.users where created_at > ${f})::int as users_new,
  (select count(distinct user_id) from act where created_at > ${f})::int as active_period,
  (select count(distinct user_id) from act where created_at > now() - interval '7 days')::int as active_7d,
  (select count(*) from public.documents where status = 'error' and created_at > ${f})::int as doc_errors`;
}

export function mapKpis(rows: Row[]): Kpis {
  const r = rows[0] ?? {};
  return {
    aiCount: num(r.ai_count), aiPrev: num(r.ai_prev), usersTotal: num(r.users_total), usersNew: num(r.users_new),
    activePeriod: num(r.active_period), active7d: num(r.active_7d), docErrors: num(r.doc_errors),
  };
}

// ---------- Série de demandes IA ----------

export type SeriesPoint = { t: string; n: number };

export function aiSeriesSql(from: Date, to: Date, bucket: "hour" | "day"): string {
  const step = bucket === "hour" ? "1 hour" : "1 day";
  return `
with b as (
  select generate_series(date_trunc('${bucket}', ${lit.ts(from)}), date_trunc('${bucket}', ${lit.ts(to)}), interval '${step}') as t
),
ai as (select date_trunc('${bucket}', created_at) as t from (${AI_UNION}) x where created_at > ${lit.ts(from)})
select b.t, count(ai.t)::int as n from b left join ai on ai.t = b.t group by b.t order by b.t`;
}

export function mapSeries(rows: Row[]): { t: string; n: number }[] {
  return rows.map((r) => ({ t: iso(r.t)!, n: num(r.n) }));
}

// ---------- Répartition par fonctionnalité ----------

export type FeatureCount = { feature: FeatureKey; mode: string | null; n: number };

export function byFeatureSql(from: Date): string {
  const f = lit.ts(from);
  return `
select x.feature, c.mode::text as mode, count(*)::int as n
from (${AI_UNION}) x left join public.conversations c on c.id = x.conversation_id
where x.created_at > ${f}
group by x.feature, c.mode
union all
select 'documents', null, count(*)::int from public.documents where created_at > ${f}
order by n desc`;
}

export function mapByFeature(rows: Row[]): FeatureCount[] {
  return rows
    .map((r) => ({ feature: String(r.feature) as FeatureKey, mode: str(r.mode), n: num(r.n) }))
    .filter((r) => r.n > 0);
}

// ---------- Utilisateurs ----------

export type Signup = { id: string; email: string; createdAt: string };

export function latestSignupsSql(limit: number): string {
  return `select id, email, created_at from auth.users order by created_at desc limit ${lit.int(limit)}`;
}

export function mapSignups(rows: Row[]): Signup[] {
  return rows.map((r) => ({ id: String(r.id), email: String(r.email ?? ""), createdAt: iso(r.created_at)! }));
}

export type UserRow = {
  id: string; email: string; createdAt: string; lastSignInAt: string | null; lastActivity: string | null; aiRequests: number; features: FeatureKey[];
};

export function usersListSql(): string {
  return `
with act as (${ACT_UNION}),
ai as (select user_id from (${AI_UNION}) x),
a as (select user_id, max(created_at) as last_activity, array_agg(distinct f) as features from act group by user_id),
i as (select user_id, count(*)::int as n from ai group by user_id)
select u.id, u.email, u.created_at, u.last_sign_in_at, a.last_activity, coalesce(i.n, 0) as ai_requests,
       coalesce(a.features, '{}') as features
from auth.users u
left join a on a.user_id = u.id
left join i on i.user_id = u.id
order by a.last_activity desc nulls last, u.created_at desc
limit 1000`;
}

function mapUser(r: Row): UserRow {
  const feats = Array.isArray(r.features) ? r.features : String(r.features ?? "{}").replace(/[{}]/g, "").split(",").filter(Boolean);
  return {
    id: String(r.id),
    email: String(r.email ?? ""),
    createdAt: iso(r.created_at)!,
    lastSignInAt: iso(r.last_sign_in_at),
    lastActivity: iso(r.last_activity),
    aiRequests: num(r.ai_requests),
    features: (feats as string[]).map((f) => f as FeatureKey),
  };
}

export function mapUsers(rows: Row[]): UserRow[] {
  return rows.map(mapUser);
}

export type UserDetail = {
  user: UserRow; documents: number;
  daily: { day: string; actions: number; ai: number }[];
  features: { feature: FeatureKey; n: number }[];
  skills: { skill: string; avg: number; n: number }[];
};

export function userDetailSql(id: string): string {
  const u = lit.uuid(id);
  return `
with act as (select * from (${ACT_UNION}) a where user_id = ${u}),
ai as (select feature, created_at from (${AI_UNION}) x where user_id = ${u}),
days as (select generate_series(date_trunc('day', now() - interval '30 days'), date_trunc('day', now()), interval '1 day') as d)
select
  u.id, u.email, u.created_at, u.last_sign_in_at,
  (select max(created_at) from act) as last_activity,
  (select count(*) from ai)::int as ai_requests,
  coalesce((select array_agg(distinct f) from act), '{}') as features,
  (select count(*) from public.documents where user_id = ${u})::int as documents,
  (select json_agg(json_build_object(
      'day', days.d,
      'actions', (select count(*) from act where date_trunc('day', act.created_at) = days.d),
      'ai', (select count(*) from ai where date_trunc('day', ai.created_at) = days.d)
    ) order by days.d) from days) as daily,
  (select coalesce(json_agg(json_build_object('feature', feature, 'n', n) order by n desc), '[]')
     from (select feature, count(*)::int as n from ai group by feature) z) as feature_counts,
  (select coalesce(json_agg(json_build_object('skill', skill, 'avg', avg, 'n', n) order by skill), '[]')
     from (select skill, round(avg(score))::int as avg, count(*)::int as n from public.skill_events where user_id = ${u} group by skill) s) as skills
from auth.users u where u.id = ${u}`;
}

function parseJson<T>(v: unknown): T {
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

export function mapUserDetail(rows: Row[]): UserDetail | null {
  const r = rows[0];
  if (!r) return null;
  const daily = parseJson<{ day: string; actions: number; ai: number }[]>(r.daily) ?? [];
  return {
    user: mapUser(r),
    documents: num(r.documents),
    daily: daily.map((d) => ({ day: new Date(d.day).toISOString(), actions: num(d.actions), ai: num(d.ai) })),
    features: parseJson<{ feature: FeatureKey; n: number }[]>(r.feature_counts).map((f) => ({ feature: f.feature, n: num(f.n) })),
    skills: parseJson<{ skill: string; avg: number; n: number }[]>(r.skills).map((s) => ({ skill: s.skill, avg: num(s.avg), n: num(s.n) })),
  };
}
```

Note : `conversations.mode` est un enum Postgres dans Noesis → `c.mode::text`. Dans la fixture c'est déjà du `text`, le cast est sans effet.

- [ ] **Step 5: Lancer les tests** → `npx vitest run lib/noesis/queries.test.ts` : PASS.
Si un test d'horodatage est instable (ex. `aiSeries` 24 vs 25 tranches), c'est attendu : l'assertion utilise `>= 24`. Si `pg_database_size` n'est pas supporté par PGlite, remplacer dans le **test uniquement** l'assertion `dbBytes > 0` par `expect(r.dbBytes).toBeGreaterThanOrEqual(0)` et le signaler dans le commit — ne pas retirer la fonction de la requête.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(noesis): requêtes SQL agrégées + tests sur base PGlite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sources externes — usage Supabase et Groq

**Files:**
- Create: `lib/sources/supabase-usage.ts`, `lib/sources/groq.ts`
- Test: `lib/sources/supabase-usage.test.ts`, `lib/sources/groq.test.ts`

**Interfaces:**
- Consumes: `env`, `MANAGEMENT_API` (Task 4), types `GroqApiCheck`, `GroqModelProbe`, `Snapshot`, `PROBE_INTERVAL_MIN` (Task 2)
- Produces:
  - `fetchApiRequests24h(opts?: { fetchImpl?: typeof fetch; ref?: string; token?: string }): Promise<number>`
  - `checkGroqApi(opts?: { fetchImpl?: typeof fetch; key?: string; now?: () => number }): Promise<GroqApiCheck>` (ne rejette jamais)
  - `probeGroqModel(model: string, opts?: { fetchImpl?: typeof fetch; key?: string; now?: () => number; at?: Date }): Promise<GroqModelProbe>` (ne rejette jamais)
  - `latestProbes(snaps: Snapshot[], models: string[]): Record<string, GroqModelProbe | null>` (snaps dans n'importe quel ordre)
  - `shouldProbe(last: GroqModelProbe | null, intervalMin: number, now: Date): boolean`

Endpoints :
- Supabase : `GET {MANAGEMENT_API}/v1/projects/{ref}/analytics/endpoints/usage.api-counts?interval=1day` → `{ result: [{ timestamp, total_auth_requests, total_rest_requests, total_storage_requests, total_realtime_requests }] }`. On additionne tous les champs `total_*` de toutes les entrées. Si le format réel diffère (vérifier une fois avec un vrai jeton), adapter uniquement `sumApiCounts`.
- Groq API : `GET https://api.groq.com/openai/v1/models` (gratuit, ne consomme pas le quota).
- Groq sonde : `POST https://api.groq.com/openai/v1/chat/completions` avec `{ model, messages: [{ role: "user", content: "ping" }], max_completion_tokens: 16, reasoning_effort: "low" }`. En-têtes lus : `x-ratelimit-limit-requests` / `x-ratelimit-remaining-requests` (requêtes **par jour**), `x-ratelimit-limit-tokens` / `x-ratelimit-remaining-tokens` (tokens **par minute**).

- [ ] **Step 1: Écrire les tests**

`lib/sources/supabase-usage.test.ts` :
```ts
import { describe, expect, it, vi } from "vitest";
import { fetchApiRequests24h, sumApiCounts } from "./supabase-usage";

describe("usage Supabase", () => {
  it("additionne tous les compteurs", () => {
    expect(
      sumApiCounts({
        result: [
          { timestamp: "x", total_auth_requests: 10, total_rest_requests: 100, total_storage_requests: 5, total_realtime_requests: 1 },
          { timestamp: "y", total_rest_requests: 4 },
        ],
      }),
    ).toBe(120);
  });
  it("appelle le bon endpoint", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ result: [{ total_rest_requests: 7 }] }), { status: 200 }));
    expect(await fetchApiRequests24h({ fetchImpl: f as unknown as typeof fetch, ref: "abc", token: "t" })).toBe(7);
    expect(f.mock.calls[0][0]).toBe("https://api.supabase.com/v1/projects/abc/analytics/endpoints/usage.api-counts?interval=1day");
  });
  it("lève sur erreur HTTP", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 500 }));
    await expect(fetchApiRequests24h({ fetchImpl: f as unknown as typeof fetch, ref: "a", token: "t" })).rejects.toThrow(/500/);
  });
});
```

`lib/sources/groq.test.ts` :
```ts
import { describe, expect, it, vi } from "vitest";
import type { GroqModelProbe, Snapshot } from "@/lib/types";
import { checkGroqApi, latestProbes, probeGroqModel, shouldProbe } from "./groq";

const clock = () => {
  let t = 1000;
  return () => (t += 250);
};

describe("checkGroqApi", () => {
  it("ok + latence", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    const r = await checkGroqApi({ fetchImpl: f as unknown as typeof fetch, key: "k", now: clock() });
    expect(r).toEqual({ ok: true, latencyMs: 250 });
    expect(f.mock.calls[0][0]).toBe("https://api.groq.com/openai/v1/models");
  });
  it("ne rejette pas en cas d'erreur réseau", async () => {
    const f = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const r = await checkGroqApi({ fetchImpl: f as unknown as typeof fetch, key: "k", now: clock() });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ECONNRESET/);
  });
});

describe("probeGroqModel", () => {
  it("lit les en-têtes de quota", async () => {
    const f = vi.fn(
      async () =>
        new Response("{}", {
          status: 200,
          headers: {
            "x-ratelimit-limit-requests": "1000",
            "x-ratelimit-remaining-requests": "360",
            "x-ratelimit-limit-tokens": "8000",
            "x-ratelimit-remaining-tokens": "7990",
          },
        }),
    );
    const at = new Date("2026-09-30T12:00:00Z");
    const r = await probeGroqModel("openai/gpt-oss-120b", { fetchImpl: f as unknown as typeof fetch, key: "k", now: clock(), at });
    expect(r).toEqual({
      ok: true, latencyMs: 250, remainingRequests: 360, limitRequests: 1000, remainingTokens: 7990, limitTokens: 8000,
      probedAt: "2026-09-30T12:00:00.000Z",
    });
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.max_completion_tokens).toBe(16);
  });
  it("429 → ok=false avec message", async () => {
    const f = vi.fn(async () => new Response('{"error":{"message":"Rate limit"}}', { status: 429 }));
    const r = await probeGroqModel("m", { fetchImpl: f as unknown as typeof fetch, key: "k", now: clock() });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("HTTP 429 : Rate limit");
  });
});

const probe = (ok: boolean, at: string): GroqModelProbe => ({
  ok, latencyMs: 100, remainingRequests: null, limitRequests: null, remainingTokens: null, limitTokens: null, probedAt: at,
});
const snap = (at: string, models: Record<string, GroqModelProbe | null>): Snapshot => ({
  taken_at: at, online: 0, ai_requests_5m: 0, by_feature: null, supabase: null, errors: null,
  groq: { api: { ok: true, latencyMs: 1 }, models },
});

describe("planification des sondes", () => {
  it("latestProbes prend la plus récente non nulle par modèle", () => {
    const snaps = [
      snap("2026-09-30T12:00:00Z", { a: null, b: probe(true, "2026-09-30T12:00:00Z") }),
      snap("2026-09-30T11:30:00Z", { a: probe(false, "2026-09-30T11:30:00Z"), b: null }),
      snap("2026-09-30T11:00:00Z", { a: probe(true, "2026-09-30T11:00:00Z") }),
    ];
    const r = latestProbes(snaps, ["a", "b", "c"]);
    expect(r.a?.probedAt).toBe("2026-09-30T11:30:00Z");
    expect(r.b?.probedAt).toBe("2026-09-30T12:00:00Z");
    expect(r.c).toBeNull();
  });
  it("shouldProbe", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(shouldProbe(null, 30, now)).toBe(true);
    expect(shouldProbe(probe(true, "2026-09-30T11:40:00Z"), 30, now)).toBe(false);
    expect(shouldProbe(probe(true, "2026-09-30T11:31:00Z"), 30, now)).toBe(true); // marge d'1 min pour la gigue du cron
    expect(shouldProbe(probe(false, "2026-09-30T11:55:00Z"), 30, now)).toBe(true); // échec → re-sonde
  });
});
```

- [ ] **Step 2: Lancer (doit échouer)** → `npx vitest run lib/sources` : FAIL.

- [ ] **Step 3: Implémenter**

`lib/sources/supabase-usage.ts` :
```ts
import { env } from "@/lib/env";
import { MANAGEMENT_API } from "@/lib/noesis/client";

type Counts = { result?: Record<string, unknown>[] };

export function sumApiCounts(body: Counts): number {
  let total = 0;
  for (const row of body.result ?? []) {
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith("total_") && typeof v === "number") total += v;
    }
  }
  return total;
}

export async function fetchApiRequests24h(
  opts: { fetchImpl?: typeof fetch; ref?: string; token?: string } = {},
): Promise<number> {
  const f = opts.fetchImpl ?? fetch;
  const ref = opts.ref ?? env.noesisRef;
  const token = opts.token ?? env.managementToken;
  const res = await f(`${MANAGEMENT_API}/v1/projects/${ref}/analytics/endpoints/usage.api-counts?interval=1day`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Usage API ${res.status}`);
  return sumApiCounts((await res.json()) as Counts);
}
```

`lib/sources/groq.ts` :
```ts
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/result";
import type { GroqApiCheck, GroqModelProbe, Snapshot } from "@/lib/types";

const GROQ = "https://api.groq.com/openai/v1";
type Opts = { fetchImpl?: typeof fetch; key?: string; now?: () => number };

const header = (res: Response, name: string): number | null => {
  const v = res.headers.get(name);
  return v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
};

export async function checkGroqApi(opts: Opts = {}): Promise<GroqApiCheck> {
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const start = now();
  try {
    const res = await f(`${GROQ}/models`, {
      headers: { Authorization: `Bearer ${opts.key ?? env.groqKey}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const latencyMs = now() - start;
    return res.ok ? { ok: true, latencyMs } : { ok: false, latencyMs, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, latencyMs: null, error: errorMessage(e) };
  }
}

export async function probeGroqModel(model: string, opts: Opts & { at?: Date } = {}): Promise<GroqModelProbe> {
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const probedAt = (opts.at ?? new Date()).toISOString();
  const empty = { remainingRequests: null, limitRequests: null, remainingTokens: null, limitTokens: null };
  const start = now();
  try {
    const res = await f(`${GROQ}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.key ?? env.groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_completion_tokens: 16, reasoning_effort: "low" }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const latencyMs = now() - start;
    const quota = {
      remainingRequests: header(res, "x-ratelimit-remaining-requests"),
      limitRequests: header(res, "x-ratelimit-limit-requests"),
      remainingTokens: header(res, "x-ratelimit-remaining-tokens"),
      limitTokens: header(res, "x-ratelimit-limit-tokens"),
    };
    if (res.ok) return { ok: true, latencyMs, ...quota, probedAt };
    let msg = "";
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      /* corps non JSON */
    }
    return { ok: false, latencyMs, ...quota, error: `HTTP ${res.status}${msg ? ` : ${msg}` : ""}`, probedAt };
  } catch (e) {
    return { ok: false, latencyMs: null, ...empty, error: errorMessage(e), probedAt };
  }
}

export function latestProbes(snaps: Snapshot[], models: string[]): Record<string, GroqModelProbe | null> {
  const out: Record<string, GroqModelProbe | null> = Object.fromEntries(models.map((m) => [m, null]));
  for (const s of snaps) {
    for (const m of models) {
      const p = s.groq?.models?.[m];
      if (p && (!out[m] || p.probedAt > out[m]!.probedAt)) out[m] = p;
    }
  }
  return out;
}

/** Re-sonde si jamais sondé, si l'intervalle est écoulé (marge 1 min) ou si la dernière sonde a échoué. */
export function shouldProbe(last: GroqModelProbe | null, intervalMin: number, now: Date): boolean {
  if (!last || !last.ok) return true;
  const ageMin = (now.getTime() - new Date(last.probedAt).getTime()) / 60000;
  return ageMin >= intervalMin - 1;
}
```

Attention au test `shouldProbe(probe(true, "11:40"), 30)` : âge 20 min < 29 → `false` ✓ ; `11:31` : âge 29 min ≥ 29 → `true` ✓.

- [ ] **Step 4: Tests** → `npx vitest run lib/sources` : PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sources): usage Supabase, check API Groq, sondes espacées

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Base Pulse (migration) + accès `store`

**Files:**
- Create: `supabase/migrations/0001_pulse.sql`, `lib/store.ts`

**Interfaces:**
- Consumes: `env.pulseUrl`, `env.pulseServiceKey`, types (Task 2)
- Produces (`lib/store.ts`) :
```ts
export async function insertSnapshot(s: Snapshot): Promise<Snapshot>;
export async function recentSnapshots(limit: number): Promise<Snapshot[]>;          // du plus récent au plus ancien
export async function snapshotsSince(from: Date, to?: Date): Promise<Snapshot[]>;    // chronologique, paginé par 1000
export async function lastSnapshotAt(): Promise<string | null>;
export async function purgeSnapshots(before: Date): Promise<void>;
export async function getRules(): Promise<AlertRule[]>;
export async function updateRule(key: RuleKey, patch: { enabled?: boolean; threshold?: number }): Promise<void>;
export async function openAlerts(): Promise<Alert[]>;
export async function insertAlert(rule_key: RuleKey, message: string): Promise<Alert>;
export async function resolveAlert(id: number, at: Date): Promise<void>;
export async function alertsSince(from: Date): Promise<Alert[]>;
export async function recentAlerts(limit: number): Promise<Alert[]>;
export type AlertStore = Pick<typeof import("./store"), "openAlerts" | "insertAlert" | "resolveAlert">;
```

Pas de test unitaire (fine couche sur supabase-js) ; vérifiée en Task 20 contre une vraie base.

- [ ] **Step 1: Écrire `supabase/migrations/0001_pulse.sql`**

```sql
-- Base de Noesis Pulse (projet Supabase SÉPARÉ de Noesis).
create table if not exists public.snapshots (
  id bigserial primary key,
  taken_at timestamptz not null default now(),
  online int,
  ai_requests_5m int,
  by_feature jsonb,
  groq jsonb,
  supabase jsonb,
  errors jsonb
);
create index if not exists snapshots_taken_at on public.snapshots (taken_at desc);

create table if not exists public.alert_rules (
  key text primary key,
  enabled boolean not null default true,
  threshold numeric not null,
  params jsonb not null default '{}'
);

create table if not exists public.alerts (
  id bigserial primary key,
  rule_key text not null references public.alert_rules(key),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  message text not null
);
create index if not exists alerts_open on public.alerts (rule_key) where resolved_at is null;
create index if not exists alerts_opened_at on public.alerts (opened_at desc);

-- RLS sans aucune policy : seul le service_role (serveur) peut lire/écrire.
alter table public.snapshots enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alerts enable row level security;
revoke all on public.snapshots, public.alert_rules, public.alerts from anon, authenticated;

insert into public.alert_rules (key, enabled, threshold, params) values
  ('groq_down',        true, 1,    '{}'),
  ('groq_slow',        true, 5000, '{}'),
  ('groq_quota',       true, 0.8,  '{}'),
  ('supabase_db',      true, 0.8,  '{}'),
  ('supabase_storage', true, 0.8,  '{}'),
  ('activity_drop',    true, 0,    '{"startHour": 8, "endHour": 23, "minLastWeek": 5}'),
  ('collector_stale',  true, 15,   '{}')
on conflict (key) do nothing;
```

- [ ] **Step 2: Écrire `lib/store.ts`**

```ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Alert, AlertRule, RuleKey, Snapshot } from "@/lib/types";

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  client ??= createClient(env.pulseUrl, env.pulseServiceKey, { auth: { persistSession: false } });
  return client;
}

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`Base Pulse : ${r.error.message}`);
  return r.data as T;
}

export async function insertSnapshot(s: Snapshot): Promise<Snapshot> {
  const { id: _omit, ...row } = s;
  void _omit;
  return check(await db().from("snapshots").insert(row).select().single()) as Snapshot;
}

export async function recentSnapshots(limit: number): Promise<Snapshot[]> {
  return check(await db().from("snapshots").select("*").order("taken_at", { ascending: false }).limit(limit)) as Snapshot[];
}

export async function snapshotsSince(from: Date, to: Date = new Date()): Promise<Snapshot[]> {
  const out: Snapshot[] = [];
  const page = 1000;
  for (let i = 0; ; i += page) {
    const rows = check(
      await db()
        .from("snapshots")
        .select("*")
        .gte("taken_at", from.toISOString())
        .lt("taken_at", to.toISOString())
        .order("taken_at", { ascending: true })
        .range(i, i + page - 1),
    ) as Snapshot[];
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

export async function lastSnapshotAt(): Promise<string | null> {
  const rows = check(await db().from("snapshots").select("taken_at").order("taken_at", { ascending: false }).limit(1)) as {
    taken_at: string;
  }[];
  return rows[0]?.taken_at ?? null;
}

export async function purgeSnapshots(before: Date): Promise<void> {
  check(await db().from("snapshots").delete().lt("taken_at", before.toISOString()));
}

export async function getRules(): Promise<AlertRule[]> {
  const rows = check(await db().from("alert_rules").select("*").order("key")) as AlertRule[];
  return rows.map((r) => ({ ...r, threshold: Number(r.threshold), params: r.params ?? {} }));
}

export async function updateRule(key: RuleKey, patch: { enabled?: boolean; threshold?: number }): Promise<void> {
  check(await db().from("alert_rules").update(patch).eq("key", key));
}

export async function openAlerts(): Promise<Alert[]> {
  return check(await db().from("alerts").select("*").is("resolved_at", null)) as Alert[];
}

export async function insertAlert(rule_key: RuleKey, message: string): Promise<Alert> {
  return check(await db().from("alerts").insert({ rule_key, message }).select().single()) as Alert;
}

export async function resolveAlert(id: number, at: Date): Promise<void> {
  check(await db().from("alerts").update({ resolved_at: at.toISOString() }).eq("id", id));
}

export async function alertsSince(from: Date): Promise<Alert[]> {
  return check(
    await db().from("alerts").select("*").gte("opened_at", from.toISOString()).order("opened_at", { ascending: false }),
  ) as Alert[];
}

export async function recentAlerts(limit: number): Promise<Alert[]> {
  return check(await db().from("alerts").select("*").order("opened_at", { ascending: false }).limit(limit)) as Alert[];
}

export type AlertStore = {
  openAlerts: typeof openAlerts;
  insertAlert: typeof insertAlert;
  resolveAlert: typeof resolveAlert;
};
```

- [ ] **Step 3: Installer `server-only` et vérifier les types**

Run: `npm install server-only && npm run typecheck`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(store): migration de la base Pulse et accès aux relevés/alertes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Construction d'un relevé (`buildSnapshot`)

**Files:**
- Create: `lib/collect.ts`
- Test: `lib/collect.test.ts`

**Interfaces:**
- Consumes: `CollectRow` (Task 5), `latestProbes`, `shouldProbe` (Task 6), `MODELS`, `PROBE_INTERVAL_MIN`, types (Task 2), `errorMessage` (Task 1)
- Produces:
```ts
export type CollectDeps = {
  now: Date;
  noesis: () => Promise<CollectRow>;
  apiRequests24h: () => Promise<number>;
  groqApi: () => Promise<GroqApiCheck>;
  probe: (model: string) => Promise<GroqModelProbe>;
  recent: Snapshot[];
  limits: { dbLimitBytes: number; storageLimitBytes: number };
};
export type CollectOutput = { snapshot: Snapshot; noesis: CollectRow | null; probes: Record<string, GroqModelProbe | null> };
export async function buildSnapshot(deps: CollectDeps): Promise<CollectOutput>;
```
`probes` = dernière sonde connue par modèle (nouvelle si sondée maintenant, sinon celle de l'historique) — utilisée par les règles d'alerte.

- [ ] **Step 1: Écrire le test**

```ts
import { describe, expect, it, vi } from "vitest";
import type { GroqModelProbe, Snapshot } from "@/lib/types";
import { MODELS } from "@/lib/types";
import { buildSnapshot, type CollectDeps } from "./collect";

const NOW = new Date("2026-09-30T12:00:00Z");
const row = {
  online: 4, ai5m: 7, byFeature5m: { chat: 5, debates: 1, challenges: 1, documents: 0 },
  ai2h: 90, ai2hLastWeek: 80, dbBytes: 100, storageBytes: 200,
};
const probe = (ok: boolean, at: string): GroqModelProbe => ({
  ok, latencyMs: 400, remainingRequests: 500, limitRequests: 1000, remainingTokens: 1, limitTokens: 2, probedAt: at,
  ...(ok ? {} : { error: "HTTP 500" }),
});

function deps(over: Partial<CollectDeps> = {}): CollectDeps {
  return {
    now: NOW,
    noesis: async () => row,
    apiRequests24h: async () => 48000,
    groqApi: async () => ({ ok: true, latencyMs: 90 }),
    probe: vi.fn(async () => probe(true, NOW.toISOString())),
    recent: [],
    limits: { dbLimitBytes: 1000, storageLimitBytes: 2000 },
    ...over,
  };
}

describe("buildSnapshot", () => {
  it("assemble toutes les sources", async () => {
    const d = deps();
    const out = await buildSnapshot(d);
    expect(out.snapshot).toMatchObject({
      taken_at: NOW.toISOString(), online: 4, ai_requests_5m: 7,
      by_feature: row.byFeature5m,
      supabase: { apiRequests24h: 48000, dbBytes: 100, dbLimitBytes: 1000, storageBytes: 200, storageLimitBytes: 2000 },
      errors: null,
    });
    expect(out.snapshot.groq?.api).toEqual({ ok: true, latencyMs: 90 });
    expect(d.probe).toHaveBeenCalledTimes(2); // aucun historique → les 2 modèles
    expect(out.probes[MODELS.primary]?.ok).toBe(true);
  });

  it("ne re-sonde pas un modèle sondé récemment et réutilise la dernière sonde", async () => {
    const recent: Snapshot[] = [
      {
        taken_at: "2026-09-30T11:55:00Z", online: 1, ai_requests_5m: 0, by_feature: null, supabase: null, errors: null,
        groq: {
          api: { ok: true, latencyMs: 1 },
          models: { [MODELS.primary]: probe(true, "2026-09-30T11:45:00Z"), [MODELS.fallback]: probe(true, "2026-09-30T11:30:00Z") },
        },
      },
    ];
    const d = deps({ recent });
    const out = await buildSnapshot(d);
    expect(d.probe).not.toHaveBeenCalled();
    expect(out.snapshot.groq?.models).toEqual({ [MODELS.primary]: null, [MODELS.fallback]: null });
    expect(out.probes[MODELS.primary]?.probedAt).toBe("2026-09-30T11:45:00Z");
  });

  it("une source KO donne un relevé partiel avec erreur consignée", async () => {
    const out = await buildSnapshot(
      deps({
        noesis: async () => {
          throw new Error("Management API 401");
        },
        apiRequests24h: async () => {
          throw new Error("Usage API 500");
        },
        groqApi: async () => ({ ok: false, latencyMs: null, error: "ECONNRESET" }),
        probe: async () => probe(false, NOW.toISOString()),
      }),
    );
    expect(out.snapshot.online).toBeNull();
    expect(out.snapshot.ai_requests_5m).toBeNull();
    expect(out.snapshot.by_feature).toBeNull();
    expect(out.snapshot.supabase).toBeNull();
    expect(out.noesis).toBeNull();
    expect(out.snapshot.errors).toEqual({
      noesis: "Management API 401",
      supabase_usage: "Usage API 500",
      groq_api: "ECONNRESET",
      [`groq:${MODELS.primary}`]: "HTTP 500",
      [`groq:${MODELS.fallback}`]: "HTTP 500",
    });
  });

  it("usage API KO mais Noesis OK → tailles présentes, compteur null", async () => {
    const out = await buildSnapshot(
      deps({
        apiRequests24h: async () => {
          throw new Error("Usage API 500");
        },
      }),
    );
    expect(out.snapshot.supabase).toEqual({
      apiRequests24h: null, dbBytes: 100, dbLimitBytes: 1000, storageBytes: 200, storageLimitBytes: 2000,
    });
  });
});
```

- [ ] **Step 2: Lancer (doit échouer)** → `npx vitest run lib/collect.test.ts` : FAIL.

- [ ] **Step 3: Implémenter `lib/collect.ts`**

```ts
import type { CollectRow } from "@/lib/noesis/queries";
import { errorMessage } from "@/lib/result";
import { latestProbes, shouldProbe } from "@/lib/sources/groq";
import { MODELS, PROBE_INTERVAL_MIN } from "@/lib/types";
import type { GroqApiCheck, GroqModelProbe, Snapshot } from "@/lib/types";

export type CollectDeps = {
  now: Date;
  noesis: () => Promise<CollectRow>;
  apiRequests24h: () => Promise<number>;
  groqApi: () => Promise<GroqApiCheck>;
  probe: (model: string) => Promise<GroqModelProbe>;
  recent: Snapshot[];
  limits: { dbLimitBytes: number; storageLimitBytes: number };
};

export type CollectOutput = {
  snapshot: Snapshot;
  noesis: CollectRow | null;
  probes: Record<string, GroqModelProbe | null>;
};

export async function buildSnapshot(d: CollectDeps): Promise<CollectOutput> {
  const models = [MODELS.primary, MODELS.fallback];
  const last = latestProbes(d.recent, models);
  const toProbe = models.filter((m) => shouldProbe(last[m], PROBE_INTERVAL_MIN[m], d.now));

  const [noesis, apiReq, api, ...probed] = await Promise.allSettled([
    d.noesis(),
    d.apiRequests24h(),
    d.groqApi(),
    ...toProbe.map((m) => d.probe(m)),
  ]);

  const errors: Record<string, string> = {};
  const n = noesis.status === "fulfilled" ? (noesis.value as CollectRow) : null;
  if (noesis.status === "rejected") errors.noesis = errorMessage(noesis.reason);
  if (apiReq.status === "rejected") errors.supabase_usage = errorMessage(apiReq.reason);

  const apiCheck: GroqApiCheck =
    api.status === "fulfilled" ? (api.value as GroqApiCheck) : { ok: false, latencyMs: null, error: errorMessage(api.reason) };
  if (!apiCheck.ok) errors.groq_api = apiCheck.error ?? "erreur";

  const newModels: Record<string, GroqModelProbe | null> = Object.fromEntries(models.map((m) => [m, null]));
  toProbe.forEach((m, i) => {
    const r = probed[i];
    const p: GroqModelProbe =
      r.status === "fulfilled"
        ? (r.value as GroqModelProbe)
        : {
            ok: false, latencyMs: null, remainingRequests: null, limitRequests: null, remainingTokens: null, limitTokens: null,
            error: errorMessage(r.reason), probedAt: d.now.toISOString(),
          };
    newModels[m] = p;
    if (!p.ok) errors[`groq:${m}`] = p.error ?? "erreur";
  });

  const snapshot: Snapshot = {
    taken_at: d.now.toISOString(),
    online: n ? n.online : null,
    ai_requests_5m: n ? n.ai5m : null,
    by_feature: n ? n.byFeature5m : null,
    groq: { api: apiCheck, models: newModels },
    supabase: n
      ? {
          apiRequests24h: apiReq.status === "fulfilled" ? (apiReq.value as number) : null,
          dbBytes: n.dbBytes,
          dbLimitBytes: d.limits.dbLimitBytes,
          storageBytes: n.storageBytes,
          storageLimitBytes: d.limits.storageLimitBytes,
        }
      : null,
    errors: Object.keys(errors).length ? errors : null,
  };

  const probes = Object.fromEntries(models.map((m) => [m, newModels[m] ?? last[m]]));
  return { snapshot, noesis: n, probes };
}
```

- [ ] **Step 4: Tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(collect): construction d'un relevé avec sources isolées

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Règles d'alerte (pures)

**Files:**
- Create: `lib/alerts/rules.ts`
- Test: `lib/alerts/rules.test.ts`

**Interfaces:**
- Consumes: types, `MODELS` (Task 2), `formatPct`, `formatBytes` (Task 2), `parisHour` (Task 2)
- Produces:
```ts
export type RuleContext = {
  now: Date;
  latest: Snapshot | null;
  previous: Snapshot | null;
  probes: Record<string, GroqModelProbe | null>;
  ai2h: number | null;
  ai2hLastWeek: number | null;
  lastSnapshotAt: string | null;
};
export type RuleResult = { firing: boolean; message: string };
export const RULE_META: Record<RuleKey, { label: string; unit: "none" | "ms" | "ratio" | "count" | "min"; help: string }>;
export function checkRule(rule: AlertRule, ctx: RuleContext): RuleResult;
export function diffAlerts(rules: AlertRule[], ctx: RuleContext, open: Alert[]): {
  toOpen: { rule_key: RuleKey; message: string }[];
  toResolve: { alert: Alert; message: string }[];
};
```
Règle : une règle désactivée est ignorée (ni ouverture ni résolution). Une donnée manquante (`null`) ne déclenche jamais.

- [ ] **Step 1: Écrire le test**

```ts
import { describe, expect, it } from "vitest";
import type { Alert, AlertRule, GroqModelProbe, RuleKey, Snapshot } from "@/lib/types";
import { MODELS } from "@/lib/types";
import { checkRule, diffAlerts, type RuleContext } from "./rules";

const rule = (key: RuleKey, threshold: number, params: Record<string, number> = {}, enabled = true): AlertRule => ({
  key, threshold, params, enabled,
});
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  taken_at: "2026-09-30T12:00:00Z", online: 3, ai_requests_5m: 2, by_feature: null, errors: null,
  groq: { api: { ok: true, latencyMs: 80 }, models: {} },
  supabase: { apiRequests24h: 1, dbBytes: 100, dbLimitBytes: 1000, storageBytes: 100, storageLimitBytes: 1000 },
  ...over,
});
const probe = (over: Partial<GroqModelProbe> = {}): GroqModelProbe => ({
  ok: true, latencyMs: 400, remainingRequests: 600, limitRequests: 1000, remainingTokens: null, limitTokens: null,
  probedAt: "2026-09-30T11:50:00Z", ...over,
});
// 12:00 UTC = 14:00 à Paris (dans la fenêtre 8h-23h)
const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({
  now: new Date("2026-09-30T12:00:00Z"),
  latest: snap(), previous: snap(),
  probes: { [MODELS.primary]: probe(), [MODELS.fallback]: probe() },
  ai2h: 50, ai2hLastWeek: 40, lastSnapshotAt: "2026-09-30T12:00:00Z",
  ...over,
});
const down = { ok: false, latencyMs: null, error: "ECONNRESET" };

describe("groq_down", () => {
  const r = rule("groq_down", 1);
  it("calme quand tout va bien", () => expect(checkRule(r, ctx()).firing).toBe(false));
  it("1 seul relevé API KO ne suffit pas", () => {
    expect(checkRule(r, ctx({ latest: snap({ groq: { api: down, models: {} } }) })).firing).toBe(false);
  });
  it("2 relevés API KO consécutifs", () => {
    const res = checkRule(r, ctx({ latest: snap({ groq: { api: down, models: {} } }), previous: snap({ groq: { api: down, models: {} } }) }));
    expect(res).toEqual({ firing: true, message: "🔴 API Groq injoignable depuis 2 relevés (ECONNRESET)" });
  });
  it("dernière sonde 120b en échec", () => {
    const res = checkRule(r, ctx({ probes: { [MODELS.primary]: probe({ ok: false, error: "HTTP 503" }) } }));
    expect(res).toEqual({ firing: true, message: "🔴 Groq gpt-oss-120b en échec : HTTP 503" });
  });
});

describe("groq_slow / groq_quota", () => {
  it("lent au-delà du seuil", () => {
    const res = checkRule(rule("groq_slow", 5000), ctx({ probes: { [MODELS.primary]: probe({ latencyMs: 6200 }) } }));
    expect(res).toEqual({ firing: true, message: "🐢 Groq gpt-oss-120b lent : 6,2 s (seuil 5 s)" });
  });
  it("sonde en échec ne compte pas comme lente", () => {
    expect(checkRule(rule("groq_slow", 5000), ctx({ probes: { [MODELS.primary]: probe({ ok: false, latencyMs: 9000 }) } })).firing).toBe(false);
  });
  it("quota > 80 %", () => {
    const res = checkRule(rule("groq_quota", 0.8), ctx({ probes: { [MODELS.primary]: probe({ remainingRequests: 150 }) } }));
    expect(res).toEqual({ firing: true, message: "⚠️ Quota Groq du jour consommé à 85 % (150 requêtes restantes)" });
  });
  it("quota inconnu → calme", () => {
    expect(checkRule(rule("groq_quota", 0.8), ctx({ probes: {} })).firing).toBe(false);
  });
});

describe("supabase", () => {
  it("base > 80 %", () => {
    const s = snap({ supabase: { apiRequests24h: 1, dbBytes: 420 * 2 ** 20, dbLimitBytes: 500 * 2 ** 20, storageBytes: 0, storageLimitBytes: 1 } });
    const res = checkRule(rule("supabase_db", 0.8), ctx({ latest: s }));
    expect(res).toEqual({ firing: true, message: "⚠️ Base Noesis à 84 % (420 Mo / 500 Mo)" });
  });
  it("stockage sous le seuil", () => {
    expect(checkRule(rule("supabase_storage", 0.8), ctx()).firing).toBe(false);
  });
  it("supabase null → calme", () => {
    expect(checkRule(rule("supabase_db", 0.8), ctx({ latest: snap({ supabase: null }) })).firing).toBe(false);
  });
});

describe("activity_drop", () => {
  const r = rule("activity_drop", 0, { startHour: 8, endHour: 23, minLastWeek: 5 });
  it("0 demande alors que J-7 en avait", () => {
    expect(checkRule(r, ctx({ ai2h: 0, ai2hLastWeek: 12 }))).toEqual({
      firing: true, message: "📉 0 demande IA en 2 h (12 la semaine dernière à la même heure)",
    });
  });
  it("J-7 trop calme → pas d'alerte", () => {
    expect(checkRule(r, ctx({ ai2h: 0, ai2hLastWeek: 2 })).firing).toBe(false);
  });
  it("la nuit → pas d'alerte (03:00 Paris)", () => {
    expect(checkRule(r, ctx({ now: new Date("2026-09-30T01:00:00Z"), ai2h: 0, ai2hLastWeek: 12 })).firing).toBe(false);
  });
});

describe("collector_stale", () => {
  const r = rule("collector_stale", 15);
  it("relevé récent", () => expect(checkRule(r, ctx({ lastSnapshotAt: "2026-09-30T11:55:00Z" })).firing).toBe(false));
  it("relevé trop vieux", () => {
    expect(checkRule(r, ctx({ lastSnapshotAt: "2026-09-30T11:37:00Z" }))).toEqual({ firing: true, message: "⏱️ Aucun relevé depuis 23 min" });
  });
  it("aucun relevé", () => {
    expect(checkRule(r, ctx({ lastSnapshotAt: null }))).toEqual({ firing: true, message: "⏱️ Aucun relevé enregistré" });
  });
});

describe("diffAlerts", () => {
  const openAlert: Alert = { id: 9, rule_key: "groq_slow", opened_at: "x", resolved_at: null, message: "m" };
  const slowCtx = ctx({ probes: { [MODELS.primary]: probe({ latencyMs: 6200 }) } });

  it("ouvre une alerte qui se déclenche", () => {
    const d = diffAlerts([rule("groq_slow", 5000)], slowCtx, []);
    expect(d.toOpen).toEqual([{ rule_key: "groq_slow", message: "🐢 Groq gpt-oss-120b lent : 6,2 s (seuil 5 s)" }]);
    expect(d.toResolve).toEqual([]);
  });
  it("ne ré-ouvre pas une alerte déjà ouverte (anti-spam)", () => {
    const d = diffAlerts([rule("groq_slow", 5000)], slowCtx, [openAlert]);
    expect(d).toEqual({ toOpen: [], toResolve: [] });
  });
  it("résout une alerte revenue à la normale", () => {
    const d = diffAlerts([rule("groq_slow", 5000)], ctx(), [openAlert]);
    expect(d.toResolve).toEqual([{ alert: openAlert, message: "✅ Résolu : Groq lent" }]);
  });
  it("ignore une règle désactivée", () => {
    const d = diffAlerts([rule("groq_slow", 5000, {}, false)], slowCtx, []);
    expect(d).toEqual({ toOpen: [], toResolve: [] });
  });
});
```

- [ ] **Step 2: Lancer (doit échouer)** → `npx vitest run lib/alerts/rules.test.ts` : FAIL.

- [ ] **Step 3: Implémenter `lib/alerts/rules.ts`**

```ts
import { formatBytes, formatPct } from "@/lib/format";
import { parisHour } from "@/lib/time";
import { MODELS } from "@/lib/types";
import type { Alert, AlertRule, GroqModelProbe, RuleKey, Snapshot } from "@/lib/types";

export type RuleContext = {
  now: Date;
  latest: Snapshot | null;
  previous: Snapshot | null;
  probes: Record<string, GroqModelProbe | null>;
  ai2h: number | null;
  ai2hLastWeek: number | null;
  lastSnapshotAt: string | null;
};

export type RuleResult = { firing: boolean; message: string };

export const RULE_META: Record<RuleKey, { label: string; unit: "none" | "ms" | "ratio" | "count" | "min"; help: string }> = {
  groq_down: { label: "Groq en panne", unit: "none", help: "API Groq KO sur 2 relevés, ou dernière sonde gpt-oss-120b en échec" },
  groq_slow: { label: "Groq lent", unit: "ms", help: "Dernière sonde gpt-oss-120b plus lente que le seuil (ms)" },
  groq_quota: { label: "Quota Groq", unit: "ratio", help: "Part du quota journalier de requêtes consommée (0 à 1)" },
  supabase_db: { label: "Base Noesis pleine", unit: "ratio", help: "Taille de la base / limite du plan (0 à 1)" },
  supabase_storage: { label: "Stockage Noesis plein", unit: "ratio", help: "Stockage / limite du plan (0 à 1)" },
  activity_drop: { label: "Chute d'activité", unit: "count", help: "Demandes IA sur 2 h ≤ seuil, entre 8h et 23h, alors que J-7 en comptait au moins 5" },
  collector_stale: { label: "Collecteur arrêté", unit: "min", help: "Minutes sans nouveau relevé" },
};

const quiet: RuleResult = { firing: false, message: "" };
const fire = (message: string): RuleResult => ({ firing: true, message });
const shortName = (model: string) => model.replace(/^openai\//, "");
const seconds = (ms: number) => `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;

export function checkRule(rule: AlertRule, ctx: RuleContext): RuleResult {
  const t = rule.threshold;
  const primary = ctx.probes[MODELS.primary] ?? null;

  switch (rule.key) {
    case "groq_down": {
      const a = ctx.latest?.groq?.api;
      const b = ctx.previous?.groq?.api;
      if (a && b && !a.ok && !b.ok) return fire(`🔴 API Groq injoignable depuis 2 relevés (${a.error ?? "erreur"})`);
      if (primary && !primary.ok) return fire(`🔴 Groq ${shortName(MODELS.primary)} en échec : ${primary.error ?? "erreur"}`);
      return quiet;
    }
    case "groq_slow": {
      if (primary?.ok && primary.latencyMs != null && primary.latencyMs > t) {
        return fire(`🐢 Groq ${shortName(MODELS.primary)} lent : ${seconds(primary.latencyMs)} (seuil ${seconds(t)})`);
      }
      return quiet;
    }
    case "groq_quota": {
      if (!primary || !primary.limitRequests || primary.remainingRequests == null) return quiet;
      const used = 1 - primary.remainingRequests / primary.limitRequests;
      return used > t ? fire(`⚠️ Quota Groq du jour consommé à ${formatPct(used)} (${primary.remainingRequests} requêtes restantes)`) : quiet;
    }
    case "supabase_db":
    case "supabase_storage": {
      const s = ctx.latest?.supabase;
      if (!s) return quiet;
      const isDb = rule.key === "supabase_db";
      const used = isDb ? s.dbBytes : s.storageBytes;
      const limit = isDb ? s.dbLimitBytes : s.storageLimitBytes;
      if (!limit) return quiet;
      const ratio = used / limit;
      const what = isDb ? "Base Noesis" : "Stockage Noesis";
      return ratio > t ? fire(`⚠️ ${what} à ${formatPct(ratio)} (${formatBytes(used)} / ${formatBytes(limit)})`) : quiet;
    }
    case "activity_drop": {
      const h = parisHour(ctx.now);
      const start = rule.params.startHour ?? 8;
      const end = rule.params.endHour ?? 23;
      const minLastWeek = rule.params.minLastWeek ?? 5;
      if (h < start || h >= end || ctx.ai2h == null || ctx.ai2hLastWeek == null) return quiet;
      if (ctx.ai2h <= t && ctx.ai2hLastWeek >= minLastWeek) {
        return fire(`📉 ${ctx.ai2h} demande IA en 2 h (${ctx.ai2hLastWeek} la semaine dernière à la même heure)`);
      }
      return quiet;
    }
    case "collector_stale": {
      if (!ctx.lastSnapshotAt) return fire("⏱️ Aucun relevé enregistré");
      const ageMin = (ctx.now.getTime() - new Date(ctx.lastSnapshotAt).getTime()) / 60000;
      return ageMin > t ? fire(`⏱️ Aucun relevé depuis ${Math.round(ageMin)} min`) : quiet;
    }
  }
}

export function diffAlerts(rules: AlertRule[], ctx: RuleContext, open: Alert[]) {
  const toOpen: { rule_key: RuleKey; message: string }[] = [];
  const toResolve: { alert: Alert; message: string }[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const res = checkRule(rule, ctx);
    const current = open.find((a) => a.rule_key === rule.key);
    if (res.firing && !current) toOpen.push({ rule_key: rule.key, message: res.message });
    if (!res.firing && current) toResolve.push({ alert: current, message: `✅ Résolu : ${RULE_META[rule.key].label}` });
  }
  return { toOpen, toResolve };
}
```

Vérifier le calcul du test `supabase_db` : 420/500 = 0,84 → « 84 % » ; `formatBytes(420 Mo)` → « 420 Mo ».

- [ ] **Step 4: Tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(alertes): règles pures avec anti-spam et résolution

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Telegram + exécution des alertes

**Files:**
- Create: `lib/alerts/telegram.ts`, `lib/alerts/run.ts`
- Test: `lib/alerts/telegram.test.ts`, `lib/alerts/run.test.ts`

**Interfaces:**
- Consumes: `diffAlerts`, `RuleContext` (Task 9), `AlertStore` (Task 7), `env` (Task 2)
- Produces:
```ts
export async function sendTelegram(text: string, opts?: { fetchImpl?: typeof fetch; token?: string; chatId?: string }): Promise<void>;
export async function runAlerts(args: {
  rules: AlertRule[]; ctx: RuleContext; store: AlertStore; notify: (text: string) => Promise<void>;
}): Promise<{ opened: RuleKey[]; resolved: RuleKey[]; notifyErrors: string[] }>;
```
Ordre : on **persiste d'abord** (ouverture/résolution), puis on notifie. Un échec d'envoi Telegram est consigné dans `notifyErrors` et ne fait pas échouer l'appel.

- [ ] **Step 1: Écrire les tests**

`lib/alerts/telegram.test.ts` :
```ts
import { describe, expect, it, vi } from "vitest";
import { sendTelegram } from "./telegram";

describe("sendTelegram", () => {
  it("poste sur sendMessage", async () => {
    const f = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    await sendTelegram("coucou", { fetchImpl: f as unknown as typeof fetch, token: "T0K", chatId: "42" });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/botT0K/sendMessage");
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: "42", text: "coucou", disable_web_page_preview: true });
  });
  it("erreur sans divulguer le jeton", async () => {
    const f = vi.fn(async () => new Response('{"ok":false,"description":"chat not found"}', { status: 400 }));
    const p = sendTelegram("x", { fetchImpl: f as unknown as typeof fetch, token: "SECRET", chatId: "1" });
    await expect(p).rejects.toThrow("Telegram 400 : chat not found");
  });
});
```

`lib/alerts/run.test.ts` :
```ts
import { describe, expect, it, vi } from "vitest";
import type { Alert, AlertRule, RuleKey } from "@/lib/types";
import { MODELS } from "@/lib/types";
import type { RuleContext } from "./rules";
import { runAlerts } from "./run";

const ctx: RuleContext = {
  now: new Date("2026-09-30T12:00:00Z"), latest: null, previous: null,
  probes: {
    [MODELS.primary]: {
      ok: true, latencyMs: 9000, remainingRequests: null, limitRequests: null, remainingTokens: null, limitTokens: null,
      probedAt: "2026-09-30T11:50:00Z",
    },
  },
  ai2h: null, ai2hLastWeek: null, lastSnapshotAt: "2026-09-30T11:40:00Z",
};
const rules: AlertRule[] = [
  { key: "groq_slow", enabled: true, threshold: 5000, params: {} },
  { key: "collector_stale", enabled: true, threshold: 15, params: {} },
];

function fakeStore(open: Alert[]) {
  return {
    openAlerts: vi.fn(async () => open),
    insertAlert: vi.fn(async (rule_key: RuleKey, message: string): Promise<Alert> => ({ id: 1, rule_key, message, opened_at: "", resolved_at: null })),
    resolveAlert: vi.fn(async () => {}),
  };
}

describe("runAlerts", () => {
  it("ouvre, résout, notifie", async () => {
    const store = fakeStore([{ id: 7, rule_key: "collector_stale", opened_at: "", resolved_at: null, message: "" }]);
    const notify = vi.fn(async () => {});
    const r = await runAlerts({ rules, ctx, store, notify });
    expect(r).toEqual({ opened: ["groq_slow"], resolved: ["collector_stale"], notifyErrors: [] });
    expect(store.insertAlert).toHaveBeenCalledWith("groq_slow", "🐢 Groq gpt-oss-120b lent : 9 s (seuil 5 s)");
    expect(store.resolveAlert).toHaveBeenCalledWith(7, ctx.now);
    expect(notify).toHaveBeenCalledTimes(2);
  });
  it("un échec Telegram n'empêche pas la persistance", async () => {
    const store = fakeStore([]);
    const notify = vi.fn(async () => {
      throw new Error("Telegram 400");
    });
    const r = await runAlerts({ rules, ctx, store, notify });
    expect(store.insertAlert).toHaveBeenCalled();
    expect(r.notifyErrors).toEqual(["Telegram 400"]);
  });
});
```

- [ ] **Step 2: Lancer (doit échouer)** → `npx vitest run lib/alerts` : FAIL sur telegram/run.

- [ ] **Step 3: Implémenter**

`lib/alerts/telegram.ts` :
```ts
import { env } from "@/lib/env";

export async function sendTelegram(
  text: string,
  opts: { fetchImpl?: typeof fetch; token?: string; chatId?: string } = {},
): Promise<void> {
  const f = opts.fetchImpl ?? fetch;
  const token = opts.token ?? env.telegramToken;
  const chatId = opts.chatId ?? env.telegramChatId;
  const res = await f(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    let desc = "";
    try {
      desc = ((await res.json()) as { description?: string }).description ?? "";
    } catch {
      /* corps non JSON */
    }
    throw new Error(`Telegram ${res.status}${desc ? ` : ${desc}` : ""}`);
  }
}
```

`lib/alerts/run.ts` :
```ts
import type { AlertStore } from "@/lib/store";
import { errorMessage } from "@/lib/result";
import type { AlertRule, RuleKey } from "@/lib/types";
import { diffAlerts, type RuleContext } from "./rules";

export async function runAlerts(args: {
  rules: AlertRule[];
  ctx: RuleContext;
  store: AlertStore;
  notify: (text: string) => Promise<void>;
}): Promise<{ opened: RuleKey[]; resolved: RuleKey[]; notifyErrors: string[] }> {
  const open = await args.store.openAlerts();
  const { toOpen, toResolve } = diffAlerts(args.rules, args.ctx, open);
  const messages: string[] = [];

  for (const a of toOpen) {
    await args.store.insertAlert(a.rule_key, a.message);
    messages.push(a.message);
  }
  for (const r of toResolve) {
    await args.store.resolveAlert(r.alert.id, args.ctx.now);
    messages.push(r.message);
  }

  const notifyErrors: string[] = [];
  for (const m of messages) {
    try {
      await args.notify(m);
    } catch (e) {
      notifyErrors.push(errorMessage(e));
    }
  }
  return { opened: toOpen.map((a) => a.rule_key), resolved: toResolve.map((r) => r.alert.rule_key), notifyErrors };
}
```

Note : `lib/alerts/run.ts` importe seulement le **type** `AlertStore` depuis `lib/store.ts` (`import type`) → pas de chargement de `server-only` en test.

- [ ] **Step 4: Tests** → `npx vitest run lib/alerts` : PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(alertes): envoi Telegram et exécution ouvrir/résoudre/notifier

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Résumé quotidien (requête + texte)

**Files:**
- Create: `lib/digest.ts`
- Modify: `lib/noesis/queries.ts` (ajouter `daySummarySql`/`mapDaySummary`), `lib/noesis/queries.test.ts` (ajouter un test)
- Test: `lib/digest.test.ts`

**Interfaces:**
- Consumes: `formatInt`, `formatPct`, `formatParis` (Task 2), `Alert` (Task 2), `RULE_META` (Task 9)
- Produces:
```ts
// queries.ts
export type DaySummary = { newUsers: number; active: number; ai: number; aiPrev: number };
export function daySummarySql(from: Date, to: Date, prevFrom: Date): string;
export function mapDaySummary(rows: Record<string, unknown>[]): DaySummary;
// digest.ts
export type DigestData = {
  day: Date; summary: DaySummary | null; peak: { value: number; at: string } | null;
  groqAvailability: number | null; alerts: Alert[]; unavailable: string[];
};
export function buildDigest(d: DigestData): string;
```

- [ ] **Step 1: Ajouter le test SQL à `lib/noesis/queries.test.ts`**

```ts
describe("résumé d'une journée", () => {
  it("compte inscrits, actifs et demandes sur [from, to[ et la veille", async () => {
    const s = q.mapDaySummary(await query(db, q.daySummarySql(hoursAgo(24), now(), hoursAgo(48))));
    expect(s).toEqual({ newUsers: 1, active: 2, ai: 3, aiPrev: 1 });
  });
});
```
(Ajouter aussi `q.daySummarySql(hoursAgo(24), now(), hoursAgo(48))` à la liste du test « toutes les requêtes passent la garde ».)

- [ ] **Step 2: Écrire `lib/digest.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { buildDigest } from "./digest";

const base = {
  day: new Date("2026-09-28T22:00:00Z"), // mardi 29 septembre à Paris
  summary: { newUsers: 12, active: 87, ai: 3412, aiPrev: 3046 },
  peak: { value: 27, at: "2026-09-29T19:10:00Z" },
  groqAvailability: 0.9931,
  alerts: [],
  unavailable: [],
};

describe("buildDigest", () => {
  it("résumé complet", () => {
    expect(buildDigest(base).replace(/ /g, " ")).toBe(
      [
        "☀️ Noesis — résumé du mardi 29 septembre",
        "👥 Nouveaux inscrits : 12",
        "🟢 Actifs : 87",
        "🤖 Demandes IA : 3 412 (▲ 12 % vs veille)",
        "📈 Pic en ligne : 27 à 21:10",
        "⚡ Disponibilité API Groq : 99,3 %",
        "✅ Aucune alerte",
      ].join("\n"),
    );
  });
  it("baisse, alertes et sources indisponibles", () => {
    const txt = buildDigest({
      ...base,
      summary: { newUsers: 0, active: 3, ai: 50, aiPrev: 100 },
      peak: null,
      groqAvailability: null,
      alerts: [
        { id: 1, rule_key: "groq_slow", opened_at: "", resolved_at: "", message: "" },
        { id: 2, rule_key: "supabase_db", opened_at: "", resolved_at: null, message: "" },
      ],
      unavailable: ["relevés"],
    });
    expect(txt).toContain("🤖 Demandes IA : 50 (▼ 50 % vs veille)");
    expect(txt).toContain("📈 Pic en ligne : —");
    expect(txt).toContain("⚡ Disponibilité API Groq : —");
    expect(txt).toContain("🚨 Alertes : 2 (Groq lent, Base Noesis pleine)");
    expect(txt).toContain("⚠️ Données indisponibles : relevés");
  });
  it("activité Noesis indisponible", () => {
    expect(buildDigest({ ...base, summary: null })).toContain("👥 Activité : indisponible");
  });
});
```

- [ ] **Step 3: Lancer (doit échouer)** → `npx vitest run lib/digest.test.ts lib/noesis/queries.test.ts` : FAIL.

- [ ] **Step 4: Ajouter à `lib/noesis/queries.ts`**

```ts
// ---------- Résumé d'une journée ----------

export type DaySummary = { newUsers: number; active: number; ai: number; aiPrev: number };

export function daySummarySql(from: Date, to: Date, prevFrom: Date): string {
  const f = lit.ts(from);
  const t = lit.ts(to);
  const pf = lit.ts(prevFrom);
  return `
with ai as (select created_at from (${AI_UNION}) x where created_at >= ${pf} and created_at < ${t}),
act as (select user_id from (${ACT_UNION}) a where created_at >= ${f} and created_at < ${t})
select
  (select count(*) from auth.users where created_at >= ${f} and created_at < ${t})::int as new_users,
  (select count(distinct user_id) from act)::int as active,
  (select count(*) from ai where created_at >= ${f})::int as ai,
  (select count(*) from ai where created_at < ${f})::int as ai_prev`;
}

export function mapDaySummary(rows: Row[]): DaySummary {
  const r = rows[0] ?? {};
  return { newUsers: num(r.new_users), active: num(r.active), ai: num(r.ai), aiPrev: num(r.ai_prev) };
}
```

- [ ] **Step 5: Écrire `lib/digest.ts`**

```ts
import { RULE_META } from "@/lib/alerts/rules";
import { formatInt, formatParis, formatPct } from "@/lib/format";
import type { DaySummary } from "@/lib/noesis/queries";
import { pctChange } from "@/lib/stats";
import type { Alert } from "@/lib/types";

export type DigestData = {
  day: Date;
  summary: DaySummary | null;
  peak: { value: number; at: string } | null;
  groqAvailability: number | null;
  alerts: Alert[];
  unavailable: string[];
};

function trend(cur: number, prev: number): string {
  const c = pctChange(cur, prev);
  if (c == null) return "";
  const arrow = c >= 0 ? "▲" : "▼";
  return ` (${arrow} ${formatPct(Math.abs(c))} vs veille)`;
}

export function buildDigest(d: DigestData): string {
  const lines = [`☀️ Noesis — résumé du ${formatParis(d.day.toISOString(), { weekday: "long", day: "numeric", month: "long" })}`];
  if (d.summary) {
    lines.push(
      `👥 Nouveaux inscrits : ${formatInt(d.summary.newUsers)}`,
      `🟢 Actifs : ${formatInt(d.summary.active)}`,
      `🤖 Demandes IA : ${formatInt(d.summary.ai)}${trend(d.summary.ai, d.summary.aiPrev)}`,
    );
  } else {
    lines.push("👥 Activité : indisponible");
  }
  lines.push(
    d.peak
      ? `📈 Pic en ligne : ${d.peak.value} à ${formatParis(d.peak.at, { hour: "2-digit", minute: "2-digit" })}`
      : "📈 Pic en ligne : —",
  );
  lines.push(
    d.groqAvailability == null
      ? "⚡ Disponibilité API Groq : —"
      : `⚡ Disponibilité API Groq : ${(d.groqAvailability * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`,
  );
  lines.push(
    d.alerts.length
      ? `🚨 Alertes : ${d.alerts.length} (${d.alerts.map((a) => RULE_META[a.rule_key].label).join(", ")})`
      : "✅ Aucune alerte",
  );
  if (d.unavailable.length) lines.push(`⚠️ Données indisponibles : ${d.unavailable.join(", ")}`);
  return lines.join("\n");
}
```

Test « 3 412 vs 3 046 » : (3412 − 3046) / 3046 = 0,1201 → « 12 % » ✓. `formatParis` jour : « mardi 29 septembre » ✓.

- [ ] **Step 6: Tests** → `npx vitest run lib/digest.test.ts lib/noesis/queries.test.ts` : PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(digest): résumé quotidien (requête Noesis + texte Telegram)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Jobs planifiés — routes API + pg_cron

**Files:**
- Create: `lib/cron-auth.ts`, `lib/jobs.ts`, `app/api/collect/route.ts`, `app/api/health-check/route.ts`, `app/api/digest/route.ts`, `supabase/migrations/0002_cron.sql`
- Test: `lib/cron-auth.test.ts`

**Interfaces:**
- Consumes: tout ce qui précède (`buildSnapshot`, `runAlerts`, `sendTelegram`, `store.*`, `runNoesisSql`, `collectSql`/`mapCollect`, `daySummarySql`/`mapDaySummary`, `fetchApiRequests24h`, `checkGroqApi`, `probeGroqModel`, `latestProbes`, `limits`, `parisHour`, `parisDayBounds`, `peak`, `availability`, `buildDigest`, `settle`)
- Produces:
```ts
export function isCronAuthorized(req: Request, secret?: string): boolean;
type AlertRun = { opened: RuleKey[]; resolved: RuleKey[]; notifyErrors: string[] };
export async function runCollectJob(now?: Date): Promise<{ ok: true; errors: Record<string, string> | null; alerts: AlertRun }>;
export async function runHealthCheckJob(now?: Date): Promise<{ ok: true; stale: boolean; alerts: AlertRun }>;
export async function runDigestJob(opts: { now?: Date; force?: boolean }): Promise<{ ok: true; sent: boolean; skipped?: string }>;
```

- [ ] **Step 1: Écrire le test `lib/cron-auth.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";

const req = (auth?: string) => new Request("https://x/api/collect", { method: "POST", headers: auth ? { Authorization: auth } : {} });

describe("isCronAuthorized", () => {
  it("accepte le bon secret", () => expect(isCronAuthorized(req("Bearer s3cret"), "s3cret")).toBe(true));
  it("refuse un mauvais secret", () => expect(isCronAuthorized(req("Bearer nope"), "s3cret")).toBe(false));
  it("refuse sans en-tête", () => expect(isCronAuthorized(req(), "s3cret")).toBe(false));
  it("refuse si aucun secret n'est configuré", () => expect(isCronAuthorized(req("Bearer "), "")).toBe(false));
});
```

- [ ] **Step 2: Lancer (doit échouer)**, puis implémenter `lib/cron-auth.ts`

```ts
import { timingSafeEqual } from "node:crypto";

export function isCronAuthorized(req: Request, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
```
Run: `npx vitest run lib/cron-auth.test.ts` → PASS.

- [ ] **Step 3: Écrire `lib/jobs.ts`**

```ts
import "server-only";
import { runAlerts } from "@/lib/alerts/run";
import type { RuleContext } from "@/lib/alerts/rules";
import { sendTelegram } from "@/lib/alerts/telegram";
import { buildSnapshot } from "@/lib/collect";
import { buildDigest } from "@/lib/digest";
import { limits } from "@/lib/env";
import { runNoesisSql } from "@/lib/noesis/client";
import { collectSql, daySummarySql, mapCollect, mapDaySummary } from "@/lib/noesis/queries";
import { settle } from "@/lib/result";
import { checkGroqApi, probeGroqModel } from "@/lib/sources/groq";
import { fetchApiRequests24h } from "@/lib/sources/supabase-usage";
import { availability, peak } from "@/lib/stats";
import * as store from "@/lib/store";
import { parisDayBounds, parisHour } from "@/lib/time";

const RETENTION_DAYS = 90;

export async function runCollectJob(now: Date = new Date()) {
  const recent = await store.recentSnapshots(20);
  const out = await buildSnapshot({
    now,
    noesis: async () => mapCollect(await runNoesisSql(collectSql())),
    apiRequests24h: () => fetchApiRequests24h(),
    groqApi: () => checkGroqApi(),
    probe: (m) => probeGroqModel(m, { at: now }),
    recent,
    limits: limits(),
  });
  const saved = await store.insertSnapshot(out.snapshot);
  const ctx: RuleContext = {
    now,
    latest: saved,
    previous: recent[0] ?? null,
    probes: out.probes,
    ai2h: out.noesis?.ai2h ?? null,
    ai2hLastWeek: out.noesis?.ai2hLastWeek ?? null,
    lastSnapshotAt: saved.taken_at,
  };
  const alerts = await runAlerts({ rules: await store.getRules(), ctx, store, notify: (t) => sendTelegram(t) });
  await store.purgeSnapshots(new Date(now.getTime() - RETENTION_DAYS * 86400_000));
  return { ok: true as const, errors: out.snapshot.errors, alerts };
}

export async function runHealthCheckJob(now: Date = new Date()) {
  const [last, rules] = await Promise.all([store.lastSnapshotAt(), store.getRules()]);
  const ctx: RuleContext = {
    now, latest: null, previous: null, probes: {}, ai2h: null, ai2hLastWeek: null, lastSnapshotAt: last,
  };
  const alerts = await runAlerts({
    rules: rules.filter((r) => r.key === "collector_stale"),
    ctx,
    store,
    notify: (t) => sendTelegram(t),
  });
  const stale = !last || now.getTime() - new Date(last).getTime() > 15 * 60000;
  return { ok: true as const, stale, alerts };
}

/** Appelé à 6h et 7h UTC ; n'envoie qu'à 8h Paris (gère l'heure d'été/hiver), sauf force=1. */
export async function runDigestJob({ now = new Date(), force = false }: { now?: Date; force?: boolean }) {
  if (!force && parisHour(now) !== 8) return { ok: true as const, sent: false, skipped: "pas 8h à Paris" };
  const day = parisDayBounds(now, -1);
  const prev = parisDayBounds(now, -2);
  const [summary, snaps, alerts] = await Promise.all([
    settle(runNoesisSql(daySummarySql(day.from, day.to, prev.from)).then(mapDaySummary)),
    settle(store.snapshotsSince(day.from, day.to)),
    settle(store.alertsSince(day.from)),
  ]);
  const unavailable: string[] = [];
  if (!summary.ok) unavailable.push("activité Noesis");
  if (!snaps.ok) unavailable.push("relevés");
  if (!alerts.ok) unavailable.push("alertes");
  const s = snaps.ok ? snaps.data : [];
  const text = buildDigest({
    day: day.from,
    summary: summary.ok ? summary.data : null,
    peak: peak(s),
    groqAvailability: availability(s.map((x) => x.groq?.api.ok)),
    alerts: alerts.ok ? alerts.data.filter((a) => new Date(a.opened_at) < day.to) : [],
    unavailable,
  });
  await sendTelegram(text);
  return { ok: true as const, sent: true };
}

```

- [ ] **Step 4: Écrire les routes**

`app/api/collect/route.ts` :
```ts
import { isCronAuthorized } from "@/lib/cron-auth";
import { runCollectJob } from "@/lib/jobs";
import { errorMessage } from "@/lib/result";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: "Non autorisé" }, { status: 401 });
  try {
    return Response.json(await runCollectJob());
  } catch (e) {
    console.error("[collect]", errorMessage(e));
    return Response.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
```

`app/api/health-check/route.ts` :
```ts
import { isCronAuthorized } from "@/lib/cron-auth";
import { runHealthCheckJob } from "@/lib/jobs";
import { errorMessage } from "@/lib/result";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: "Non autorisé" }, { status: 401 });
  try {
    return Response.json(await runHealthCheckJob());
  } catch (e) {
    console.error("[health-check]", errorMessage(e));
    return Response.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
```

`app/api/digest/route.ts` :
```ts
import { isCronAuthorized } from "@/lib/cron-auth";
import { runDigestJob } from "@/lib/jobs";
import { errorMessage } from "@/lib/result";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: "Non autorisé" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    return Response.json(await runDigestJob({ force }));
  } catch (e) {
    console.error("[digest]", errorMessage(e));
    return Response.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
```

- [ ] **Step 5: Écrire `supabase/migrations/0002_cron.sql`**

```sql
-- À exécuter dans la base PULSE après avoir activé les extensions pg_cron et pg_net
-- et créé les 2 secrets Vault (voir README) :
--   select vault.create_secret('https://<ton-domaine-vercel>', 'pulse_url');
--   select vault.create_secret('<valeur de CRON_SECRET>', 'pulse_cron_secret');

create or replace function public.pulse_call(path text) returns void
language sql security definer set search_path = public as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'pulse_url') || path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pulse_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$;
revoke all on function public.pulse_call(text) from public, anon, authenticated;

select cron.schedule('pulse-collect',      '*/5 * * * *',  $$select public.pulse_call('/api/collect')$$);
select cron.schedule('pulse-health-check', '*/15 * * * *', $$select public.pulse_call('/api/health-check')$$);
select cron.schedule('pulse-digest',       '0 6,7 * * *',  $$select public.pulse_call('/api/digest')$$);
```

- [ ] **Step 6: Vérifier** → `npm test && npm run typecheck && npm run build` : OK.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(jobs): routes collect/health-check/digest protégées + planification pg_cron

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Authentification (lien magique, un seul email)

**Files:**
- Create: `lib/auth/allowed.ts`, `lib/supabase/server.ts`, `proxy.ts`, `app/login/page.tsx`, `app/login/actions.ts`, `components/login-form.tsx`, `app/auth/callback/route.ts`
- Test: `lib/auth/allowed.test.ts`

**Interfaces:**
- Consumes: `env`, `isDemo` (Task 2)
- Produces: `isAllowedEmail(email: string, allowed: string): boolean` ; `supabaseServer(): Promise<SupabaseClient>` ; `requireUser(): Promise<{ email: string }>` (redirige vers `/login` sinon) ; server action `sendMagicLink(prev: LoginState, fd: FormData): Promise<LoginState>` avec `type LoginState = { sent: boolean }`

Lire d'abord `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` et `.../02-guides/authentication.md`.

- [ ] **Step 1: Test + implémentation de `isAllowedEmail`**

`lib/auth/allowed.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "./allowed";

describe("isAllowedEmail", () => {
  it("insensible à la casse et aux espaces", () => expect(isAllowedEmail(" Clem@Mail.com ", "clem@mail.com")).toBe(true));
  it("refuse un autre email", () => expect(isAllowedEmail("x@mail.com", "clem@mail.com")).toBe(false));
  it("refuse si aucun email n'est configuré", () => expect(isAllowedEmail("", "")).toBe(false));
});
```
Run → FAIL, puis `lib/auth/allowed.ts` :
```ts
export function isAllowedEmail(email: string, allowed: string): boolean {
  const a = allowed.trim().toLowerCase();
  return a.length > 0 && email.trim().toLowerCase() === a;
}
```
Run → PASS.

- [ ] **Step 2: `lib/supabase/server.ts`**

```ts
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/auth/allowed";
import { env, isDemo } from "@/lib/env";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.pulseUrl, env.pulseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* appelé depuis un Server Component : le proxy rafraîchit la session */
        }
      },
    },
  });
}

/** À appeler en tête de chaque layout/page/server action protégé. */
export async function requireUser(): Promise<{ email: string }> {
  if (isDemo()) return { email: "demo@local" };
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const email = data.user?.email ?? "";
  if (!isAllowedEmail(email, env.allowedEmail)) redirect("/login");
  return { email };
}
```

- [ ] **Step 3: `proxy.ts` (racine)**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth/allowed";
import { isDemo } from "@/lib/env";

// Sans session : pages de connexion + routes appelées par pg_cron (protégées par CRON_SECRET).
const PUBLIC = ["/login", "/auth/callback", "/api/collect", "/api/digest", "/api/health-check"];

export async function proxy(req: NextRequest) {
  if (isDemo()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_PULSE_SUPABASE_URL!, process.env.NEXT_PUBLIC_PULSE_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await sb.auth.getUser();
  if (isAllowedEmail(data.user?.email ?? "", process.env.ALLOWED_EMAIL ?? "")) return res;

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
```

- [ ] **Step 4: Connexion**

`app/login/actions.ts` :
```ts
"use server";

import { headers } from "next/headers";
import { isAllowedEmail } from "@/lib/auth/allowed";
import { env } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export type LoginState = { sent: boolean };

/** Réponse identique que l'email soit autorisé ou non (on ne révèle rien). */
export async function sendMagicLink(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get("email") ?? "").trim();
  if (isAllowedEmail(email, env.allowedEmail)) {
    const h = await headers();
    const origin = h.get("origin") ?? `https://${h.get("host")}`;
    const sb = await supabaseServer();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) console.error("[login] envoi du lien :", error.message);
  }
  return { sent: true };
}
```

`components/login-form.tsx` :
```tsx
"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "@/app/login/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { sent: false });
  if (state.sent) {
    return <p className="rounded-xl bg-mint p-4 text-sm">Si cette adresse est autorisée, un lien de connexion vient d&apos;être envoyé. Vérifie ta boîte mail.</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">Email</label>
      <input id="email" name="email" type="email" required autoComplete="email"
        className="rounded-xl border border-ink/15 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-violet" />
      <button disabled={pending} className="rounded-xl bg-ink px-4 py-3 font-semibold text-white disabled:opacity-60">
        {pending ? "Envoi…" : "Recevoir un lien de connexion"}
      </button>
    </form>
  );
}
```

`app/login/page.tsx` :
```tsx
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isDemo } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  if (isDemo()) redirect("/");
  const { erreur } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2 text-lg font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-rose text-white">◆</span>
          Noesis Pulse
        </div>
        <h1 className="mb-1 text-xl font-bold">Connexion</h1>
        <p className="mb-6 text-sm text-ink/60">Espace privé. On t&apos;envoie un lien par email.</p>
        {erreur && <p className="mb-4 rounded-xl bg-blush p-3 text-sm">Lien invalide ou expiré, recommence.</p>}
        <LoginForm />
      </div>
    </main>
  );
}
```

`app/auth/callback/route.ts` :
```ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", url.origin));
  }
  return NextResponse.redirect(new URL("/login?erreur=1", url.origin));
}
```

- [ ] **Step 5: Vérifier** → `npm test && npm run typecheck && npm run build` : OK.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): lien magique Supabase, un seul email autorisé, proxy de protection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 14: Couche de données des pages + mode démo

**Files:**
- Create: `lib/data/types.ts`, `lib/data/derive.ts`, `lib/data/memo.ts`, `lib/demo.ts`, `lib/data/overview.ts`, `lib/data/users.ts`, `lib/data/apis.ts`, `lib/data/alerts.ts`, `lib/data/meta.ts`
- Test: `lib/data/derive.test.ts`, `lib/data/memo.test.ts`, `lib/demo.test.ts`

**Interfaces:**
- Consumes: `Result`, `settle` (Task 1) ; types, `periodRange`, `parisDayBounds`, `peak`, `availability` (Task 2) ; `runNoesisSql` + requêtes/mappers (Tasks 4-5) ; `latestProbes` (Task 6) ; `store.*` (Task 7) ; `isDemo`
- Produces (`lib/data/types.ts`) :
```ts
export type Pt = { t: number; n: number | null };   // t = epoch ms (sérialisable vers les composants client)
export type OverviewSnaps = { last: Snapshot | null; online: Pt[]; peakToday: { value: number; at: string } | null; probes: Record<string, GroqModelProbe | null> };
export type OverviewData = {
  period: Period; label: string; hours: number; bucket: "hour" | "day";
  snaps: Result<OverviewSnaps>; kpis: Result<Kpis>; series: Result<SeriesPoint[]>;
  byFeature: Result<FeatureCount[]>; signups: Result<Signup[]>;
};
export type LatencyRow = { t: number; api: number | null; primary: number | null; fallback: number | null };
export type StorageRow = { t: number; db: number | null; storage: number | null };
export type ApisDerived = {
  latency: LatencyRow[]; storage: StorageRow[];
  availability: { api: number | null; primary: number | null; fallback: number | null };
  latestSupabase: SupabaseUsage | null; probes: Record<string, GroqModelProbe | null>;
  collectErrors: { at: string; errors: Record<string, string> }[];
};
export type ApisData = { label: string; derived: Result<ApisDerived>; docErrors: Result<number> };
export type AlertsPageData = { rules: Result<AlertRule[]>; alerts: Result<Alert[]> };
```
- Produces (`lib/data/derive.ts`, pur) : `downsample<T>(xs: T[], max: number): T[]`, `deriveOverviewSnaps(snaps: Snapshot[], now: Date): OverviewSnaps`, `deriveApis(snaps: Snapshot[], maxPoints?: number): ApisDerived`
- Produces (`lib/data/memo.ts`) : `memo<T>(key: string, ttlMs: number, fn: () => Promise<T>, now?: number): Promise<T>`, `clearMemo(): void`
- Produces (`lib/demo.ts`) : `demoSnapshots(from: Date, to: Date): Snapshot[]`, `demo.overview(period, now): OverviewData`, `demo.users(): UserRow[]`, `demo.userDetail(id): UserDetail | null`, `demo.apis(period, now): ApisData`, `demo.alertsPage(): AlertsPageData`, `demo.lastSnapshotAt(now): string`
- Produces (pages) : `getOverview(period: Period): Promise<OverviewData>`, `getUsers(): Promise<Result<UserRow[]>>`, `getUserDetail(id: string): Promise<Result<UserDetail | null>>`, `getApis(period: Period): Promise<ApisData>`, `getAlertsPage(): Promise<AlertsPageData>`, `getLastSnapshotAt(): Promise<string | null>`

Cache : les requêtes Noesis des pages passent par `memo(clé, 60_000, …)` (clé **sans** horodatage, ex. `kpis:7d`) pour ne pas relancer le SQL à chaque rafraîchissement.

- [ ] **Step 1: Écrire les tests**

`lib/data/memo.test.ts` :
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemo, memo } from "./memo";

beforeEach(() => clearMemo());

describe("memo", () => {
  it("réutilise la valeur pendant le TTL puis recalcule", async () => {
    const fn = vi.fn(async () => 1);
    await memo("k", 1000, fn, 0);
    await memo("k", 1000, fn, 500);
    expect(fn).toHaveBeenCalledTimes(1);
    await memo("k", 1000, fn, 1500);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("n'enregistre pas un échec", async () => {
    const bad = vi.fn(async () => {
      throw new Error("x");
    });
    await expect(memo("e", 1000, bad, 0)).rejects.toThrow("x");
    await new Promise((r) => setTimeout(r, 0));
    const good = vi.fn(async () => 2);
    expect(await memo("e", 1000, good, 10)).toBe(2);
  });
});
```

`lib/data/derive.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import type { GroqModelProbe, Snapshot } from "@/lib/types";
import { MODELS } from "@/lib/types";
import { deriveApis, deriveOverviewSnaps, downsample } from "./derive";

const probe = (ok: boolean, latencyMs: number, at: string): GroqModelProbe => ({
  ok, latencyMs, remainingRequests: 500, limitRequests: 1000, remainingTokens: null, limitTokens: null, probedAt: at,
});
const snap = (at: string, over: Partial<Snapshot> = {}): Snapshot => ({
  taken_at: at, online: 5, ai_requests_5m: 1, by_feature: null, errors: null,
  groq: { api: { ok: true, latencyMs: 100 }, models: { [MODELS.primary]: null, [MODELS.fallback]: null } },
  supabase: { apiRequests24h: 10, dbBytes: 1, dbLimitBytes: 10, storageBytes: 2, storageLimitBytes: 20 },
  ...over,
});

describe("downsample", () => {
  it("garde tout sous la limite", () => expect(downsample([1, 2, 3], 5)).toEqual([1, 2, 3]));
  it("réduit en gardant le premier et le dernier", () => {
    const out = downsample(Array.from({ length: 1000 }, (_, i) => i), 100);
    expect(out.length).toBe(100);
    expect(out[0]).toBe(0);
    expect(out[99]).toBe(999);
  });
});

describe("deriveOverviewSnaps", () => {
  it("dernier relevé, courbe, pic du jour (Paris) et sondes", () => {
    const now = new Date("2026-09-30T12:00:00Z"); // 14h Paris ; minuit Paris = 29/09 22:00Z
    const snaps = [
      snap("2026-09-29T21:00:00Z", { online: 40 }), // hier soir à Paris → exclu du pic du jour
      snap("2026-09-30T08:00:00Z", { online: 12, groq: { api: { ok: true, latencyMs: 1 }, models: { [MODELS.primary]: probe(true, 400, "2026-09-30T08:00:00Z") } } }),
      snap("2026-09-30T11:55:00Z", { online: 7 }),
    ];
    const d = deriveOverviewSnaps(snaps, now);
    expect(d.last?.online).toBe(7);
    expect(d.online).toEqual([
      { t: Date.parse("2026-09-29T21:00:00Z"), n: 40 },
      { t: Date.parse("2026-09-30T08:00:00Z"), n: 12 },
      { t: Date.parse("2026-09-30T11:55:00Z"), n: 7 },
    ]);
    expect(d.peakToday).toEqual({ value: 12, at: "2026-09-30T08:00:00Z" });
    expect(d.probes[MODELS.primary]?.latencyMs).toBe(400);
  });
});

describe("deriveApis", () => {
  it("disponibilités, latences fusionnées, stockage, erreurs", () => {
    const snaps = [
      snap("2026-09-30T10:00:00Z", {
        groq: { api: { ok: true, latencyMs: 100 }, models: { [MODELS.primary]: probe(true, 400, "2026-09-30T10:00:00Z"), [MODELS.fallback]: null } },
      }),
      snap("2026-09-30T10:05:00Z", {
        groq: { api: { ok: false, latencyMs: null, error: "x" }, models: { [MODELS.primary]: null, [MODELS.fallback]: probe(false, 0, "2026-09-30T10:05:00Z") } },
        errors: { groq_api: "x" },
      }),
    ];
    const d = deriveApis(snaps);
    expect(d.availability).toEqual({ api: 0.5, primary: 1, fallback: 0 });
    expect(d.latency).toEqual([
      { t: Date.parse("2026-09-30T10:00:00Z"), api: 100, primary: 400, fallback: null },
      { t: Date.parse("2026-09-30T10:05:00Z"), api: null, primary: null, fallback: null },
    ]);
    expect(d.storage[1]).toEqual({ t: Date.parse("2026-09-30T10:05:00Z"), db: 1, storage: 2 });
    expect(d.latestSupabase?.dbLimitBytes).toBe(10);
    expect(d.collectErrors).toEqual([{ at: "2026-09-30T10:05:00Z", errors: { groq_api: "x" } }]);
  });
});
```

`lib/demo.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { demo, demoSnapshots } from "./demo";

const now = new Date("2026-09-30T12:00:00Z");

describe("demo", () => {
  it("relevés déterministes toutes les 5 min", () => {
    const a = demoSnapshots(new Date("2026-09-30T11:00:00Z"), now);
    const b = demoSnapshots(new Date("2026-09-30T11:00:00Z"), now);
    expect(a.length).toBe(12);
    expect(a).toEqual(b);
  });
  it("overview complet et sans erreur", () => {
    const o = demo.overview("7d", now);
    expect(o.kpis.ok && o.series.ok && o.byFeature.ok && o.signups.ok && o.snaps.ok).toBe(true);
    if (o.series.ok) expect(o.series.data.length).toBeGreaterThanOrEqual(168);
  });
  it("utilisateurs et fiche", () => {
    const users = demo.users();
    expect(users.length).toBe(60);
    expect(demo.userDetail(users[0].id)?.user.id).toBe(users[0].id);
    expect(demo.userDetail("inconnu")).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer (doit échouer)** → `npx vitest run lib/data lib/demo.test.ts` : FAIL.

- [ ] **Step 3: Implémenter `lib/data/types.ts`** (contenu exact du bloc Interfaces, avec les imports `import type { Result } from "@/lib/result"; import type { FeatureCount, Kpis, SeriesPoint, Signup } from "@/lib/noesis/queries"; import type { Alert, AlertRule, GroqModelProbe, Period, Snapshot, SupabaseUsage } from "@/lib/types";`).

- [ ] **Step 4: Implémenter `lib/data/memo.ts`**

```ts
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

/** Cache mémoire par instance serveur ; un échec n'est jamais mis en cache. */
export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>, now: number = Date.now()): Promise<T> {
  const hit = cache.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn();
  cache.set(key, { at: now, value });
  value.catch(() => cache.delete(key));
  return value;
}

export function clearMemo(): void {
  cache.clear();
}
```

- [ ] **Step 5: Implémenter `lib/data/derive.ts`**

```ts
import { latestProbes } from "@/lib/sources/groq";
import { availability, peak } from "@/lib/stats";
import { parisDayBounds } from "@/lib/time";
import { MODELS } from "@/lib/types";
import type { Snapshot } from "@/lib/types";
import type { ApisDerived, LatencyRow, OverviewSnaps } from "./types";

const MODEL_LIST = [MODELS.primary, MODELS.fallback];

export function downsample<T>(xs: T[], max: number): T[] {
  if (xs.length <= max) return xs;
  const step = xs.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(xs[Math.floor(i * step)]);
  out[out.length - 1] = xs[xs.length - 1];
  return out;
}

export function deriveOverviewSnaps(snaps: Snapshot[], now: Date): OverviewSnaps {
  const today = parisDayBounds(now, 0).from.getTime();
  return {
    last: snaps.at(-1) ?? null,
    online: snaps.map((s) => ({ t: Date.parse(s.taken_at), n: s.online })),
    peakToday: peak(snaps.filter((s) => Date.parse(s.taken_at) >= today)),
    probes: latestProbes(snaps, MODEL_LIST),
  };
}

export function deriveApis(snaps: Snapshot[], maxPoints = 300): ApisDerived {
  const probeRows: LatencyRow[] = [];
  for (const s of snaps) {
    const p = s.groq?.models?.[MODELS.primary];
    const f = s.groq?.models?.[MODELS.fallback];
    if (p || f) {
      probeRows.push({
        t: Date.parse(s.taken_at), api: null,
        primary: p?.ok ? p.latencyMs : null,
        fallback: f?.ok ? f.latencyMs : null,
      });
    }
  }
  const apiRows: LatencyRow[] = snaps.map((s) => ({
    t: Date.parse(s.taken_at),
    api: s.groq?.api.ok ? s.groq.api.latencyMs : null,
    primary: null,
    fallback: null,
  }));
  // Fusion : une ligne par instant ; les sondes (rares) ne sont jamais écartées par le sous-échantillonnage.
  const byT = new Map<number, LatencyRow>();
  for (const r of downsample(apiRows, maxPoints)) byT.set(r.t, { ...r });
  for (const r of downsample(probeRows, maxPoints)) {
    const cur = byT.get(r.t);
    byT.set(r.t, cur ? { ...cur, primary: r.primary, fallback: r.fallback } : r);
  }

  const withErrors = snaps.filter((s) => s.errors && Object.keys(s.errors).length);
  return {
    latency: [...byT.values()].sort((a, b) => a.t - b.t),
    storage: downsample(snaps, maxPoints).map((s) => ({
      t: Date.parse(s.taken_at), db: s.supabase?.dbBytes ?? null, storage: s.supabase?.storageBytes ?? null,
    })),
    availability: {
      api: availability(snaps.map((s) => s.groq?.api.ok)),
      primary: availability(snaps.map((s) => s.groq?.models?.[MODELS.primary]?.ok)),
      fallback: availability(snaps.map((s) => s.groq?.models?.[MODELS.fallback]?.ok)),
    },
    latestSupabase: [...snaps].reverse().find((s) => s.supabase)?.supabase ?? null,
    probes: latestProbes(snaps, MODEL_LIST),
    collectErrors: withErrors.slice(-10).reverse().map((s) => ({ at: s.taken_at, errors: s.errors! })),
  };
}
```

- [ ] **Step 6: Implémenter `lib/demo.ts`**

```ts
import { deriveApis, deriveOverviewSnaps } from "@/lib/data/derive";
import type { AlertsPageData, ApisData, OverviewData } from "@/lib/data/types";
import type { FeatureCount, SeriesPoint, UserDetail, UserRow } from "@/lib/noesis/queries";
import { periodRange } from "@/lib/period";
import { parisHour } from "@/lib/time";
import { MODELS } from "@/lib/types";
import type { Alert, AlertRule, FeatureKey, GroqModelProbe, Period, Snapshot } from "@/lib/types";

const STEP = 5 * 60_000;
const MB = 1024 * 1024;

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Courbe d'activité d'une journée : creux la nuit, pic en soirée. */
function activity(d: Date): number {
  const h = parisHour(d) + d.getUTCMinutes() / 60;
  return h < 7 ? 0.05 : Math.max(0.05, Math.sin(((h - 7) / 16) * Math.PI));
}

export function demoSnapshots(from: Date, to: Date): Snapshot[] {
  const out: Snapshot[] = [];
  for (let t = Math.ceil(from.getTime() / STEP) * STEP; t < to.getTime(); t += STEP) {
    const r = rng(t / STEP);
    const d = new Date(t);
    const a = activity(d);
    const ai = Math.round(a * 60 + r() * 10);
    const chat = Math.round(ai * 0.52);
    const debates = Math.round(ai * 0.21);
    const minuteOfDay = Math.floor(t / 60000) % 1440;
    const apiOk = r() > 0.004;
    const probeOf = (base: number): GroqModelProbe => {
      const ok = r() > 0.01;
      return {
        ok, latencyMs: Math.round(base + r() * base * 0.6),
        remainingRequests: Math.round(1000 * (1 - (minuteOfDay / 1440) * 0.7)), limitRequests: 1000,
        remainingTokens: 7000, limitTokens: 8000, probedAt: d.toISOString(), ...(ok ? {} : { error: "HTTP 503" }),
      };
    };
    const day = t / 86400_000;
    out.push({
      id: t / STEP,
      taken_at: d.toISOString(),
      online: Math.round(a * 26 + r() * 4),
      ai_requests_5m: ai,
      by_feature: { chat, debates, challenges: ai - chat - debates, documents: r() > 0.8 ? 1 : 0 },
      groq: {
        api: apiOk ? { ok: true, latencyMs: Math.round(60 + r() * 80) } : { ok: false, latencyMs: null, error: "HTTP 503" },
        models: {
          [MODELS.primary]: minuteOfDay % 30 === 0 ? probeOf(420) : null,
          [MODELS.fallback]: minuteOfDay % 60 === 0 ? probeOf(180) : null,
        },
      },
      supabase: {
        apiRequests24h: Math.round(40000 + r() * 10000),
        dbBytes: Math.round((200 + (day % 100) * 0.3) * MB), dbLimitBytes: 500 * MB,
        storageBytes: Math.round((700 + (day % 100) * 0.8) * MB), storageLimitBytes: 1024 * MB,
      },
      errors: apiOk ? null : { groq_api: "HTTP 503" },
    });
  }
  return out;
}

const FIRST = ["lea", "tom", "ines", "hugo", "chloe", "yanis", "manon", "lucas", "sarah", "nathan", "jade", "adam"];
const LAST = ["martin", "bernard", "dubois", "robert", "richard"];
const FEATS: FeatureKey[] = ["chat", "debates", "challenges", "documents"];
const DEMO_NOW = Date.parse("2026-09-30T12:00:00Z");

function makeUsers(): UserRow[] {
  const r = rng(42);
  return Array.from({ length: 60 }, (_, i) => {
    const created = DEMO_NOW - Math.floor(r() * 90) * 86400_000 - Math.floor(r() * 86400_000);
    const last = r() > 0.2 ? DEMO_NOW - Math.floor(r() * 10 * 86400_000) : null;
    return {
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      email: `${FIRST[i % FIRST.length]}.${LAST[i % LAST.length]}${i}@exemple.fr`,
      createdAt: new Date(created).toISOString(),
      lastSignInAt: last ? new Date(last).toISOString() : null,
      lastActivity: last ? new Date(last + 600_000).toISOString() : null,
      aiRequests: last ? Math.floor(r() * 400) : 0,
      features: last ? FEATS.filter(() => r() > 0.4) : [],
    };
  }).sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
}

function bucketize(snaps: Snapshot[], bucket: "hour" | "day"): SeriesPoint[] {
  const size = bucket === "hour" ? 3600_000 : 86400_000;
  const map = new Map<number, number>();
  for (const s of snaps) {
    const k = Math.floor(Date.parse(s.taken_at) / size) * size;
    map.set(k, (map.get(k) ?? 0) + (s.ai_requests_5m ?? 0));
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([t, n]) => ({ t: new Date(t).toISOString(), n }));
}

const DEFAULT_RULES: AlertRule[] = [
  { key: "activity_drop", enabled: true, threshold: 0, params: { startHour: 8, endHour: 23, minLastWeek: 5 } },
  { key: "collector_stale", enabled: true, threshold: 15, params: {} },
  { key: "groq_down", enabled: true, threshold: 1, params: {} },
  { key: "groq_quota", enabled: true, threshold: 0.8, params: {} },
  { key: "groq_slow", enabled: true, threshold: 5000, params: {} },
  { key: "supabase_db", enabled: true, threshold: 0.8, params: {} },
  { key: "supabase_storage", enabled: true, threshold: 0.8, params: {} },
];

export const demo = {
  lastSnapshotAt(now: Date): string {
    return new Date(Math.floor(now.getTime() / STEP) * STEP).toISOString();
  },

  overview(period: Period, now: Date): OverviewData {
    const r = periodRange(period, now);
    const all = demoSnapshots(r.prevFrom, now);
    const cur = all.filter((s) => Date.parse(s.taken_at) >= r.from.getTime());
    const sum = (xs: Snapshot[]) => xs.reduce((a, s) => a + (s.ai_requests_5m ?? 0), 0);
    const users = makeUsers();
    const f = cur.reduce(
      (acc, s) => {
        for (const k of FEATS) acc[k] += s.by_feature?.[k] ?? 0;
        return acc;
      },
      { chat: 0, debates: 0, challenges: 0, documents: 0 } as Record<FeatureKey, number>,
    );
    const byFeature: FeatureCount[] = [
      { feature: "chat", mode: "coach", n: Math.round(f.chat * 0.7) },
      { feature: "chat", mode: "debate", n: Math.round(f.chat * 0.3) },
      { feature: "debates", mode: null, n: f.debates },
      { feature: "challenges", mode: null, n: f.challenges },
      { feature: "documents", mode: null, n: f.documents },
    ];
    const last24 = all.filter((s) => Date.parse(s.taken_at) >= now.getTime() - 24 * 3600_000);
    return {
      period, label: r.label, hours: r.hours, bucket: r.bucket,
      snaps: { ok: true, data: deriveOverviewSnaps(last24, now) },
      kpis: {
        ok: true,
        data: {
          aiCount: sum(cur), aiPrev: sum(all) - sum(cur), usersTotal: users.length,
          usersNew: users.filter((u) => Date.parse(u.createdAt) >= r.from.getTime()).length,
          activePeriod: users.filter((u) => u.lastActivity && Date.parse(u.lastActivity) >= r.from.getTime()).length,
          active7d: users.filter((u) => u.lastActivity && Date.parse(u.lastActivity) >= now.getTime() - 7 * 86400_000).length,
          docErrors: 2,
        },
      },
      series: { ok: true, data: bucketize(cur, r.bucket) },
      byFeature: { ok: true, data: byFeature },
      signups: {
        ok: true,
        data: [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
          .map((u) => ({ id: u.id, email: u.email, createdAt: u.createdAt })),
      },
    };
  },

  users(): UserRow[] {
    return makeUsers();
  },

  userDetail(id: string): UserDetail | null {
    const user = makeUsers().find((u) => u.id === id);
    if (!user) return null;
    const r = rng(id.length + Number(id.slice(-4)));
    const daily = Array.from({ length: 31 }, (_, i) => {
      const actions = Math.floor(r() * 15);
      return { day: new Date(DEMO_NOW - (30 - i) * 86400_000).toISOString(), actions, ai: actions + Math.floor(r() * 3) };
    });
    return {
      user,
      documents: Math.floor(r() * 6),
      daily,
      features: user.features.filter((f) => f !== "documents").map((feature) => ({ feature, n: Math.floor(r() * 120) + 1 })),
      skills: ["argumentation", "esprit critique", "logique", "synthèse"].map((skill) => ({
        skill, avg: 40 + Math.floor(r() * 55), n: 1 + Math.floor(r() * 12),
      })),
    };
  },

  apis(period: Period, now: Date): ApisData {
    const r = periodRange(period, now);
    return { label: r.label, derived: { ok: true, data: deriveApis(demoSnapshots(r.from, now)) }, docErrors: { ok: true, data: 2 } };
  },

  alertsPage(): AlertsPageData {
    const alerts: Alert[] = [
      { id: 4, rule_key: "supabase_storage", opened_at: "2026-09-30T09:12:00Z", resolved_at: null, message: "⚠️ Stockage Noesis à 82 % (840 Mo / 1 Go)" },
      { id: 3, rule_key: "groq_slow", opened_at: "2026-09-29T20:30:00Z", resolved_at: "2026-09-29T21:00:00Z", message: "🐢 Groq gpt-oss-120b lent : 6,2 s (seuil 5 s)" },
      { id: 2, rule_key: "groq_down", opened_at: "2026-09-28T14:05:00Z", resolved_at: "2026-09-28T14:15:00Z", message: "🔴 API Groq injoignable depuis 2 relevés (HTTP 503)" },
      { id: 1, rule_key: "activity_drop", opened_at: "2026-09-27T10:00:00Z", resolved_at: "2026-09-27T11:30:00Z", message: "📉 0 demande IA en 2 h (14 la semaine dernière à la même heure)" },
    ];
    return { rules: { ok: true, data: DEFAULT_RULES }, alerts: { ok: true, data: alerts } };
  },
};
```

- [ ] **Step 7: Implémenter les accès réels**

`lib/data/meta.ts` :
```ts
import "server-only";
import { demo } from "@/lib/demo";
import { isDemo } from "@/lib/env";
import * as store from "@/lib/store";

export async function getLastSnapshotAt(): Promise<string | null> {
  if (isDemo()) return demo.lastSnapshotAt(new Date());
  try {
    return await store.lastSnapshotAt();
  } catch {
    return null;
  }
}
```

`lib/data/overview.ts` :
```ts
import "server-only";
import { demo } from "@/lib/demo";
import { isDemo } from "@/lib/env";
import { runNoesisSql } from "@/lib/noesis/client";
import {
  aiSeriesSql, byFeatureSql, kpiSql, latestSignupsSql, mapByFeature, mapKpis, mapSeries, mapSignups,
} from "@/lib/noesis/queries";
import { periodRange } from "@/lib/period";
import { settle } from "@/lib/result";
import * as store from "@/lib/store";
import type { Period } from "@/lib/types";
import { deriveOverviewSnaps } from "./derive";
import { memo } from "./memo";
import type { OverviewData } from "./types";

const TTL = 60_000;

export async function getOverview(period: Period): Promise<OverviewData> {
  const now = new Date();
  if (isDemo()) return demo.overview(period, now);
  const r = periodRange(period, now);
  const [snaps, kpis, series, byFeature, signups] = await Promise.all([
    settle(store.snapshotsSince(new Date(now.getTime() - 24 * 3600_000), now).then((s) => deriveOverviewSnaps(s, now))),
    settle(memo(`kpis:${period}`, TTL, async () => mapKpis(await runNoesisSql(kpiSql(r.from, r.prevFrom))))),
    settle(memo(`series:${period}`, TTL, async () => mapSeries(await runNoesisSql(aiSeriesSql(r.from, r.to, r.bucket))))),
    settle(memo(`features:${period}`, TTL, async () => mapByFeature(await runNoesisSql(byFeatureSql(r.from))))),
    settle(memo("signups", TTL, async () => mapSignups(await runNoesisSql(latestSignupsSql(5))))),
  ]);
  return { period, label: r.label, hours: r.hours, bucket: r.bucket, snaps, kpis, series, byFeature, signups };
}
```

`lib/data/users.ts` :
```ts
import "server-only";
import { demo } from "@/lib/demo";
import { isDemo } from "@/lib/env";
import { runNoesisSql } from "@/lib/noesis/client";
import { mapUserDetail, mapUsers, userDetailSql, usersListSql, type UserDetail, type UserRow } from "@/lib/noesis/queries";
import { isUuid } from "@/lib/noesis/sql";
import { settle, type Result } from "@/lib/result";
import { memo } from "./memo";

export async function getUsers(): Promise<Result<UserRow[]>> {
  if (isDemo()) return { ok: true, data: demo.users() };
  return settle(memo("users", 60_000, async () => mapUsers(await runNoesisSql(usersListSql()))));
}

export async function getUserDetail(id: string): Promise<Result<UserDetail | null>> {
  if (isDemo()) return { ok: true, data: demo.userDetail(id) };
  if (!isUuid(id)) return { ok: true, data: null };
  return settle(memo(`user:${id}`, 60_000, async () => mapUserDetail(await runNoesisSql(userDetailSql(id)))));
}
```

`lib/data/apis.ts` :
```ts
import "server-only";
import { demo } from "@/lib/demo";
import { isDemo } from "@/lib/env";
import { runNoesisSql } from "@/lib/noesis/client";
import { kpiSql, mapKpis } from "@/lib/noesis/queries";
import { periodRange } from "@/lib/period";
import { settle } from "@/lib/result";
import * as store from "@/lib/store";
import type { Period } from "@/lib/types";
import { deriveApis } from "./derive";
import { memo } from "./memo";
import type { ApisData } from "./types";

export async function getApis(period: Period): Promise<ApisData> {
  const now = new Date();
  if (isDemo()) return demo.apis(period, now);
  const r = periodRange(period, now);
  const [derived, docErrors] = await Promise.all([
    settle(store.snapshotsSince(r.from, now).then((s) => deriveApis(s))),
    settle(memo(`kpis:${period}`, 60_000, async () => mapKpis(await runNoesisSql(kpiSql(r.from, r.prevFrom)))).then((k) => k.docErrors)),
  ]);
  return { label: r.label, derived, docErrors };
}
```

`lib/data/alerts.ts` :
```ts
import "server-only";
import { demo } from "@/lib/demo";
import { isDemo } from "@/lib/env";
import { settle } from "@/lib/result";
import * as store from "@/lib/store";
import type { AlertsPageData } from "./types";

export async function getAlertsPage(): Promise<AlertsPageData> {
  if (isDemo()) return demo.alertsPage();
  const [rules, alerts] = await Promise.all([settle(store.getRules()), settle(store.recentAlerts(50))]);
  return { rules, alerts };
}
```

Note : `lib/demo.ts` n'importe **pas** `server-only` ni `store` → testable sous Vitest.

- [ ] **Step 8: Tests et types** → `npm test && npm run typecheck` : PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(data): couche de données des pages, cache 60 s, mode démo déterministe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Coque de l'interface (navigation, période, rafraîchissement, tuiles, graphiques)

**Files:**
- Create: `app/(dash)/layout.tsx`, `components/nav.tsx`, `components/period-select.tsx`, `components/auto-refresh.tsx`, `components/bento/tile.tsx`, `components/bento/stat.tsx`, `components/bento/feature-bar.tsx`, `components/bento/health-row.tsx`, `components/charts/tip.tsx`, `components/charts/area-spark.tsx`, `components/charts/bars.tsx`, `components/charts/lines.tsx`, `.claude/launch.json`
- Delete: `app/page.tsx` (remplacé par `app/(dash)/page.tsx` en Task 16 — le supprimer dans cette tâche et créer un `app/(dash)/page.tsx` minimal pour garder `/` fonctionnel)

**Interfaces:**
- Consumes: `requireUser` (Task 13), `getLastSnapshotAt` (Task 14), `parsePeriod`, `PERIODS`, format (Task 2)
- Produces (composants réutilisés par les pages) :
```tsx
type Tone = "white" | "sun" | "mint" | "sky" | "blush" | "ink" | "hero" | "muted";
<Tile tone? className? title?>{children}</Tile>
<Unavailable error={string} />
<Stat value={string} sub?={ReactNode} size?={"md" | "xl"} pulse?={boolean} />
<FeatureBar counts={{ feature: FeatureKey; n: number }[]} />      // agrège par feature
<HealthRow label={string} value={string} status={"ok" | "warn" | "bad" | "unknown"} />
<AreaSpark data={Pt[]} color?={string} height?={number} />
<Bars data={{ t: number; n: number }[]} bucket={"hour" | "day"} height?={number} />
<Lines data={Record<string, number | null>[]} series={{ key: string; label: string; color: string }[]} fmt={"ms" | "bytes" | "int" | "pct"} height?={number} />
export const FEATURE_LABEL: Record<FeatureKey, string>; export const FEATURE_COLOR: Record<FeatureKey, string>;
```
Tous les graphiques reçoivent des `t` en **millisecondes** et formatent eux-mêmes (on ne passe jamais de fonction d'un Server Component à un Client Component).

- [ ] **Step 1: `components/bento/tile.tsx`**

```tsx
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
```

- [ ] **Step 2: `components/bento/stat.tsx`, `feature-bar.tsx`, `health-row.tsx`**

`stat.tsx` :
```tsx
import type { ReactNode } from "react";

export function Stat({ value, sub, size = "md", pulse = false }: { value: string; sub?: ReactNode; size?: "md" | "xl"; pulse?: boolean }) {
  return (
    <div>
      <div className={`flex items-center gap-2 font-extrabold leading-none ${size === "xl" ? "text-7xl" : "text-4xl"}`}>
        {pulse && <span className="pulse-dot inline-block h-3 w-3 rounded-full bg-ok" aria-hidden />}
        {value}
      </div>
      {sub && <div className="mt-2 text-sm opacity-75">{sub}</div>}
    </div>
  );
}
```

`feature-bar.tsx` :
```tsx
import { formatInt, formatPct } from "@/lib/format";
import type { FeatureKey } from "@/lib/types";

export const FEATURE_LABEL: Record<FeatureKey, string> = { chat: "Chat", debates: "Débats", challenges: "Défis", documents: "Documents" };
export const FEATURE_COLOR: Record<FeatureKey, string> = { chat: "#7c3aed", debates: "#db2777", challenges: "#f59e0b", documents: "#10b981" };

export function FeatureBar({ counts }: { counts: { feature: FeatureKey; n: number }[] }) {
  const totals = new Map<FeatureKey, number>();
  for (const c of counts) totals.set(c.feature, (totals.get(c.feature) ?? 0) + c.n);
  const rows = [...totals.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const sum = rows.reduce((a, [, n]) => a + n, 0);
  if (!sum) return <p className="text-sm opacity-60">Aucune activité sur la période.</p>;
  return (
    <div>
      <div className="my-3 flex h-5 overflow-hidden rounded-full">
        {rows.map(([f, n]) => (
          <span key={f} style={{ flex: n, background: FEATURE_COLOR[f] }} title={`${FEATURE_LABEL[f]} : ${formatInt(n)}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {rows.map(([f, n]) => (
          <li key={f} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: FEATURE_COLOR[f] }} />
            {FEATURE_LABEL[f]} <b>{formatPct(n / sum)}</b> <span className="opacity-60">({formatInt(n)})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`health-row.tsx` :
```tsx
export type Health = "ok" | "warn" | "bad" | "unknown";

const PILL: Record<Health, string> = {
  ok: "bg-ok text-green-950",
  warn: "bg-warn text-amber-950",
  bad: "bg-bad text-red-950",
  unknown: "bg-white/20 text-white",
};

export function HealthRow({ label, value, status }: { label: string; value: string; status: Health }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="opacity-90">{label}</span>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[status]}`}>{value}</span>
    </div>
  );
}

export function ratioHealth(r: number | null | undefined): Health {
  if (r == null) return "unknown";
  return r > 0.8 ? "bad" : r > 0.6 ? "warn" : "ok";
}

export function latencyHealth(ms: number | null | undefined, ok = true): Health {
  if (!ok) return "bad";
  if (ms == null) return "unknown";
  return ms > 5000 ? "bad" : ms > 2000 ? "warn" : "ok";
}
```

- [ ] **Step 3: Graphiques (client)**

`components/charts/tip.tsx` :
```tsx
"use client";

import { formatBytes, formatInt, formatParis } from "@/lib/format";

export type Fmt = "ms" | "bytes" | "int" | "pct";

export function fmtValue(v: number, fmt: Fmt): string {
  if (fmt === "ms") return v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s` : `${Math.round(v)} ms`;
  if (fmt === "bytes") return formatBytes(v);
  if (fmt === "pct") return `${Math.round(v * 100)} %`;
  return formatInt(v);
}

export function fmtTime(t: number, withDay: boolean): string {
  return formatParis(new Date(t).toISOString(), withDay ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
}

type TipProps = {
  active?: boolean;
  label?: number | string;
  payload?: { name?: string; value?: number | null; color?: string }[];
  fmt: Fmt;
};

export function ChartTip({ active, label, payload, fmt }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg">
      <div className="mb-1 opacity-70">{fmtTime(Number(label), true)}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name} : <b>{fmtValue(Number(p.value), fmt)}</b>
        </div>
      ))}
    </div>
  );
}
```

`components/charts/area-spark.tsx` :
```tsx
"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { Pt } from "@/lib/data/types";
import { ChartTip } from "./tip";

export function AreaSpark({ data, color = "#ffffff", height = 72 }: { data: Pt[]; color?: string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.45} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
          <Tooltip content={(p) => <ChartTip {...(p as object)} fmt="int" />} />
          <Area type="monotone" dataKey="n" name="En ligne" stroke={color} strokeWidth={2} fill="url(#spark-fill)" connectNulls isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

`components/charts/bars.tsx` :
```tsx
"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTip, fmtTime } from "./tip";

export function Bars({ data, bucket, height = 180 }: { data: { t: number; n: number }[]; bucket: "hour" | "day"; height?: number }) {
  const max = Math.max(0, ...data.map((d) => d.n));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis dataKey="t" tickFormatter={(t) => fmtTime(Number(t), bucket === "day")} tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip cursor={{ fill: "#7c3aed14" }} content={(p) => <ChartTip {...(p as object)} fmt="int" />} />
          <Bar dataKey="n" name="Demandes IA" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.t} fill={d.n === max && max > 0 ? "#db2777" : "#7c3aed"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

`components/charts/lines.tsx` :
```tsx
"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTip, fmtTime, fmtValue, type Fmt } from "./tip";

export function Lines({ data, series, fmt, height = 220 }: {
  data: Record<string, number | null>[];
  series: { key: string; label: string; color: string }[];
  fmt: Fmt;
  height?: number;
}) {
  const span = data.length > 1 ? Number(data.at(-1)!.t) - Number(data[0].t) : 0;
  const withDay = span > 36 * 3600_000;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1a103312" vertical={false} />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => fmtTime(Number(t), withDay)} tick={{ fontSize: 11 }} minTickGap={50} />
          <YAxis tickFormatter={(v) => fmtValue(Number(v), fmt)} tick={{ fontSize: 11 }} width={64} />
          <Tooltip content={(p) => <ChartTip {...(p as object)} fmt={fmt} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

Si TypeScript refuse `{...(p as object)}` pour `ChartTip`, typer via `(p) => <ChartTip active={p.active} label={p.label as number} payload={p.payload as TipPayload} fmt="int" />` en exportant `TipPayload` depuis `tip.tsx`. Vérifier la signature de `content` dans `node_modules/recharts/types/component/Tooltip.d.ts`.

- [ ] **Step 4: Navigation, période, rafraîchissement**

`components/period-select.tsx` :
```tsx
import Link from "next/link";
import { PERIODS } from "@/lib/period";
import type { Period } from "@/lib/types";

const LABEL: Record<Period, string> = { "24h": "24 h", "7d": "7 j", "30d": "30 j" };

export function PeriodSelect({ current, pathname }: { current: Period; pathname: string }) {
  return (
    <div className="flex rounded-full bg-white p-1 text-sm" role="group" aria-label="Période">
      {PERIODS.map((p) => (
        <Link key={p} href={p === "24h" ? pathname : `${pathname}?period=${p}`}
          className={`rounded-full px-3 py-1 ${p === current ? "bg-ink text-white" : "hover:bg-ink/5"}`}
          aria-current={p === current ? "true" : undefined}>
          {LABEL[p]}
        </Link>
      ))}
    </div>
  );
}
```

`components/nav.tsx` :
```tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { timeAgo } from "@/lib/format";
import { parsePeriod } from "@/lib/period";
import { PeriodSelect } from "./period-select";

const LINKS = [
  { href: "/", label: "Vue d'ensemble" },
  { href: "/users", label: "Utilisateurs" },
  { href: "/apis", label: "IA & APIs" },
  { href: "/alerts", label: "Alertes" },
];

export function Nav({ lastSnapshotAt }: { lastSnapshotAt: string | null }) {
  const pathname = usePathname();
  const period = parsePeriod(useSearchParams().get("period"));
  const q = period === "24h" ? "" : `?period=${period}`;
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <header className="flex flex-wrap items-center gap-2">
      <Link href={`/${q}`} className="mr-3 flex items-center gap-2 text-lg font-bold">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-rose text-white">◆</span>
        Noesis Pulse
      </Link>
      <nav className="flex flex-wrap gap-1.5 text-sm">
        {LINKS.map((l) => (
          <Link key={l.href} href={`${l.href}${q}`}
            className={`rounded-full px-3.5 py-1.5 ${active(l.href) ? "bg-ink text-white" : "bg-white hover:bg-white/70"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs opacity-60" suppressHydrationWarning>
          {lastSnapshotAt ? `Relevé ${timeAgo(lastSnapshotAt)}` : "Aucun relevé"}
        </span>
        {!pathname.startsWith("/alerts") && !/^\/users\/.+/.test(pathname) && <PeriodSelect current={period} pathname={pathname} />}
      </div>
    </header>
  );
}
```

`components/auto-refresh.tsx` :
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recharge les données serveur toutes les N secondes quand l'onglet est visible. */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
```

- [ ] **Step 5: Layout du tableau de bord + page `/` minimale**

`app/(dash)/layout.tsx` :
```tsx
import { Suspense, type ReactNode } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Nav } from "@/components/nav";
import { getLastSnapshotAt } from "@/lib/data/meta";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: ReactNode }) {
  await requireUser();
  const last = await getLastSnapshotAt();
  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
      <Suspense>
        <Nav lastSnapshotAt={last} />
      </Suspense>
      <AutoRefresh seconds={60} />
      <main className="mt-5">{children}</main>
    </div>
  );
}
```

Supprimer `app/page.tsx` puis créer `app/(dash)/page.tsx` provisoire :
```tsx
export default function OverviewPage() {
  return <p>Vue d&apos;ensemble — en construction</p>;
}
```

`.claude/launch.json` :
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "noesis-pulse", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3020 }
  ]
}
```

- [ ] **Step 6: Vérifier** → `npm run typecheck && npm run lint && npm run build` : OK. Puis créer `.env.local` avec `PULSE_DEMO=1`, lancer le dev server (preview `noesis-pulse`) et vérifier que `/` affiche la navigation sans erreur console.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): coque bento — navigation, période, rafraîchissement auto, tuiles et graphiques

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Page « Vue d'ensemble »

**Files:**
- Modify: `app/(dash)/page.tsx` (remplacer le provisoire)

**Interfaces:**
- Consumes: `getOverview` (Task 14), composants (Task 15), `parsePeriod`, `perHour`, `pctChange`, format (Task 2), `MODELS`

Maquette validée : grille 4 colonnes (1 en mobile, 2 en tablette). Chaque tuile grisée (`tone="muted"` + `<Unavailable>`) si sa source est en échec.

- [ ] **Step 1: Écrire `app/(dash)/page.tsx`**

```tsx
import Link from "next/link";
import { FeatureBar } from "@/components/bento/feature-bar";
import { HealthRow, latencyHealth, ratioHealth } from "@/components/bento/health-row";
import { Stat } from "@/components/bento/stat";
import { Tile, Unavailable } from "@/components/bento/tile";
import { AreaSpark } from "@/components/charts/area-spark";
import { Bars } from "@/components/charts/bars";
import { getOverview } from "@/lib/data/overview";
import { formatBytes, formatInt, formatParis, formatPct, maskEmail, timeAgo } from "@/lib/format";
import { parsePeriod } from "@/lib/period";
import { pctChange, perHour } from "@/lib/stats";
import { MODELS } from "@/lib/types";

function Trend({ cur, prev }: { cur: number; prev: number }) {
  const c = pctChange(cur, prev);
  if (c == null) return null;
  return <span className="font-semibold">{c >= 0 ? "▲" : "▼"} {formatPct(Math.abs(c))}</span>;
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const period = parsePeriod((await searchParams).period);
  const d = await getOverview(period);
  const { snaps, kpis, series, byFeature, signups } = d;
  const last = snaps.ok ? snaps.data.last : null;
  const primary = snaps.ok ? snaps.data.probes[MODELS.primary] : null;
  const fallback = snaps.ok ? snaps.data.probes[MODELS.fallback] : null;
  const quotaUsed = primary?.limitRequests && primary.remainingRequests != null ? 1 - primary.remainingRequests / primary.limitRequests : null;
  const sb = last?.supabase ?? null;

  return (
    <div className="grid auto-rows-[minmax(130px,auto)] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* En ligne */}
      <Tile tone={snaps.ok && last?.online != null ? "hero" : "muted"} className="lg:row-span-2" title="En ligne maintenant · estimation">
        {snaps.ok && last?.online != null ? (
          <>
            <Stat size="xl" pulse value={formatInt(last.online)}
              sub={snaps.data.peakToday ? `pic du jour : ${snaps.data.peakToday.value} à ${formatParis(snaps.data.peakToday.at, { hour: "2-digit", minute: "2-digit" })}` : "pas encore de pic aujourd'hui"} />
            <div className="mt-6">
              <AreaSpark data={snaps.data.online} />
            </div>
          </>
        ) : (
          <Unavailable error={snaps.ok ? "Aucun relevé récent" : snaps.error} />
        )}
      </Tile>

      {/* Demandes IA */}
      <Tile tone={kpis.ok ? "sun" : "muted"} title={`Demandes IA · ${d.label}`}>
        {kpis.ok ? (
          <Stat value={formatInt(kpis.data.aiCount)}
            sub={<>≈ {formatInt(perHour(kpis.data.aiCount, d.hours))} / h · <Trend cur={kpis.data.aiCount} prev={kpis.data.aiPrev} /></>} />
        ) : <Unavailable error={kpis.error} />}
      </Tile>

      {/* Utilisateurs */}
      <Tile tone={kpis.ok ? "mint" : "muted"} title="Utilisateurs">
        {kpis.ok ? <Stat value={formatInt(kpis.data.usersTotal)} sub={`+${formatInt(kpis.data.usersNew)} sur ${d.label}`} /> : <Unavailable error={kpis.error} />}
      </Tile>

      {/* Actifs */}
      <Tile tone={kpis.ok ? "sky" : "muted"} title="Actifs 7 jours">
        {kpis.ok ? (
          <Stat value={formatInt(kpis.data.active7d)}
            sub={`${kpis.data.usersTotal ? formatPct(kpis.data.active7d / kpis.data.usersTotal) : "—"} des inscrits · ${formatInt(kpis.data.activePeriod)} sur ${d.label}`} />
        ) : <Unavailable error={kpis.error} />}
      </Tile>

      {/* Histogramme */}
      <Tile tone={series.ok ? "white" : "muted"} className="sm:col-span-2 lg:col-span-3" title={`Demandes IA par ${d.bucket === "hour" ? "heure" : "jour"} · ${d.label}`}>
        {series.ok ? <Bars bucket={d.bucket} data={series.data.map((p) => ({ t: Date.parse(p.t), n: p.n }))} /> : <Unavailable error={series.error} />}
      </Tile>

      {/* Santé */}
      <Tile tone="ink" className="lg:row-span-2" title={<Link href="/apis" className="hover:underline">Santé des APIs →</Link>}>
        {snaps.ok ? (
          <div className="mt-1">
            <HealthRow label="API Groq" value={last?.groq?.api.ok ? `${last.groq.api.latencyMs} ms` : last?.groq ? "KO" : "—"}
              status={last?.groq ? latencyHealth(last.groq.api.latencyMs, last.groq.api.ok) : "unknown"} />
            <HealthRow label="gpt-oss-120b" value={primary ? (primary.ok ? `${primary.latencyMs} ms` : "échec") : "—"}
              status={primary ? latencyHealth(primary.latencyMs, primary.ok) : "unknown"} />
            <HealthRow label="gpt-oss-20b" value={fallback ? (fallback.ok ? `${fallback.latencyMs} ms` : "échec") : "—"}
              status={fallback ? latencyHealth(fallback.latencyMs, fallback.ok) : "unknown"} />
            <HealthRow label="Quota Groq / jour" value={quotaUsed == null ? "—" : `${formatPct(quotaUsed)} utilisé`} status={ratioHealth(quotaUsed)} />
            <HealthRow label="Requêtes Supabase 24 h" value={sb?.apiRequests24h == null ? "—" : formatInt(sb.apiRequests24h)} status={sb?.apiRequests24h == null ? "unknown" : "ok"} />
            <HealthRow label="Base de données" value={sb ? `${formatBytes(sb.dbBytes)} / ${formatBytes(sb.dbLimitBytes)}` : "—"}
              status={ratioHealth(sb ? sb.dbBytes / sb.dbLimitBytes : null)} />
            <HealthRow label="Stockage" value={sb ? `${formatBytes(sb.storageBytes)} / ${formatBytes(sb.storageLimitBytes)}` : "—"}
              status={ratioHealth(sb ? sb.storageBytes / sb.storageLimitBytes : null)} />
            {last?.errors && <p className="mt-3 text-xs text-bad">⚠ {Object.keys(last.errors).length} source(s) en erreur au dernier relevé</p>}
          </div>
        ) : <Unavailable error={snaps.error} />}
      </Tile>

      {/* Répartition */}
      <Tile tone={byFeature.ok ? "white" : "muted"} className="sm:col-span-2" title={`Par fonctionnalité · ${d.label}`}>
        {byFeature.ok ? <FeatureBar counts={byFeature.data} /> : <Unavailable error={byFeature.error} />}
      </Tile>

      {/* Derniers inscrits */}
      <Tile tone={signups.ok ? "blush" : "muted"} title="Derniers inscrits">
        {signups.ok ? (
          <ul className="space-y-1 text-sm">
            {signups.data.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <Link href={`/users/${s.id}`} className="truncate hover:underline">{maskEmail(s.email)}</Link>
                <span className="shrink-0 opacity-60" suppressHydrationWarning>{timeAgo(s.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : <Unavailable error={signups.error} />}
      </Tile>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier dans le navigateur (mode démo)**

Lancer la preview `noesis-pulse`, ouvrir `/`, `/?period=7d`, `/?period=30d`. Vérifier : aucune erreur console, 8 tuiles visibles, histogramme rempli, la tuile « En ligne » pulse, redimensionner en mobile (375 px) → une colonne sans défilement horizontal. Capture d'écran.

- [ ] **Step 3: `npm run typecheck && npm run lint`** → OK.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): page Vue d'ensemble en bento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Pages Utilisateurs (liste + fiche)

**Files:**
- Create: `components/users-table.tsx`, `app/(dash)/users/page.tsx`, `app/(dash)/users/[id]/page.tsx`

**Interfaces:**
- Consumes: `getUsers`, `getUserDetail` (Task 14), `UserRow`, `UserDetail` (Task 5), composants (Task 15), `FEATURE_LABEL`, `FEATURE_COLOR`

La liste affiche l'email **complet** (spec §10) ; aucune donnée de contenu.

- [ ] **Step 1: `components/users-table.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FEATURE_COLOR, FEATURE_LABEL } from "@/components/bento/feature-bar";
import { formatInt, formatParis, timeAgo } from "@/lib/format";
import type { UserRow } from "@/lib/noesis/queries";

type SortKey = "lastActivity" | "createdAt" | "aiRequests" | "email";

const COLS: { key: SortKey; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "createdAt", label: "Inscription" },
  { key: "lastActivity", label: "Dernière activité" },
  { key: "aiRequests", label: "Demandes IA" },
];

export function UsersTable({ users }: { users: UserRow[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("lastActivity");
  const [desc, setDesc] = useState(true);

  const rows = useMemo(() => {
    const filtered = users.filter((u) => u.email.toLowerCase().includes(q.trim().toLowerCase()));
    return filtered.sort((a, b) => {
      const va = a[sort] ?? "";
      const vb = b[sort] ?? "";
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return desc ? -cmp : cmp;
    });
  }, [users, q, sort, desc]);

  const click = (k: SortKey) => {
    if (k === sort) setDesc(!desc);
    else {
      setSort(k);
      setDesc(k !== "email");
    }
  };

  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un email…" aria-label="Rechercher un email"
        className="mb-3 w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-violet sm:w-80" />
      <div className="overflow-x-auto rounded-2xl bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left">
              {COLS.map((c) => (
                <th key={c.key} className="px-4 py-3 font-semibold">
                  <button onClick={() => click(c.key)} className="hover:underline">
                    {c.label} {sort === c.key ? (desc ? "↓" : "↑") : ""}
                  </button>
                </th>
              ))}
              <th className="px-4 py-3 font-semibold">Fonctionnalités</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-ink/5 last:border-0 hover:bg-canvas/60">
                <td className="px-4 py-2.5"><Link href={`/users/${u.id}`} className="font-medium hover:underline">{u.email}</Link></td>
                <td className="px-4 py-2.5">{formatParis(u.createdAt, { day: "numeric", month: "short", year: "numeric" })}</td>
                <td className="px-4 py-2.5" suppressHydrationWarning>{u.lastActivity ? timeAgo(u.lastActivity) : "—"}</td>
                <td className="px-4 py-2.5 font-semibold">{formatInt(u.aiRequests)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {u.features.map((f) => (
                      <span key={f} className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: FEATURE_COLOR[f] }}>{FEATURE_LABEL[f]}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm opacity-60">Aucun utilisateur.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `app/(dash)/users/page.tsx`**

```tsx
import { Tile, Unavailable } from "@/components/bento/tile";
import { UsersTable } from "@/components/users-table";
import { getUsers } from "@/lib/data/users";
import { formatInt } from "@/lib/format";

export default async function UsersPage() {
  const users = await getUsers();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile tone={users.ok ? "mint" : "muted"} title="Inscrits">
          <div className="text-4xl font-extrabold">{users.ok ? formatInt(users.data.length) : "—"}</div>
        </Tile>
        <Tile tone={users.ok ? "sky" : "muted"} title="Jamais actifs">
          <div className="text-4xl font-extrabold">{users.ok ? formatInt(users.data.filter((u) => !u.lastActivity).length) : "—"}</div>
        </Tile>
      </div>
      {users.ok ? <UsersTable users={users.data} /> : <Tile tone="muted"><Unavailable error={users.error} /></Tile>}
    </div>
  );
}
```

- [ ] **Step 3: `app/(dash)/users/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { FeatureBar } from "@/components/bento/feature-bar";
import { Stat } from "@/components/bento/stat";
import { Tile, Unavailable } from "@/components/bento/tile";
import { Lines } from "@/components/charts/lines";
import { getUserDetail } from "@/lib/data/users";
import { formatInt, formatParis, timeAgo } from "@/lib/format";

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getUserDetail(id);
  if (!res.ok) return <Tile tone="muted"><Unavailable error={res.error} /></Tile>;
  if (!res.data) notFound();
  const { user, daily, features, skills, documents } = res.data;
  const date = (iso: string | null) => (iso ? formatParis(iso, { day: "numeric", month: "long", year: "numeric" }) : "—");

  return (
    <div className="space-y-3">
      <Link href="/users" className="text-sm hover:underline">← Tous les utilisateurs</Link>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile tone="hero" className="sm:col-span-2" title="Utilisateur">
          <div className="break-all text-2xl font-bold">{user.email}</div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="opacity-75">Inscrit le</dt><dd>{date(user.createdAt)}</dd>
            <dt className="opacity-75">Dernière connexion</dt><dd>{date(user.lastSignInAt)}</dd>
            <dt className="opacity-75">Dernière activité</dt><dd suppressHydrationWarning>{user.lastActivity ? timeAgo(user.lastActivity) : "—"}</dd>
          </dl>
        </Tile>
        <Tile tone="sun" title="Demandes IA"><Stat value={formatInt(user.aiRequests)} sub="depuis l'inscription" /></Tile>
        <Tile tone="mint" title="Documents"><Stat value={formatInt(documents)} /></Tile>
        <Tile className="sm:col-span-2 lg:col-span-3" title="Activité · 30 jours">
          <Lines fmt="int" data={daily.map((d) => ({ t: Date.parse(d.day), actions: d.actions, ai: d.ai }))}
            series={[{ key: "actions", label: "Actions", color: "#7c3aed" }, { key: "ai", label: "Réponses IA", color: "#db2777" }]} />
        </Tile>
        <Tile title="Fonctionnalités"><FeatureBar counts={features} /></Tile>
        <Tile tone="sky" className="sm:col-span-2 lg:col-span-4" title="Compétences (score moyen)">
          {skills.length === 0 ? <p className="text-sm opacity-60">Aucune compétence mesurée.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {skills.map((s) => (
                <li key={s.skill}>
                  <div className="mb-1 flex justify-between text-sm"><span className="capitalize">{s.skill}</span><b>{s.avg}/100 <span className="font-normal opacity-60">({s.n})</span></b></div>
                  <div className="h-2.5 rounded-full bg-white/70"><div className="h-2.5 rounded-full bg-ink" style={{ width: `${s.avg}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Vérifier** : typecheck + lint ; navigateur (démo) : `/users` trie et filtre, clic sur une ligne → fiche avec courbe, barres de compétences ; `/users/xxx` → 404. Capture.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): liste des utilisateurs et fiche individuelle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Page « IA & APIs »

**Files:**
- Create: `app/(dash)/apis/page.tsx`

**Interfaces:**
- Consumes: `getApis` (Task 14), composants (Task 15), `MODELS`, format

- [ ] **Step 1: Écrire `app/(dash)/apis/page.tsx`**

```tsx
import { Stat } from "@/components/bento/stat";
import { Tile, Unavailable } from "@/components/bento/tile";
import { Lines } from "@/components/charts/lines";
import { getApis } from "@/lib/data/apis";
import { formatBytes, formatInt, formatParis, formatPct } from "@/lib/format";
import { parsePeriod } from "@/lib/period";
import { MODELS } from "@/lib/types";

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`);

export default async function ApisPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const period = parsePeriod((await searchParams).period);
  const { label, derived, docErrors } = await getApis(period);
  if (!derived.ok) return <Tile tone="muted" title="IA & APIs"><Unavailable error={derived.error} /></Tile>;
  const d = derived.data;
  const p = d.probes[MODELS.primary];
  const quota = p?.limitRequests && p.remainingRequests != null ? 1 - p.remainingRequests / p.limitRequests : null;
  const sb = d.latestSupabase;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile tone="mint" title={`Disponibilité API Groq · ${label}`}><Stat value={pct(d.availability.api)} sub="GET /models, toutes les 5 min" /></Tile>
      <Tile tone="sky" title="Disponibilité gpt-oss-120b"><Stat value={pct(d.availability.primary)} sub="sonde toutes les 30 min" /></Tile>
      <Tile tone="blush" title="Disponibilité gpt-oss-20b"><Stat value={pct(d.availability.fallback)} sub="sonde toutes les heures" /></Tile>
      <Tile tone="sun" title="Quota Groq du jour (120b)">
        <Stat value={quota == null ? "—" : formatPct(quota)}
          sub={p?.remainingRequests != null ? `${formatInt(p.remainingRequests)} requêtes restantes · ${formatInt(p.limitTokens ?? 0)} tokens/min` : "aucune sonde récente"} />
      </Tile>

      <Tile className="sm:col-span-2 lg:col-span-4" title={`Latence Groq · ${label}`}>
        <Lines fmt="ms" data={d.latency}
          series={[
            { key: "api", label: "API (/models)", color: "#10b981" },
            { key: "primary", label: "gpt-oss-120b", color: "#7c3aed" },
            { key: "fallback", label: "gpt-oss-20b", color: "#db2777" },
          ]} />
      </Tile>

      <Tile className="sm:col-span-2 lg:col-span-3" title={`Base et stockage Noesis · ${label}`}>
        <Lines fmt="bytes" data={d.storage}
          series={[{ key: "db", label: "Base de données", color: "#7c3aed" }, { key: "storage", label: "Stockage", color: "#f59e0b" }]} />
        {sb && (
          <p className="mt-2 text-xs opacity-60">
            Limites du plan : base {formatBytes(sb.dbLimitBytes)} · stockage {formatBytes(sb.storageLimitBytes)} ·
            requêtes Supabase 24 h : {sb.apiRequests24h == null ? "—" : formatInt(sb.apiRequests24h)}
          </p>
        )}
      </Tile>

      <Tile tone={docErrors.ok ? (docErrors.data > 0 ? "blush" : "mint") : "muted"} title={`Documents en erreur · ${label}`}>
        {docErrors.ok ? <Stat value={formatInt(docErrors.data)} sub="imports PDF échoués" /> : <Unavailable error={docErrors.error} />}
      </Tile>

      <Tile tone="ink" className="sm:col-span-2 lg:col-span-4" title="Dernières erreurs de collecte">
        {d.collectErrors.length === 0 ? <p className="text-sm opacity-70">Aucune erreur sur la période ✨</p> : (
          <ul className="space-y-1.5 text-sm">
            {d.collectErrors.map((e) => (
              <li key={e.at} className="flex flex-wrap gap-x-3">
                <span className="opacity-60">{formatParis(e.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                {Object.entries(e.errors).map(([k, v]) => <span key={k}><b>{k}</b> : {v}</span>)}
              </li>
            ))}
          </ul>
        )}
      </Tile>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier** : typecheck + lint ; navigateur (démo) sur `/apis`, `/apis?period=30d` : graphes remplis, pas de blocage (30 j = 8 640 relevés sous-échantillonnés à ≤ 300 points + sondes). Capture.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): page IA & APIs (disponibilité, latence, quota, stockage, erreurs)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Page « Alertes » (historique, seuils, test Telegram)

**Files:**
- Create: `app/(dash)/alerts/actions.ts`, `app/(dash)/alerts/page.tsx`, `components/telegram-test.tsx`

**Interfaces:**
- Consumes: `getAlertsPage` (Task 14), `RULE_META` (Task 9), `updateRule` (Task 7), `sendTelegram` (Task 10), `requireUser` (Task 13), `isDemo`
- Produces: server actions `updateRuleAction(fd: FormData): Promise<void>`, `testTelegramAction(prev: TestState): Promise<TestState>` avec `type TestState = { ok: boolean | null; message: string }`

Les server actions sont des endpoints publics : **chacune appelle `requireUser()` en premier**.

- [ ] **Step 1: `app/(dash)/alerts/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { RULE_META } from "@/lib/alerts/rules";
import { sendTelegram } from "@/lib/alerts/telegram";
import { isDemo } from "@/lib/env";
import { errorMessage } from "@/lib/result";
import { updateRule } from "@/lib/store";
import { requireUser } from "@/lib/supabase/server";
import type { RuleKey } from "@/lib/types";

export type TestState = { ok: boolean | null; message: string };

export async function updateRuleAction(fd: FormData): Promise<void> {
  await requireUser();
  if (isDemo()) return;
  const key = String(fd.get("key")) as RuleKey;
  if (!(key in RULE_META)) throw new Error("Règle inconnue");
  const enabled = fd.get("enabled") === "on";
  const raw = fd.get("threshold");
  if (raw == null || raw === "") {
    await updateRule(key, { enabled });
  } else {
    const threshold = Number(raw);
    if (!Number.isFinite(threshold) || threshold < 0) throw new Error("Seuil invalide");
    await updateRule(key, { enabled, threshold });
  }
  revalidatePath("/alerts");
}

export async function testTelegramAction(_prev: TestState): Promise<TestState> {
  await requireUser();
  if (isDemo()) return { ok: false, message: "Mode démo : Telegram n'est pas configuré." };
  try {
    await sendTelegram("🧪 Test Noesis Pulse : les alertes arrivent bien ici.");
    return { ok: true, message: "Message envoyé ✅" };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
```

- [ ] **Step 2: `components/telegram-test.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { testTelegramAction, type TestState } from "@/app/(dash)/alerts/actions";

export function TelegramTest() {
  const [state, action, pending] = useActionState<TestState>(testTelegramAction, { ok: null, message: "" });
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button disabled={pending} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">
        {pending ? "Envoi…" : "Tester Telegram"}
      </button>
      {state.message && <span className={`text-sm ${state.ok ? "" : "text-bad"}`}>{state.message}</span>}
    </form>
  );
}
```

- [ ] **Step 3: `app/(dash)/alerts/page.tsx`**

```tsx
import { Tile, Unavailable } from "@/components/bento/tile";
import { TelegramTest } from "@/components/telegram-test";
import { RULE_META } from "@/lib/alerts/rules";
import { getAlertsPage } from "@/lib/data/alerts";
import { formatParis } from "@/lib/format";
import { updateRuleAction } from "./actions";

const when = (iso: string) => formatParis(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const STEP = { none: undefined, ms: 100, ratio: 0.05, count: 1, min: 1 } as const;

export default async function AlertsPage() {
  const { rules, alerts } = await getAlertsPage();
  const open = alerts.ok ? alerts.data.filter((a) => !a.resolved_at) : [];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Tile tone={open.length ? "hero" : "mint"} title="En cours">
        {!alerts.ok ? <Unavailable error={alerts.error} /> : open.length === 0 ? (
          <p className="text-2xl font-bold">Tout va bien ✅</p>
        ) : (
          <ul className="space-y-2">{open.map((a) => <li key={a.id}><div className="font-semibold">{a.message}</div><div className="text-xs opacity-75">depuis {when(a.opened_at)}</div></li>)}</ul>
        )}
      </Tile>

      <Tile tone="ink" className="lg:col-span-2" title="Notifications Telegram">
        <p className="mb-3 text-sm opacity-80">Une alerte est envoyée à son ouverture, puis un message « ✅ Résolu » quand tout revient à la normale. Résumé quotidien à 8h.</p>
        <TelegramTest />
      </Tile>

      <Tile className="lg:col-span-3" title="Règles et seuils">
        {!rules.ok ? <Unavailable error={rules.error} /> : (
          <div className="divide-y divide-ink/10">
            {rules.data.map((r) => {
              const meta = RULE_META[r.key];
              return (
                <form key={r.key} action={updateRuleAction} className="flex flex-wrap items-center gap-3 py-3">
                  <input type="hidden" name="key" value={r.key} />
                  <label className="flex min-w-56 flex-1 items-start gap-3">
                    <input type="checkbox" name="enabled" defaultChecked={r.enabled} className="mt-1 h-4 w-4 accent-violet" />
                    <span><b>{meta.label}</b><br /><span className="text-xs opacity-60">{meta.help}</span></span>
                  </label>
                  {meta.unit !== "none" && (
                    <input type="number" name="threshold" defaultValue={r.threshold} step={STEP[meta.unit]} min={0}
                      aria-label={`Seuil ${meta.label}`} className="w-28 rounded-lg border border-ink/15 px-3 py-1.5" />
                  )}
                  <button className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white">Enregistrer</button>
                </form>
              );
            })}
          </div>
        )}
      </Tile>

      <Tile className="lg:col-span-3" title="Historique (50 dernières)">
        {!alerts.ok ? <Unavailable error={alerts.error} /> : alerts.data.length === 0 ? <p className="text-sm opacity-60">Aucune alerte pour l&apos;instant.</p> : (
          <ul className="divide-y divide-ink/10 text-sm">
            {alerts.data.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{a.message}</span>
                <span className="opacity-60">{when(a.opened_at)} → {a.resolved_at ? when(a.resolved_at) : <b className="text-rose">en cours</b>}</span>
              </li>
            ))}
          </ul>
        )}
      </Tile>
    </div>
  );
}
```

- [ ] **Step 4: Vérifier** : typecheck + lint + build ; navigateur (démo) sur `/alerts` : 1 alerte en cours, 7 règles, historique, bouton test → « Mode démo… ». Capture.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): page Alertes — en cours, seuils éditables, test Telegram, historique

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: README de mise en place + vérification finale

**Files:**
- Create: `README.md`

- [ ] **Step 1: Écrire `README.md`**

````markdown
# Noesis Pulse

Tableau de bord privé de suivi de Noesis : en ligne (estimation), demandes IA, utilisateurs, santé Groq/Supabase, alertes et résumé quotidien Telegram.

**Noesis n'est jamais modifié.** Pulse lit sa base en `SELECT` uniquement via la Supabase Management API.

## Développer en local (sans aucune clé)

```bash
npm install
echo PULSE_DEMO=1 > .env.local
npm run dev   # http://localhost:3020 — données fictives, pas de connexion
npm test
```

## Mise en production

1. **Projet Supabase « noesis-pulse »** (séparé de Noesis, plan gratuit)
   - SQL Editor : exécuter `supabase/migrations/0001_pulse.sql`.
   - Database → Extensions : activer `pg_cron` et `pg_net`.
   - Authentication → Sign In / Providers : désactiver « Allow new users to sign up ».
   - Authentication → Users → « Add user » : créer ton compte avec `ALLOWED_EMAIL`.
   - Authentication → URL Configuration : Site URL = `https://<ton-domaine>` ; Redirect URLs = `https://<ton-domaine>/auth/callback` (+ `http://localhost:3020/auth/callback`).
2. **Jeton Supabase** : supabase.com → Account → Access Tokens → nouveau jeton → `SUPABASE_MANAGEMENT_TOKEN`. ⚠️ Il donne accès à tout ton compte : uniquement dans les variables Vercel.
3. **Telegram** : @BotFather → `/newbot` → `TELEGRAM_BOT_TOKEN`. Écrire un message au bot puis ouvrir `https://api.telegram.org/bot<TOKEN>/getUpdates` → `chat.id` → `TELEGRAM_CHAT_ID`.
4. **Vercel** : importer le dépôt, renseigner toutes les variables de `.env.example` **sauf** `PULSE_DEMO`. Déployer.
5. **Planification** (SQL Editor du projet Pulse) :
   ```sql
   select vault.create_secret('https://<ton-domaine>', 'pulse_url');
   select vault.create_secret('<CRON_SECRET>', 'pulse_cron_secret');
   ```
   puis exécuter `supabase/migrations/0002_cron.sql`.
6. **Vérifier** : `curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<ton-domaine>/api/collect` → `{"ok":true,…}` ; page Alertes → « Tester Telegram ».

## Ce qui est mesuré

- **En ligne** : utilisateurs distincts avec une action ou une session rafraîchie dans les 5 dernières minutes (estimation).
- **Demande IA** : une réponse `role = 'assistant'` enregistrée (chat, débats, défis). Les appels IA non enregistrés par Noesis ne sont pas comptés.
- **Groq** : `GET /models` à chaque relevé (gratuit) ; vraie sonde `gpt-oss-120b` toutes les 30 min et `gpt-oss-20b` toutes les heures (~72 requêtes/jour prises sur le quota de Noesis).
````

- [ ] **Step 2: Vérification complète**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: tout PASS / OK, 0 erreur.

- [ ] **Step 3: Vérification visuelle (démo)**

Preview `noesis-pulse` : parcourir `/`, `/?period=30d`, `/users`, une fiche, `/apis?period=7d`, `/alerts`, en desktop puis mobile (375 px). Aucune erreur console. Captures des 4 pages.

- [ ] **Step 4: Vérifier la contrainte « zéro modification de Noesis »**

Run: `git -C ../intellect-lab status --short` (si c'est un dépôt git) et `grep -ri "pulse" ../intellect-lab/src ../intellect-lab/supabase`
Expected: aucune modification, aucune référence à Pulse.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: README de mise en place et d'utilisation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6 (avec l'utilisateur, hors agent) : premier relevé réel** — une fois les étapes 1-5 du README faites par l'utilisateur, déclencher `/api/collect` et vérifier dans la base Pulse qu'une ligne `snapshots` a `errors = null`. Si `read_only` ou l'endpoint `usage.api-counts` renvoient une erreur, ajuster `lib/noesis/client.ts` / `lib/sources/supabase-usage.ts` (voir notes des Tasks 4 et 6).

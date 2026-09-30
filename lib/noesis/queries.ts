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

export function mapSeries(rows: Row[]): SeriesPoint[] {
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

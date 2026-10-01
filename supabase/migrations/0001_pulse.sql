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
create unique index if not exists alerts_open on public.alerts (rule_key) where resolved_at is null;
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

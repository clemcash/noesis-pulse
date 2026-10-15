-- Retours de la bêta fermée : copie quotidienne des réponses au questionnaire
-- de Noesis (table beta_feedback, lue en SELECT), regroupées par l'IA en
-- points à traiter (bugs, idées…), puis envoyées par lots à la génération de
-- solutions (workflow GitHub qui ouvre une pull request sur Noesis).

create table if not exists public.feedback_responses (
  id uuid primary key,                 -- id de la ligne beta_feedback de Noesis
  user_id uuid not null,
  email text,
  week_start date not null,
  track text not null,
  note int,
  answers jsonb not null,
  submitted_at timestamptz not null,
  analyzed_at timestamptz
);
create index if not exists feedback_responses_submitted on public.feedback_responses (submitted_at desc);
create index if not exists feedback_responses_pending on public.feedback_responses (submitted_at) where analyzed_at is null;

create table if not exists public.solution_batches (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  item_ids bigint[] not null,
  branch text not null,
  status text not null check (status in ('dispatched','error')),
  error text
);

create table if not exists public.feedback_items (
  id bigserial primary key,
  kind text not null check (kind in ('bug','ia','idee','ux','positif')),
  title text not null,
  detail text not null default '',
  mentions int not null default 1,
  response_ids uuid[] not null default '{}',
  status text not null default 'new' check (status in ('new','sent','done','rejected')),
  batch_id bigint references public.solution_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feedback_items_status on public.feedback_items (status, kind);

-- RLS sans aucune policy : seul le service_role (serveur) peut lire/écrire.
alter table public.feedback_responses enable row level security;
alter table public.feedback_items enable row level security;
alter table public.solution_batches enable row level security;
revoke all on public.feedback_responses, public.feedback_items, public.solution_batches from anon, authenticated;
revoke all on sequence public.feedback_items_id_seq, public.solution_batches_id_seq from anon, authenticated;

-- Relevé quotidien des réponses (à exécuter après 0002_cron.sql) : 5 h UTC.
select cron.schedule('pulse-feedback', '0 5 * * *', $$select public.pulse_call('/api/feedback-sync')$$);

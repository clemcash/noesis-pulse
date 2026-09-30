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

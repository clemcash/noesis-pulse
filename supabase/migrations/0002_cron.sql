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

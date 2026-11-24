-- Run AFTER deploying the Edge Function and storing these values in Supabase Vault:
-- daily_reminder_url = https://<project-ref>.supabase.co/functions/v1/daily-reminders
-- daily_reminder_secret = the same random value as DAILY_REMINDER_SECRET
-- Supabase Dashboard > Integrations: enable pg_cron and pg_net first.
-- No credentials belong in this file.
do $$
begin
 if not exists (select 1 from vault.decrypted_secrets where name = 'daily_reminder_url')
 or not exists (select 1 from vault.decrypted_secrets where name = 'daily_reminder_secret') then
   raise exception 'Configure daily reminder Vault secrets before scheduling';
 end if;
 if exists (select 1 from cron.job where jobname = 'skilly-daily-reminders') then
   perform cron.unschedule('skilly-daily-reminders');
 end if;
 perform cron.schedule('skilly-daily-reminders', '*/5 * * * *', $job$
   select net.http_post(
     url := (select decrypted_secret from vault.decrypted_secrets where name = 'daily_reminder_url' limit 1),
     headers := jsonb_build_object('Content-Type', 'application/json', 'x-reminder-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_reminder_secret' limit 1)),
     body := '{}'::jsonb,
     timeout_milliseconds := 60000
   );
 $job$);
end $$;

// Invoked only by the daily scheduler; no client-facing send endpoint.
import { createClient } from 'npm:@supabase/supabase-js@2.109.0';
import webpush from 'npm:web-push@3.6.7';

const env = (name: string) => Deno.env.get(name) ?? '';
Deno.serve(async (request: Request) => {
  const secret = env('DAILY_REMINDER_SECRET');
  if (request.method !== 'POST' || !secret || request.headers.get('x-reminder-secret') !== secret) return new Response('Unauthorized', { status: 401 });
  const publicKey = env('WEB_PUSH_PUBLIC_KEY');
  const privateKey = env('WEB_PUSH_PRIVATE_KEY');
  const subject = env('WEB_PUSH_SUBJECT');
  if (!publicKey || !privateKey || !subject) return new Response('Push configuration missing', { status: 503 });
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data, error } = await client.rpc('claim_daily_reminders');
  if (error) return new Response('Could not claim reminders', { status: 500 });
  let sent = 0; let failed = 0;
  const rows = data ?? [];
  // Small batches bound network concurrency and fit Edge Function runtime limits.
  for (let i = 0; i < rows.length; i += 20) {
    await Promise.all(rows.slice(i, i + 20).map(async (row: { id: string; user_id: string; endpoint: string; keys: { p256dh: string; auth: string }; play_date: string }) => {
      try {
        const endpoint = new URL(row.endpoint);
        const allowed = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com)$/;
        if (endpoint.protocol !== 'https:' || !allowed.test(endpoint.hostname) || endpoint.port || endpoint.username || endpoint.password) throw new Error('Invalid endpoint');
        const details = webpush.generateRequestDetails({ endpoint: row.endpoint, keys: row.keys }, JSON.stringify({
          type: 'daily-reminder', date: row.play_date,
        }), { TTL: 900, urgency: 'normal', topic: 'skilly-daily', vapidDetails: { subject, publicKey, privateKey } });
        const response = await fetch(details.endpoint, { method: 'POST', headers: details.headers, body: new Uint8Array(details.body), redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (response.status === 404 || response.status === 410) {
          await client.from('daily_reminders').delete().eq('id', row.id);
          failed++; return;
        }
        if (!response.ok) throw new Error('Push rejected');
        const { error: saved } = await client.from('daily_reminder_deliveries').update({ sent: true }).eq('user_id', row.user_id).eq('play_date', row.play_date);
        if (saved) throw new Error('Delivery update failed');
        sent++;
      } catch { failed++; }
    }));
  }
  // No endpoints, subscription keys or player identifiers in logs/responses.
  return Response.json({ claimed: rows.length, sent, failed });
});

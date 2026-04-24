// Studio 33 — send-push Edge Function
// Receives { user_ids?: string[], roles?: string[], title, body, url, tag }
// and dispatches Web Push to every push_subscriptions row matching either
// user_ids (auth UUIDs) and/or roles (e.g. "admin").
//
// Env vars (set as Supabase Function secrets):
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT  (e.g. "mailto:studio33architecture@gmail.com")
//   SUPABASE_URL              (auto-injected by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase)

import webpush from 'npm:web-push@3.6.7';

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  || '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')     || 'mailto:admin@studio33.ma';
const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_SVC  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const body = await req.json();
    const userIds: string[] = (body.user_ids || []).map((x: unknown) => String(x));
    const roles:   string[] = (body.roles    || []).map((x: unknown) => String(x));
    const payload = JSON.stringify({
      title: body.title || 'Studio 33',
      body:  body.body  || '',
      url:   body.url   || '/',
      tag:   body.tag   || 'studio33-notif',
    });

    if (!userIds.length && !roles.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, skipped: 'no recipients' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Fetch subscriptions matching any of the target user_ids OR roles.
    let query = '';
    if (userIds.length && roles.length) {
      // Combine with PostgREST OR
      const uPart = `user_id.in.(${userIds.map(id => `"${id}"`).join(',')})`;
      const rPart = `user_role.in.(${roles.map(r => `"${r}"`).join(',')})`;
      query = `or=(${uPart},${rPart})`;
    } else if (userIds.length) {
      query = `user_id=in.(${userIds.map(id => `"${id}"`).join(',')})`;
    } else {
      query = `user_role=in.(${roles.map(r => `"${r}"`).join(',')})`;
    }
    const subRes = await fetch(
      `${SB_URL}/rest/v1/push_subscriptions?${query}&select=id,endpoint,p256dh,auth`,
      {
        headers: {
          'apikey': SB_SVC,
          'Authorization': `Bearer ${SB_SVC}`,
        },
      },
    );
    if (!subRes.ok) {
      const t = await subRes.text();
      return new Response(JSON.stringify({ ok: false, error: 'fetch_subs_failed', detail: t }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const subs = await subRes.json();

    // Send push to each subscription
    const results = await Promise.allSettled(subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        return { id: s.id, ok: true };
      } catch (err: any) {
        const status = err?.statusCode || 0;
        // 404 / 410 → subscription expired or unsubscribed → delete from DB
        if (status === 404 || status === 410) {
          await fetch(`${SB_URL}/rest/v1/push_subscriptions?id=eq.${s.id}`, {
            method: 'DELETE',
            headers: { 'apikey': SB_SVC, 'Authorization': `Bearer ${SB_SVC}` },
          });
        }
        return { id: s.id, ok: false, status, msg: err?.body || err?.message };
      }
    }));

    const sent = results.filter(r => r.status === 'fulfilled' && (r as any).value.ok).length;
    const failed = results.length - sent;
    return new Response(JSON.stringify({ ok: true, sent, failed, total: subs.length }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

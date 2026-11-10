// Studio 33 — send-push
// Recoit { user_ids?: string[], roles?: string[], title, body, url, tag } et
// envoie une notification a chaque telephone abonne (table push_subscriptions)
// des personnes visees : par compte (user_ids) sinon par role (roles).
//
// v3 (10/11/2026) : { portal_project_id } vise les telephones des CLIENTS
// d'un projet (table portal_push_subscriptions, abonnes depuis leur espace
// client). Les deux listes ne se melangent jamais. Une adresse que le service
// de notification declare perimee (404 / 410) est retiree.
//
// Seuls peuvent l'appeler : un membre connecte de l'equipe (sa session est
// relue aupres de Supabase Auth) ou une autre fonction du serveur (cle
// serveur). Le lien ouvert au clic reste toujours sur le site de l'app.
//
// Secret : VAPID_PRIVATE_KEY. SUPABASE_URL, SUPABASE_ANON_KEY et
// SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY = 'BM8EHs_PZIXvM4RzGr_HcnYJAsJPDg5AgE9rMVKi8-0hrLZKd68siyrb3MPIkw6j6upr5JEBb6ok8T-WweOxbas';
const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_SVC  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY') || SB_SVC;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function autorise(req: Request) {
  const jeton = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jeton || jeton === SB_ANON) return false;
  if (jeton === SB_SVC) return true;
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { 'apikey': SB_ANON, 'Authorization': `Bearer ${jeton}` },
  });
  return r.ok;
}

// Une page de l'app ('/?p=finance', '?p=taches') ; jamais un autre site.
function lienInterne(u: unknown) {
  let d = String(u || '/').trim();
  if (d.charAt(0) === '?') d = '/' + d;
  if (/^https:\/\/client\.studio33\.ma(\/|$)/i.test(d)) d = d.replace(/^https:\/\/client\.studio33\.ma/i, '') || '/';
  if (d.charAt(0) !== '/' || d.charAt(1) === '/' || d.charAt(1) === '\\') return '/';
  return d.slice(0, 300);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!(await autorise(req))) return json({ error: 'unauthorized' }, 401);

  try {
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!VAPID_PRIVATE_KEY) throw new Error('VAPID_PRIVATE_KEY not set');

    webpush.setVapidDetails(
      'mailto:contact@studio33.ma',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const { user_ids, roles, title, body, url, tag, portal_project_id } = await req.json();

    const supabase = createClient(SB_URL, SB_SVC);

    // Clients d'un projet (espace client)
    const projetClient = parseInt(String(portal_project_id ?? ''), 10);
    const table = projetClient > 0 ? 'portal_push_subscriptions' : 'push_subscriptions';

    // Personne de vise : on n'envoie rien (et surtout pas a tout le monde)
    let query = supabase.from(table).select('endpoint, p256dh, auth');
    if (projetClient > 0) {
      query = query.eq('project_id', projetClient);
    } else if (Array.isArray(user_ids) && user_ids.length > 0) {
      query = query.in('user_id', user_ids.map(String));
    } else if (Array.isArray(roles) && roles.length > 0) {
      query = query.in('user_role', roles.map(String));
    } else {
      return json({ sent: 0, failed: 0, total: 0, skipped: 'no recipients' });
    }

    const { data: subs, error } = await query;
    if (error) throw error;

    const payload = JSON.stringify({
      title: String(title || 'Studio 33').slice(0, 120),
      body: String(body || '').slice(0, 400),
      url: lienInterne(url),
      tag: String(tag || 'studio33').slice(0, 80)
    });

    const results = await Promise.allSettled(
      (subs || []).map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Adresses perimees (telephone change, notifications retirees) : on les retire
    const perimees = (subs || []).filter((_, i) => {
      const r = results[i];
      const code = r.status === 'rejected' ? Number((r as PromiseRejectedResult).reason?.statusCode) : 0;
      return code === 404 || code === 410;
    }).map(sub => sub.endpoint);
    if (perimees.length) {
      let del = supabase.from(table).delete().in('endpoint', perimees);
      if (projetClient > 0) del = del.eq('project_id', projetClient);
      await del;
    }
    if (projetClient > 0 && sent > 0) {
      await supabase.from('portal_push_subscriptions')
        .update({ last_sent_at: new Date().toISOString() }).eq('project_id', projetClient);
    }

    return json({ sent, failed, total: subs?.length || 0, removed: perimees.length });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

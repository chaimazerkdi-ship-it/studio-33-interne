// Gestion des comptes de l'equipe : creer, supprimer, changer un mot de passe.
//
// Reservee a une admin connectee. On ne se fie qu'a la session (jeton de
// connexion) et au role range dans `app_metadata.s33_role` : cette partie du
// compte ne peut etre modifiee que par le serveur, jamais par la personne
// elle-meme (contrairement a `user_metadata`). Le compte est relu aupres de
// Supabase Auth a chaque appel : un role retire prend effet tout de suite.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? SERVICE_ROLE_KEY;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Le compte qui appelle, s'il est connecte et admin ; sinon null.
async function adminConnectee(req: Request) {
  const jeton = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jeton || jeton === ANON_KEY) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${jeton}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return (u.app_metadata || {}).s33_role === 'admin' ? u : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Méthode refusée' }, 405);

  const admin = await adminConnectee(req);
  if (!admin) return json({ error: 'Réservé à une admin connectée — reconnectez-vous' }, 403);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const adminUrl = `${SUPABASE_URL}/auth/v1/admin/users`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  };

  // CREATE user
  if (body.action === 'create') {
    const { username, password, display_name } = body;
    const role = body.role === 'admin' ? 'admin' : 'member';
    if (!username || !password) return json({ error: 'username and password required' }, 400);
    if (!/^[a-z0-9._-]{2,40}$/i.test(username)) return json({ error: 'Identifiant invalide' }, 400);
    const email = `${username}@studio33.ma`;
    const res = await fetch(adminUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: display_name || username, role, avatar: username.substring(0, 2).toUpperCase() },
        app_metadata: role === 'admin' ? { s33_role: 'admin' } : {},
      }),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: data.message || data.error || 'Create failed' }, res.status);
    return json({ id: data.id, email: data.email });
  }

  // DELETE user
  if (body.action === 'delete') {
    const { auth_user_id } = body;
    if (!auth_user_id) return json({ error: 'auth_user_id required' }, 400);
    if (auth_user_id === admin.id) return json({ error: 'Impossible de supprimer votre propre compte' }, 400);
    const res = await fetch(`${adminUrl}/${encodeURIComponent(auth_user_id)}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return json({ error: data.message || 'Delete failed' }, res.status);
    }
    return json({ ok: true });
  }

  // CHANGE PASSWORD
  if (body.action === 'change_password') {
    const { auth_user_id, new_password } = body;
    if (!auth_user_id || !new_password) return json({ error: 'auth_user_id and new_password required' }, 400);
    const res = await fetch(`${adminUrl}/${encodeURIComponent(auth_user_id)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ password: new_password }),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: data.message || 'Change password failed' }, res.status);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
});

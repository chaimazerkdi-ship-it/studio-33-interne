import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Questionnaire client : le client ouvre brief.html?b=<jeton>, remplit et
// envoie ses reponses. Il n'a pas de compte : le lien suffit, comme pour la
// signature d'un devis. Avant, la page ecrivait directement dans la table
// `client_briefs`, ouverte a tout le monde (lecture comprise) ; la table est
// maintenant reservee a l'equipe, et cette fonction n'ecrit que dans le
// questionnaire du lien recu.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIN_TOKEN = 20;
const TAILLE_MAX = 200 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function rest(pathAndQuery: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: H });
  if (!r.ok) return [];
  return await r.json();
}
async function restWrite(path: string, method: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  return await r.json().catch(() => null);
}

async function notifyTeam(title: string, preview: string, tag: string) {
  try {
    const team = await rest(`team_members?active=is.true&select=user_id,role,permissions`);
    const targets = (team as any[])
      .filter((m) => m.role === "admin" || m?.permissions?.is_co_admin === true)
      .map((m) => String(m.user_id));
    for (const uid of targets) {
      await restWrite("notifications", "POST", {
        user_id: uid, title, body: preview, type: "brief_client", read: false,
        link_page: "generateurs", created_at: new Date().toISOString(),
      });
    }
    if (targets.length) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST", headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: targets, title: title.replace(/<[^>]*>/g, ""), body: preview, url: "/?p=generateurs", tag }),
      });
    }
  } catch (_) { /* non bloquant */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const texte = await req.text();
    if (texte.length > TAILLE_MAX) return json({ error: "too_large" }, 413);
    let p: any = {};
    try { p = JSON.parse(texte); } catch (_) { /* ignore */ }
    const token = String(p.token || "");
    if (!token || token.length < MIN_TOKEN || !/^[a-z0-9]+$/i.test(token)) return json({ error: "invalid_token" }, 400);
    const answers = p.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) return json({ error: "bad_answers" }, 400);
    const nom = String(p.client_name || "").replace(/[<>]/g, "").trim().slice(0, 120);

    const rows = await rest(`client_briefs?token=eq.${encodeURIComponent(token)}&select=id,client_name&limit=1`);
    const brief = rows[0];
    if (!brief) return json({ error: "not_found" }, 404);

    const maj = await restWrite(`client_briefs?id=eq.${brief.id}`, "PATCH", {
      answers, submitted_at: new Date().toISOString(), imported: false, client_name: nom || brief.client_name || null,
    });
    if (!maj) return json({ error: "save_failed" }, 500);

    await notifyTeam(
      '<span class="mi mi-sm">quiz</span> Questionnaire client rempli',
      (nom || brief.client_name || "Un client") + " a envoyé ses réponses au questionnaire.",
      "brief_" + brief.id,
    );
    return json({ ok: true });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});

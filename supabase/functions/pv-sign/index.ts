import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Signature de PV de chantier à distance : le client ou l'entreprise ouvre
// le lien ?pvsign=<token>, consulte le PV et signe.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIN_TOKEN = 15;
const SIGNATURE_OK = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/]+={0,2}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

async function findPv(token: string) {
  const rows = await rest(`pv_chantier?sign_token=eq.${encodeURIComponent(token)}&deleted_at=is.null&select=id,ref,project_id,visit_date,heure,auteur,presents,decisions,actions,notes,statut,sign_data&limit=1`);
  return rows[0] || null;
}

async function notifyTeam(title: string, preview: string, tag: string) {
  try {
    const team = await rest(`team_members?active=is.true&select=user_id,role,permissions`);
    const targets = (team as any[])
      .filter((m) => m.role === "admin" || m?.permissions?.is_co_admin === true)
      .map((m) => String(m.user_id));
    for (const uid of targets) {
      await restWrite("notifications", "POST", {
        user_id: uid, title, body: preview, type: "pv_signed", read: false,
        link_page: "pvchantier", created_at: new Date().toISOString(),
      });
    }
    if (targets.length) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST", headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: targets, title: title.replace(/<[^>]*>/g, ""), body: preview, url: "/", tag }),
      });
    }
  } catch (_) { /* non bloquant */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const token = url.searchParams.get("token") || "";
      if (!token || token.length < MIN_TOKEN) return json({ error: "invalid_token" }, 400);
      const pv = await findPv(token);
      if (!pv) return json({ error: "not_found" }, 404);
      let projet = "";
      if (pv.project_id) {
        const pr = await rest(`projects?id=eq.${pv.project_id}&select=name&limit=1`);
        projet = pr[0]?.name || "";
      }
      const sig = pv.sign_data && pv.sign_data.image ? pv.sign_data : null;
      return json({
        ref: pv.ref, projet, visit_date: pv.visit_date, heure: pv.heure, auteur: pv.auteur,
        presents: Array.isArray(pv.presents) ? pv.presents : [],
        decisions: Array.isArray(pv.decisions) ? pv.decisions : [],
        actions: Array.isArray(pv.actions) ? pv.actions : [],
        notes: pv.notes || "",
        signed: !!sig,
        signed_at: sig ? sig.signed_at : null,
        signer_name: sig ? sig.signer_name : null,
      });
    }

    if (req.method === "POST") {
      let p: any = {};
      try { p = await req.json(); } catch (_) { /* ignore */ }
      const token = String(p.token || "");
      const name = String(p.name || "").trim().slice(0, 120);
      const qualite = String(p.qualite || "").trim().slice(0, 120);
      const image = String(p.image || "");
      if (!token || token.length < MIN_TOKEN) return json({ error: "invalid_token" }, 400);
      if (!name) return json({ error: "name_required" }, 400);
      // Une vraie image et rien d'autre : la signature s'affiche ensuite dans l'app
      if (!SIGNATURE_OK.test(image) || image.length > 300000) return json({ error: "bad_signature" }, 400);
      const pv = await findPv(token);
      if (!pv) return json({ error: "not_found" }, 404);
      if (pv.sign_data && pv.sign_data.image) {
        return json({ ok: true, already: true, signed_at: pv.sign_data.signed_at });
      }
      const now = new Date().toISOString();
      const sign_data = { image, signer_name: name, qualite, signed_at: now, via: "lien_distant" };
      await restWrite(`pv_chantier?id=eq.${pv.id}`, "PATCH", { sign_data });
      await notifyTeam(
        'PV de chantier signé',
        (pv.ref || "PV") + " — signé par " + name + (qualite ? " (" + qualite + ")" : "") + ".",
        "pvsign_" + pv.id,
      );
      return json({ ok: true, signed_at: now });
    }

    return json({ error: "method" }, 405);
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});

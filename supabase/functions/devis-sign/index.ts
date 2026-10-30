import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Signature de devis à distance : le client ouvre le lien ?sign=<token>,
// consulte le résumé du devis AVEC son échéancier de paiement et signe.
// Après signature, il peut télécharger son devis signé en PDF (à joindre à
// son bon de commande) : le GET renvoie donc aussi le HT, la TVA, la date et
// — uniquement si le devis est signé — la signature apposée. Le détail de
// la mission (prestations comprises) est renvoyé quand le devis le porte.

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

async function findDevis(token: string) {
  const rows = await rest(`devis?sign_token=eq.${encodeURIComponent(token)}&deleted_at=is.null&select=id,num,ref,client_name,projet,ttc,ht,tva_rate,date_val,status,signatures,phases,mission_detail&limit=1`);
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
        user_id: uid, title, body: preview, type: "devis_signed", read: false,
        link_page: "devis", created_at: new Date().toISOString(),
      });
    }
    if (targets.length) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST", headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: targets, title: title.replace(/<[^>]*>/g, ""), body: preview, url: "/?p=devis", tag }),
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
      const d = await findDevis(token);
      if (!d) return json({ error: "not_found" }, 404);
      const clientSig = d.signatures && d.signatures.client && d.signatures.client.image ? d.signatures.client : null;
      const ttc = parseFloat(d.ttc) || 0;
      // On garde `phase` : le PDF s'en sert pour sa colonne de gauche.
      const phases = (Array.isArray(d.phases) ? d.phases : [])
        .map((p: any) => ({
          phase: p.phase || "",
          mission: p.mission || p.label || "",
          taux: parseFloat(p.taux) || 0,
          montant: Math.round(ttc * (parseFloat(p.taux) || 0) / 100),
        }))
        .filter((p: any) => p.taux > 0);
      // Detail de la mission : seulement les lignes retenues, si le devis le porte
      const md = d.mission_detail && typeof d.mission_detail === "object" ? d.mission_detail : null;
      const mission = md && md.actif && Array.isArray(md.items)
        ? md.items.filter((x: any) => x && x.ok !== false && String(x.t || "").trim())
            .map((x: any) => String(x.t).trim().slice(0, 600)).slice(0, 60)
        : [];
      return json({
        num: d.num || d.ref, client_name: d.client_name, projet: d.projet,
        ttc, ht: parseFloat(d.ht) || 0, tva_rate: d.tva_rate == null ? 20 : parseFloat(d.tva_rate),
        date_val: d.date_val || null,
        status: d.status, phases, mission,
        signed: !!clientSig, signed_at: clientSig ? clientSig.signed_at : null,
        signer_name: clientSig ? clientSig.signer_name : null,
        // La signature n'est rendue que si le devis est signé. Ce lien permet
        // déjà DE signer : la rendre n'ouvre donc rien de plus.
        signature: clientSig
          ? { image: clientSig.image, signer_name: clientSig.signer_name, signed_at: clientSig.signed_at, via: clientSig.via || "lien_distant" }
          : null,
      });
    }

    if (req.method === "POST") {
      let p: any = {};
      try { p = await req.json(); } catch (_) { /* ignore */ }
      const token = String(p.token || "");
      const name = String(p.name || "").trim().slice(0, 120);
      const image = String(p.image || "");
      if (!token || token.length < MIN_TOKEN) return json({ error: "invalid_token" }, 400);
      if (!name) return json({ error: "name_required" }, 400);
      // Une vraie image et rien d'autre : la signature s'affiche ensuite dans l'app
      if (!SIGNATURE_OK.test(image) || image.length > 300000) return json({ error: "bad_signature" }, 400);
      const d = await findDevis(token);
      if (!d) return json({ error: "not_found" }, 404);
      if (d.signatures && d.signatures.client && d.signatures.client.image) {
        return json({ ok: true, already: true, signed_at: d.signatures.client.signed_at });
      }
      const now = new Date().toISOString();
      const sigs = Object.assign({}, d.signatures || {});
      sigs.client = { image, signer_name: name, signed_at: now, via: "lien_distant" };
      await restWrite(`devis?id=eq.${d.id}`, "PATCH", { signatures: sigs, status: "Signé" });
      await notifyTeam(
        '<span class="mi mi-sm">draw</span> Devis signé par le client',
        (d.num || d.ref || "Devis") + " — " + (d.client_name || name) + " a signé à distance. À toi de le valider pour lancer la facturation.",
        "devissign_" + d.id,
      );
      return json({ ok: true, signed_at: now });
    }

    return json({ error: "method" }, 405);
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});

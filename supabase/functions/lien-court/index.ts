// Liens courts envoyes aux clients : client.studio33.ma/<type>/?<code>
//
// <code> est le debut du jeton deja existant (10 caracteres ; 12 pour
// l'espace client). Cette fonction retrouve la ligne qui porte ce jeton et
// renvoie l'ancien lien complet ; la petite page /<type>/ y redirige le
// client. Rien ne change dans les jetons : les liens longs deja envoyes
// restent valides.
//
// Devis : le lien porte directement le numero (client.studio33.ma/devis/?DEV-019),
// choix de Chaima le 31/10/2026 en connaissance de cause : quelqu'un qui tape
// un autre numero peut ouvrir et signer ce devis. Seuls les devis deja
// partages (qui ont un jeton de signature) s'ouvrent ainsi.
//
// GET ?t=<type>&c=<code>   (ou t=devis&c=DEV-019)
//   200 { url } — exactement un jeton commence par ce code
//   404          — aucun, ou plusieurs (on refuse plutot que de deviner)
//   400          — type inconnu ou code mal forme

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// type -> table, colonne du jeton, filtre, et ancien lien
const TYPES: Record<string, { table: string; col: string; filtre: string; url: (j: string) => string }> = {
  devis:         { table: "devis",         col: "sign_token",       filtre: "&deleted_at=is.null", url: (j) => "/?sign=" + j },
  pv:            { table: "pv_chantier",   col: "sign_token",       filtre: "&deleted_at=is.null", url: (j) => "/?pvsign=" + j },
  espace:        { table: "projects",      col: "portal_token",     filtre: "",                    url: (j) => "/?portal=" + j },
  chantier:      { table: "projects",      col: "entreprise_token", filtre: "",                    url: (j) => "/?ent=" + j },
  questionnaire: { table: "client_briefs", col: "token",            filtre: "",                    url: (j) => "/brief.html?b=" + j },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "method" }, 405);
  try {
    const u = new URL(req.url);
    const t = TYPES[u.searchParams.get("t") || ""];
    const c = (u.searchParams.get("c") || "").toLowerCase();
    // Numero de devis : DEV-019 (ou dev-19) -> DEV-019
    const n = c.match(/^dev-?(\d{1,5})$/);
    if (t === TYPES.devis && n) {
      const num = "DEV-" + String(parseInt(n[1], 10)).padStart(3, "0");
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/devis?num=eq.${num}&deleted_at=is.null&sign_token=not.is.null&select=sign_token&limit=2`,
        { headers: H },
      );
      if (!r.ok) return json({ error: "server_error" }, 500);
      const rows = await r.json();
      if (!Array.isArray(rows) || rows.length !== 1 || !rows[0].sign_token) return json({ error: "not_found" }, 404);
      return json({ url: t.url(String(rows[0].sign_token)) });
    }
    // Lettres et chiffres seulement : aucun joker ne peut passer dans la recherche
    if (!t || !/^[a-z0-9]{10,12}$/.test(c)) return json({ error: "invalid" }, 400);
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${t.table}?${t.col}=like.${c}*${t.filtre}&select=${t.col}&limit=2`,
      { headers: H },
    );
    if (!r.ok) return json({ error: "server_error" }, 500);
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0][t.col]) return json({ error: "not_found" }, 404);
    return json({ url: t.url(String(rows[0][t.col])) });
  } catch (_) {
    return json({ error: "server_error" }, 500);
  }
});

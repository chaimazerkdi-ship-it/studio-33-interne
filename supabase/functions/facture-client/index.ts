import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Facture envoyee au client par lien (demande de Chaima, 20/11/2026).
// Le client ouvre index.html?facture=<jeton> (ou le lien court
// client.studio33.ma/facture/?<debut du jeton>) ; la page lit ici SA facture
// et fabrique le PDF dans son navigateur, avec le meme modele que l'app.
//
// Publique, lecture seule : un jeton (20 a 64 lettres et chiffres) donne une
// seule facture, jamais supprimee. Renvoie ce qui est imprime sur la facture
// (pas d'identifiant interne, pas de telephone) et le cachet du cabinet.
//
// GET ?token=<jeton>
//   200 { num, date, due_date, status, paid_date, object, amount, tva_rate,
//         payment_method, cheque_ref, client, projet, cachet }
//   400 jeton mal forme ; 404 aucune facture

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

async function rest(pathAndQuery: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: H });
  if (!r.ok) throw new Error("rest " + r.status);
  return await r.json();
}

// Cachet du cabinet, garde 10 minutes en memoire (meme aide que devis-sign)
let _cachet: { data: string | null; t: number } = { data: null, t: 0 };
async function cachet(): Promise<string | null> {
  if (Date.now() - _cachet.t < 10 * 60 * 1000) return _cachet.data;
  let data: string | null = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/admin-docs/cabinet/cachet.png`, { headers: H });
    if (r.ok) {
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length > 0 && bytes.length < 1500000) {
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        data = "data:image/png;base64," + btoa(bin);
      }
    }
  } catch (_) { /* pas de cachet : la facture s'affiche sans */ }
  _cachet = { data, t: Date.now() };
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "method" }, 405);
  try {
    const token = new URL(req.url).searchParams.get("token") || "";
    // Lettres et chiffres seulement : rien d'autre ne passe dans la requete
    if (!/^[a-z0-9]{20,64}$/.test(token)) return json({ error: "invalid_token" }, 400);
    const rows = await rest(
      `invoices?share_token=eq.${token}&deleted_at=is.null` +
      `&select=num,client_id,project_id,object,amount,date,status,payment_method,paid_date,due_date,cheque_ref,tva_rate&limit=1`,
    );
    const f = Array.isArray(rows) ? rows[0] : null;
    if (!f) return json({ error: "not_found" }, 404);
    const [cli, proj, c] = await Promise.all([
      f.client_id ? rest(`clients?id=eq.${parseInt(f.client_id, 10)}&select=name,address,email,ice&limit=1`) : Promise.resolve([]),
      f.project_id ? rest(`projects?id=eq.${parseInt(f.project_id, 10)}&select=name&limit=1`) : Promise.resolve([]),
      cachet(),
    ]);
    const client = (cli && cli[0]) || null;
    return json({
      num: f.num || "", date: f.date || null, due_date: f.due_date || null,
      status: f.status || "", paid_date: f.paid_date || null,
      object: f.object || "", amount: parseFloat(f.amount) || 0,
      tva_rate: f.tva_rate == null ? null : parseFloat(f.tva_rate),
      payment_method: f.payment_method || null, cheque_ref: f.cheque_ref || null,
      client: client ? { name: client.name || "", address: client.address || null, email: client.email || null, ice: client.ice || null } : null,
      projet: (proj && proj[0] && proj[0].name) || "",
      cachet: c,
    });
  } catch (_) {
    return json({ error: "server_error" }, 500);
  }
});

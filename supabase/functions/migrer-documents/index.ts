// Deplacement ponctuel des anciens documents vers le stockage de fichiers.
//
// Jusqu'en aout 2026, certains documents etaient ranges DANS la table `media`
// (colonne `data`, en base64) au lieu du stockage : 47 documents, 93 Mo, qui
// alourdissent chaque sauvegarde et chaque lecture de la table. Cette
// fonction les depose dans le stockage (meme seau que les autres documents),
// puis remplace le contenu de la ligne par le chemin du fichier. Le document
// reste le meme pour l'app : elle sait deja ouvrir les deux formes.
//
// Garde : cle tiree au hasard dans `s33_cles_internes` (nom
// 'migrer-documents'), lue au moment de l'appel. Quelques documents par appel.

import { decodeBase64 } from 'jsr:@std/encoding@1/base64';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const CLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SEAU = 'admin-docs';
// Un document par appel : certains font plusieurs Mo, et le lot de 6
// depassait la memoire de la fonction.
const PAR_APPEL = 1;

const H = { apikey: CLE, Authorization: 'Bearer ' + CLE };

async function lire(chemin: string) {
  const r = await fetch(URL_SB + '/rest/v1/' + chemin, { headers: H });
  if (!r.ok) throw new Error(chemin + ' : ' + r.status);
  return await r.json();
}

async function gardeOk(k: string | null) {
  if (!k) return false;
  const r = await lire('s33_cles_internes?nom=eq.migrer-documents&select=valeur');
  return r.length === 1 && String(r[0].valeur).length >= 32 && r[0].valeur === k;
}

function propre(s: string, max: number) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max) || 'document';
}

const EXT: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif', 'text/html': 'html',
};

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (!(await gardeOk(u.searchParams.get('k')))) return new Response('non', { status: 403 });

  const lignes = await lire('media?data=not.is.null&file_path=is.null&doc_type=neq.panneau_state' +
    '&select=id,name,project_id,folder,doc_type,mime,is_pdf,data&order=id&limit=' + PAR_APPEL);
  const fait: unknown[] = [];

  for (const m of lignes) {
    try {
      const brut = String(m.data || '');
      const t = brut.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
      const mime = t ? t[1] : (m.mime || (m.is_pdf ? 'application/pdf' : 'image/jpeg'));
      const b64 = t ? t[3] : brut;
      if (t && !t[2]) { fait.push({ id: m.id, saute: 'pas en base64' }); continue; }
      const octets = decodeBase64(b64.replace(/\s+/g, ''));

      const dossier = propre(m.folder || m.doc_type || 'Documents', 40);
      const chemin = 'proj/' + (m.project_id ?? 'general') + '/' + dossier + '/' +
        m.id + '_' + propre(m.name, 60) + '.' + (EXT[mime] || 'bin');

      const up = await fetch(URL_SB + '/storage/v1/object/' + SEAU + '/' + chemin, {
        method: 'POST',
        headers: { ...H, 'Content-Type': mime, 'x-upsert': 'true' },
        body: octets,
      });
      if (!up.ok) { fait.push({ id: m.id, erreur: 'stockage ' + up.status }); continue; }

      // Le fichier est bien la : on remplace le contenu par son chemin
      const maj = await fetch(URL_SB + '/rest/v1/media?id=eq.' + m.id + '&file_path=is.null', {
        method: 'PATCH',
        headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ file_path: chemin, data: null, mime }),
      });
      fait.push({ id: m.id, chemin, octets: octets.length, ok: maj.ok });
    } catch (e) {
      fait.push({ id: m.id, erreur: String(e).slice(0, 120) });
    }
  }

  const reste = await lire('media?data=not.is.null&file_path=is.null&doc_type=neq.panneau_state&select=id');
  return Response.json({ deplaces: fait, restants: reste.length });
});

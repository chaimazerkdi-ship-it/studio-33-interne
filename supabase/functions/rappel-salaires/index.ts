// Rappel mensuel du paiement des salaires.
//
// Appelee par pg_cron les 1, 5, 10 et 15 a 9 h au Maroc. Elle regarde le MOIS
// ECOULE, ouvre les lignes manquantes (sinon un mois jamais paye ne laisserait
// aucune trace et le restant du serait faux), et ne previent que s'il reste
// quelqu'un a payer. Meme patron que `rappel-rapports` : garde par cle ?k=,
// date Maroc = UTC+1, insertion dans `notifications` puis appel de `send-push`.
//
// La cle de garde n'est pas dans le code (le depot est public) : elle est
// tiree au hasard dans la base, table `s33_cles_internes`, que seul le
// serveur peut lire. La tache planifiee la lit au meme endroit.

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const CLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MOIS_FR = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function entetes() {
  return { 'apikey': CLE, 'Authorization': 'Bearer ' + CLE, 'Content-Type': 'application/json' };
}

async function lire(chemin: string) {
  const r = await fetch(URL_SB + '/rest/v1/' + chemin, { headers: entetes() });
  if (!r.ok) throw new Error(chemin + ' : ' + r.status + ' ' + (await r.text()).slice(0, 180));
  return await r.json();
}

async function ecrire(table: string, corps: unknown) {
  const r = await fetch(URL_SB + '/rest/v1/' + table, {
    method: 'POST',
    headers: { ...entetes(), 'Prefer': 'return=representation' },
    body: JSON.stringify(corps)
  });
  if (!r.ok) throw new Error(table + ' : ' + r.status + ' ' + (await r.text()).slice(0, 180));
  return await r.json();
}

// Mois ecoule, en heure du Maroc (UTC+1)
function moisEcoule(): string {
  const maintenant = new Date(Date.now() + 3600 * 1000);
  const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

function libelleMois(m: string) {
  const p = m.split('-');
  return (MOIS_FR[parseInt(p[1], 10)] || m) + ' ' + p[0];
}

function fmt(n: number) {
  return Math.round(n).toLocaleString('fr-FR').replace(/ |,/g, ' ');
}

async function gardeOk(k: string | null) {
  if (!k) return false;
  try {
    const r = await lire('s33_cles_internes?nom=eq.rappel-salaires&select=valeur');
    return r.length === 1 && typeof r[0].valeur === 'string' && r[0].valeur.length >= 32 && r[0].valeur === k;
  } catch (_) {
    return false;
  }
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (!(await gardeOk(u.searchParams.get('k')))) {
    return new Response('non', { status: 403 });
  }

  try {
    const mois = u.searchParams.get('mois') || moisEcoule();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) {
      return Response.json({ ok: false, erreur: 'mois invalide (AAAA-MM)' }, { status: 400 });
    }

    const gens = await lire('salaires?actif=is.true&montant=gt.0&select=id,nom,montant,created_at&order=position,id');
    if (!gens.length) {
      return Response.json({ ok: true, mois, rien: 'aucune personne enregistree' });
    }

    let paiements = await lire(
      'salaires_paiements?mois=eq.' + mois + '&select=id,salaire_id,montant_du,montant_paye'
    );

    // Ouvrir le mois : une ligne par personne qui n'en a pas encore. Jamais
    // pour un mois deja fini avant que la personne existe, sinon on reclame
    // des salaires d'avant la mise en place du suivi.
    const manquantes = gens.filter((g: any) => {
      if (paiements.some((p: any) => String(p.salaire_id) === String(g.id))) return false;
      const ne = String(g.created_at || '').slice(0, 7);
      return !ne || ne <= mois;
    });
    if (manquantes.length) {
      const creees = await ecrire('salaires_paiements', manquantes.map((g: any) => ({
        salaire_id: g.id, mois, montant_du: g.montant, montant_paye: 0, statut: 'du', versements: []
      })));
      paiements = paiements.concat(creees);
    }

    const impayes = paiements.filter((p: any) =>
      Number(p.montant_du || 0) - Number(p.montant_paye || 0) > 0);
    if (!impayes.length) {
      return Response.json({ ok: true, mois, rien: 'tout est paye' });
    }

    const reste = impayes.reduce((s: number, p: any) =>
      s + (Number(p.montant_du || 0) - Number(p.montant_paye || 0)), 0);
    const titre = 'Salaires de ' + libelleMois(mois);
    const corps = impayes.length + ' personne' + (impayes.length > 1 ? 's' : '') +
      ' non payée' + (impayes.length > 1 ? 's' : '') + ' — ' + fmt(reste) + ' MAD à verser';

    // La cloche dans l'app, pour chaque admin. On lit les comptes Auth : se
    // fier aux abonnements push laisserait sans rien une admin qui n'a pas
    // (encore) accepte les notifications sur son telephone. Le role lu est
    // celui que seul le serveur peut ecrire (app_metadata).
    let ids: string[] = [];
    try {
      const r = await fetch(URL_SB + '/auth/v1/admin/users?per_page=200', { headers: entetes() });
      if (r.ok) {
        const j = await r.json();
        ids = (j.users || [])
          .filter((x: any) => (x.app_metadata || {}).s33_role === 'admin')
          .map((x: any) => x.id);
      }
    } catch (e) {
      console.error('comptes', e);
    }
    if (!ids.length) {
      const abos = await lire('push_subscriptions?user_role=eq.admin&select=user_id');
      ids = [...new Set(abos.map((a: any) => a.user_id).filter(Boolean))] as string[];
    }
    let cloche = 0;
    if (ids.length) {
      try {
        const lignes = await ecrire('notifications', ids.map((id) => ({
          user_id: id,
          title: '<span class="mi mi-sm">payments</span> ' + titre,
          body: corps,
          type: 'salaires',
          link_page: 'finance'
        })));
        cloche = lignes.length;
      } catch (e) {
        console.error('cloche', e);
      }
    }

    // Le telephone, meme app fermee
    let push = 'non envoye';
    try {
      const r = await fetch(URL_SB + '/functions/v1/send-push', {
        method: 'POST',
        headers: entetes(),
        body: JSON.stringify({
          roles: ['admin'], title: titre, body: corps,
          url: '/?p=finance', tag: 'salaires_' + mois
        })
      });
      push = r.ok ? 'ok' : 'erreur ' + r.status;
    } catch (e) {
      push = 'erreur ' + e;
    }

    return Response.json({ ok: true, mois, impayes: impayes.length, reste, cloche, push });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, erreur: String(e) }, { status: 500 });
  }
});

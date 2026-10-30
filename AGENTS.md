# Studio 33 Manager — contexte pour les agents IA

## En bref
Application interne de **Studio 33 Architects** (Agadir, Maroc), fondée par
**Chaima Zerkdi**. Une seule page HTML (`index.html`, CSS et JavaScript en
ligne), sans framework ni étape de compilation.

## Fichiers
- `index.html` — toute l'application (≈ 40 000 lignes, plusieurs blocs `<script>`)
- `sw.js` — service worker (cache hors ligne, notifications)
- `generators/` — générateurs ouverts dans un cadre (CPS, planning, note d'honoraires)
- `brief.html` — page autonome
- `supabase/functions/` — fonctions serveur Supabase (Deno)
- `supabase/migrations/` — changements de base de données

## Mise en ligne
- GitHub Pages publie la branche `main` sur **https://client.studio33.ma**
  (fichier `CNAME`). Rien d'autre : pas de Netlify, pas de glisser-déposer.
- On développe sur une branche de travail. **On ne fusionne dans `main` que
  quand Chaima dit « publie ».**
- À chaque publication, mettre à jour `const S33_BUILD = '...';` dans
  `index.html` (date + courte description, **sans apostrophe**).

## Données et comptes
- Base, fichiers et comptes : **Supabase** (projet `yjxcqptgugatrxeyzrdc`).
- Connexion par Supabase Auth (identifiant → `<identifiant>@studio33.ma`).
  Le tableau `USERS` de l'app ne contient **aucun mot de passe** et ne sert
  qu'à l'affichage.
- Le rôle qui fait foi côté serveur est `app_metadata.s33_role` (`admin`),
  que seul le serveur peut écrire. `user_metadata.role` est modifiable par la
  personne elle-même : ne jamais s'y fier pour un droit.
- Les fichiers du stockage s'ouvrent et s'envoient avec la session de la
  personne connectée (`'Bearer ' + (supabaseToken || SUPABASE_KEY)`).
- Les portails publics (espace client, signature de devis, PV, entreprise)
  passent par leurs fonctions serveur, jamais par la clé publique.
- **Tâches** (`projects.tasks`, une liste JSON) : toujours modifier par
  `s33MajTaches(projId, modifier)`. Elle relit la liste (sans relecture
  réussie, rien n'est écrit) et n'enregistre que si personne ne l'a changée
  entre-temps (fonction SQL `s33_maj_taches`). Ne jamais écrire
  `sbUpdate('projects', id, { tasks })` directement : une relecture ratée
  effaçait toutes les tâches du projet.
- **Dates du jour** : `s33Aujourdhui()` / `s33DateLocale(d)` (heure du
  téléphone). `toISOString().slice(0, 10)` donne la veille entre minuit et
  1 h au Maroc.
- Un enregistrement raté ne s'annonce jamais « ajouté » ou « sauvegardé
  localement » : on le dit, et on garde la saisie pour réessayer.
- **Numéros de facture et de devis** : toujours `await s33NumeroSuivant('facture' | 'devis')`
  (fonction SQL `s33_prochain_numero`, sous verrou, jamais sous le plus haut
  numéro existant). Ne jamais calculer un numéro depuis un compteur local ni
  réécrire `app_config` : c'est ce qui a remis le compteur à 1 en juillet 2026.
- **Créer une facture** : toujours `await s33CreerFacture({...})` (formulaire,
  validation de devis, échéances d'honoraires, Samia) : numéro par la base,
  échéance, TVA habituelle du projet, échéance d'honoraires liée. Pas
  d'insertion directe dans `invoices`.
- **Détail de la mission d'un devis** (`devis.mission_detail`,
  `{ actif, modele, items: [{ t, ok }] }`) : modèles par type de projet dans
  `S33_MISSIONS` ; seules les lignes cochées, et seulement si « Dans le
  devis » est coché, vont dans l'aperçu, le PDF et la page de signature du
  client (`s33DvMissionListe()`, fonction `devis-sign` → `mission`).
- **Montant d'une facture** (`invoices.amount`) : **TTC**. Le HT se déduit avec
  `s33InvTvaRate(inv)`.
- **Visites de chantier** : un seul module, le **PV de chantier**
  (`pv_chantier`). « Nouvelle visite » sur un projet → `s33PvNouveauPour(pid)` ;
  un PV rédigé par Samia → `s33PvBrouillonTexte(pid, texte)` (brouillon à
  compléter). L'avancement (`avancement_pct`, `notes`) est dans le PV ; la
  fiche projet montre les PV et les comptes-rendus de réunion (`reunions`).
  Une réserve levée : `statut: 'levée'` (avec accent) et `levee_date`.
  `chantier_visites` n'est plus écrite.
- **Heures travaillées** : `s33HeuresFusionnees()` — le chrono et le rapport du
  même jour décrivent le même travail ; on garde le plus grand des deux, on
  n'additionne jamais.

## Légèreté (données mobiles, base)
- **Fichiers** : toujours dans le stockage (`file_path`), **jamais** dans la
  colonne `media.data` en base64 (c'est ce qui avait gonflé la base à 175 Mo).
  Si le dépôt échoue, on le dit ; on ne met pas le fichier dans la table.
- **Photos** : `s33AllegerPhoto(dataUrl, mime)` (2560 px, JPEG 0,82) puis
  `s33VignettePhoto(data)` → colonne `thumb`, fabriquée à l'envoi.
- **Boucles réseau** (`setInterval`) : ne rien faire quand `document.hidden`
  (app en arrière-plan) ; ne demander que le nouveau (ex. messages :
  `created_at=gt.<dernier>`).
- **Session** : « Rester connectée » garde le seul jeton de renouvellement
  (`s33_session`), jamais le mot de passe ; `logout()` l'efface.
- Journaux techniques : vidés chaque nuit après 7 jours (`s33_purger_journaux`).

## Droits de l'équipe
- Chaque personne voit des **sections** (réglées par l'admin dans l'onglet
  Équipe). Une seule règle : `s33PeutVoir(section)` dans l'app, sa copie
  `s33_voit(section)` dans la base. Les pages réservées (`S33_PAGES_RESERVEES`)
  ne s'ouvrent pas par un lien direct.
- La base applique ces règles par des politiques **restrictives** (elles
  retirent des droits) : factures/échéances → `invoices`, devis → `devis`,
  charges/entrées → `finance`, documents administratifs → `administratif`,
  salaires → admin et co-admins (`s33_is_admin()`), suppression définitive
  de factures, devis, projets, clients → admin seule (`s33_admin_principale()`).
- `team_members` : seule l'admin change rôles, droits et comptes (déclencheur
  `s33_garde_equipe`) ; chacune peut changer son nom et son poste ; `<` `>`
  refusés dans un nom.
- Ne pas supprimer de politique avec DROP (Supabase demande une confirmation) :
  ajouter une politique restrictive, ou `alter policy`.

## Fonctions serveur
Chaque fonction vérifie qui l'appelle :
- `admin-users` : admin connectée uniquement.
- `ai-proxy` (Samia) : membre connecté ; modèle et longueur imposés par le
  serveur ; clé OpenRouter dans le secret `OPENROUTER_KEY`.
- `send-push` : membre connecté ou autre fonction serveur ; le lien de la
  notification reste sur le site.
- `devis-sign`, `pv-sign` : la signature doit être une vraie image base64.
- `brief-client` : réponses du questionnaire client (`brief.html?b=<jeton>`),
  écrites par jeton ; la table `client_briefs` n'est pas ouverte sans compte.

## Règles à respecter
- **Aucun secret dans le dépôt ni dans l'app** (le dépôt est public) : mots de
  passe, clés d'API, clés de garde. Les secrets vont dans les secrets des
  fonctions Supabase, saisis par Chaima dans le tableau de bord.
- Tout texte venant de l'extérieur (client, signataire, artisan, nom saisi)
  s'affiche échappé (`escHTML`).
- **Aucun emoji dans l'interface** : icônes Material Symbols uniquement.
- Interface en **français** ; montants en **MAD**.
- Pas de dépendance externe ajoutée, pas d'outil de compilation.
- Pas d'abonnement payant à une API d'IA ; les messages WhatsApp (`wa.me`)
  sont préparés, jamais envoyés automatiquement.

## Vérifications avant publication
- Syntaxe de chaque bloc `<script>` de `index.html` et de `sw.js`.
- Après la mise en ligne : l'action GitHub Pages est verte, et le fichier
  servi sur `client.studio33.ma` contient le nouveau `S33_BUILD`.

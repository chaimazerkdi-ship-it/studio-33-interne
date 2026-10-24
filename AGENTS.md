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

## Fonctions serveur
Chaque fonction vérifie qui l'appelle :
- `admin-users` : admin connectée uniquement.
- `ai-proxy` (Samia) : membre connecté ; modèle et longueur imposés par le
  serveur ; clé OpenRouter dans le secret `OPENROUTER_KEY`.
- `send-push` : membre connecté ou autre fonction serveur ; le lien de la
  notification reste sur le site.
- `devis-sign`, `pv-sign` : la signature doit être une vraie image base64.

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

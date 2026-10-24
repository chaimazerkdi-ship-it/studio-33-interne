-- Stockage : plus aucun acces avec la seule cle publique de l'app.
--
-- ETAT : PAS ENCORE APPLIQUEE (2026-10-24). Supabase demande une
-- confirmation avant de supprimer ces regles ; elle n'a pas encore ete
-- donnee. Retirer cette mention une fois la migration appliquee.
--
-- L'app ouvre et envoie les documents avec la session de la personne
-- connectee (regle `admin_docs_authenticated`, conservee). Les portails
-- (espace client, devis, PV, entreprise) passent par leurs fonctions serveur.
-- Ces quatre regles laissaient n'importe qui lire, deposer et SUPPRIMER les
-- documents de projet, et deposer des fichiers dans `soil-public` (dont les
-- images restent lisibles : le seau est public).

drop policy if exists "anon_select_admin_docs" on storage.objects;
drop policy if exists "anon_insert_admin_docs" on storage.objects;
drop policy if exists "anon_delete_admin_docs" on storage.objects;
drop policy if exists "anon upload soil-public" on storage.objects;

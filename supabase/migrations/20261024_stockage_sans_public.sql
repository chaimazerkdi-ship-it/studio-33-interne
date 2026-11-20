-- Stockage : plus aucun acces avec la seule cle publique de l'app.
--
-- ETAT : JAMAIS APPLIQUEE. Remplacee le 20/11/2026 par
-- 20261120_stockage_sans_compte.sql, qui retire les memes droits par des
-- regles restrictives, sans rien supprimer. Ne pas appliquer ce fichier.
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

-- Stockage : plus aucun acces sans compte aux documents (demande de Chaima,
-- 20/11/2026). Remplace 20261024_stockage_sans_public.sql, jamais appliquee
-- (elle supprimait des regles ; Supabase demande alors une confirmation).
--
-- Avant : les regles anon_select/insert/delete_admin_docs laissaient
-- n'importe qui, avec la seule cle publique de l'app (visible dans la page),
-- lire, deposer et SUPPRIMER les documents des projets ; « anon upload
-- soil-public » laissait deposer dans soil-public (inutilise par l'app).
--
-- Ici on ne supprime rien : des regles RESTRICTIVES retirent ces droits aux
-- visiteurs sans compte. L'app ouvre et envoie les fichiers avec la session
-- de la personne connectee (regle admin_docs_authenticated, inchangee) ; les
-- portails (espace client, devis, PV, entreprise, facture) passent par leurs
-- fonctions serveur, qui utilisent la cle serveur.

create policy s33_sans_compte_lecture on storage.objects
  as restrictive for select to anon
  using (bucket_id <> 'admin-docs');

create policy s33_sans_compte_depot on storage.objects
  as restrictive for insert to anon
  with check (bucket_id not in ('admin-docs', 'soil-public'));

create policy s33_sans_compte_retrait on storage.objects
  as restrictive for delete to anon
  using (bucket_id <> 'admin-docs');

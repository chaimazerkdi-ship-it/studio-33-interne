-- Cachet du cabinet (demande de Chaima, 19/11/2026).
--
-- Le cachet est un fichier du stockage : admin-docs/cabinet/cachet.png. Il
-- est pose automatiquement sur les devis, factures et notes d'honoraires.
-- Toute l'equipe connectee peut le LIRE (pour fabriquer ces documents) ;
-- seule l'admin principale peut le deposer, le remplacer ou le retirer.
-- Politiques RESTRICTIVES (elles retirent un droit, sans rien supprimer) :
-- elles valent pour tout le monde, y compris sans compte.

create policy s33_cachet_depot_admin on storage.objects
  as restrictive for insert to public
  with check (bucket_id <> 'admin-docs' or name not like 'cabinet/%' or public.s33_admin_principale());

create policy s33_cachet_modif_admin on storage.objects
  as restrictive for update to public
  using (bucket_id <> 'admin-docs' or name not like 'cabinet/%' or public.s33_admin_principale())
  with check (bucket_id <> 'admin-docs' or name not like 'cabinet/%' or public.s33_admin_principale());

create policy s33_cachet_retrait_admin on storage.objects
  as restrictive for delete to public
  using (bucket_id <> 'admin-docs' or name not like 'cabinet/%' or public.s33_admin_principale());

-- Correction appliquee le meme jour : sans compte, la fonction
-- s33_admin_principale() n'est pas permise, ce qui bloquait TOUT depot sans
-- compte dans le stockage. Les trois regles ci-dessus visent donc les membres
-- connectes ; sans compte, une regle simple interdit seulement le dossier du
-- cachet.
alter policy s33_cachet_depot_admin on storage.objects to authenticated;
alter policy s33_cachet_modif_admin on storage.objects to authenticated;
alter policy s33_cachet_retrait_admin on storage.objects to authenticated;

create policy s33_cachet_depot_sans_compte on storage.objects
  as restrictive for insert to anon
  with check (bucket_id <> 'admin-docs' or name not like 'cabinet/%');

create policy s33_cachet_modif_sans_compte on storage.objects
  as restrictive for update to anon
  using (bucket_id <> 'admin-docs' or name not like 'cabinet/%')
  with check (bucket_id <> 'admin-docs' or name not like 'cabinet/%');

create policy s33_cachet_retrait_sans_compte on storage.objects
  as restrictive for delete to anon
  using (bucket_id <> 'admin-docs' or name not like 'cabinet/%');

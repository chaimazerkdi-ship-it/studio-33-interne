-- Un seul module de visite : le PV de chantier (decision de Chaima, 25/10/2026).
--
-- L'ancien « rapport de visite » notait l'avancement du chantier en %, que la
-- fiche projet affiche. Le PV de chantier le reprend : une colonne de plus,
-- rien de supprime (chantier_visites reste, vide, pour l'historique).

alter table public.pv_chantier
  add column if not exists avancement_pct integer
  check (avancement_pct is null or avancement_pct between 0 and 100);

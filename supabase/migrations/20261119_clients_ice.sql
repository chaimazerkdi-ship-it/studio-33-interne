-- ICE des clients societes (demande de Chaima, 19/11/2026).
-- Rempli une fois dans la fiche client ; imprime sous le nom du client sur
-- ses factures. Chiffres (et espaces) seulement. Ajout seul.

alter table public.clients
  add column if not exists ice text check (ice is null or (length(ice) <= 30 and ice ~ '^[0-9 ]+$'));

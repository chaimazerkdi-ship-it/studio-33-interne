-- Materiaux d'un fournisseur : prix architecte et dimensions (demande de
-- Chaima, 09/11/2026). Chez un fournisseur : « ce carrelage coute 200 DH/m²,
-- pour vous architecte 180 DH/m² ».
--
-- price       = prix client (colonne existante, inchangee)
-- price_archi = prix architecte (nouveau)
-- dimensions  = texte libre : « 20 x 120 cm, ep. 9 mm » (nouveau)
-- Ajout seul : rien d'existant n'est modifie.

alter table public.mat_materials
  add column if not exists price_archi numeric check (price_archi is null or price_archi >= 0),
  add column if not exists dimensions  text    check (dimensions is null or length(dimensions) <= 200);

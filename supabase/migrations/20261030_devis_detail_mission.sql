-- Detail de la mission dans le devis (demande de Chaima, 30/10/2026).
--
-- Chaque devis peut porter, ou non, la liste des prestations comprises
-- (« 1- Etablissement des etudes preliminaires… »), partie d'un modele par
-- type de projet puis cochee / modifiee ligne par ligne.
-- Forme : { "actif": bool, "modele": text, "items": [ { "t": text, "ok": bool } ] }
-- Ajout seul : les devis existants restent sans detail de mission.

alter table public.devis add column if not exists mission_detail jsonb;

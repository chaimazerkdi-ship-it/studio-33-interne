-- Rapports : l'employee confirme avoir lu le commentaire de Madame Chaima
-- (« C'est compris ») ou repond (« J'ai une question ») — demande du 25/11/2026.
--
-- avis_lu_le      : quand l'autrice du rapport a confirme
-- avis_reponse    : sa question eventuelle (Chaima la voit sous son commentaire)
-- avis_reponse_le : quand elle l'a ecrite
--
-- Le declencheur s33_garde_avis_rapport est complete (create or replace,
-- rien n'est supprime) :
--  - l'admin principale qui change son commentaire ou son pouce vide
--    avis_lu_le : la personne devra relire ;
--  - a l'ajout d'un rapport, les nouvelles colonnes sont videes aussi ;
--  - seule l'autrice d'un rapport ecrit avis_lu_le / avis_reponse.

alter table public.daily_reports
  add column if not exists avis_lu_le timestamptz,
  add column if not exists avis_reponse text check (avis_reponse is null or length(avis_reponse) <= 1000),
  add column if not exists avis_reponse_le timestamptz;

create or replace function public.s33_garde_avis_rapport()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.s33_admin_principale() then
    -- Nouveau commentaire ou nouveau pouce : l'employee devra le relire
    if tg_op = 'UPDATE'
       and ((new.avis_commentaire is distinct from old.avis_commentaire)
            or (new.avis is distinct from old.avis)) then
      new.avis_lu_le := null;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.vu_le := null;
    new.avis := null;
    new.avis_commentaire := null;
    new.avis_le := null;
    new.avis_lu_le := null;
    new.avis_reponse := null;
    new.avis_reponse_le := null;
    return new;
  end if;
  new.vu_le := old.vu_le;
  new.avis := old.avis;
  new.avis_commentaire := old.avis_commentaire;
  new.avis_le := old.avis_le;
  -- Confirmer ou repondre : seulement l'autrice du rapport
  if old.user_id is distinct from (select auth.uid())::text then
    new.avis_lu_le := old.avis_lu_le;
    new.avis_reponse := old.avis_reponse;
    new.avis_reponse_le := old.avis_reponse_le;
  end if;
  -- Rapport modifie par son auteur : il redevient « pas encore vu »
  if (new.tasks, new.hours, new.blockers, new.project_id)
     is distinct from (old.tasks, old.hours, old.blockers, old.project_id) then
    new.vu_le := null;
  end if;
  return new;
end
$$;

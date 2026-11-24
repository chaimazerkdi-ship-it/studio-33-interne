-- Rapports journaliers : « vu » et avis de Madame Chaima (demande du 24/11/2026).
--
-- Quand l'admin principale voit un rapport a l'ecran, l'app note vu_le ;
-- l'employee lit « Madame Chaima a vu votre rapport ». L'admin peut aussi
-- laisser un pouce (avis : 'bien' / 'a_revoir') et un commentaire.
--
-- Les regles de la table laissent chaque employee modifier SON rapport : le
-- declencheur ci-dessous empeche quiconque d'autre que l'admin principale
-- d'ecrire ces quatre colonnes (a l'ajout, elles sont videes ; a une
-- modification, elles gardent leur valeur). Si l'employee change le contenu
-- de son rapport, il redevient « pas encore vu » (l'avis reste).
-- Ajout seul : aucune regle n'est supprimee.

alter table public.daily_reports
  add column if not exists vu_le timestamptz,
  add column if not exists avis text check (avis is null or avis in ('bien', 'a_revoir')),
  add column if not exists avis_commentaire text check (avis_commentaire is null or length(avis_commentaire) <= 1000),
  add column if not exists avis_le timestamptz;

create or replace function public.s33_garde_avis_rapport()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.s33_admin_principale() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.vu_le := null;
    new.avis := null;
    new.avis_commentaire := null;
    new.avis_le := null;
    return new;
  end if;
  new.vu_le := old.vu_le;
  new.avis := old.avis;
  new.avis_commentaire := old.avis_commentaire;
  new.avis_le := old.avis_le;
  -- Rapport modifie par son auteur : il redevient « pas encore vu »
  if (new.tasks, new.hours, new.blockers, new.project_id)
     is distinct from (old.tasks, old.hours, old.blockers, old.project_id) then
    new.vu_le := null;
  end if;
  return new;
end
$$;

create trigger s33_garde_avis_rapport
  before insert or update on public.daily_reports
  for each row execute function public.s33_garde_avis_rapport();

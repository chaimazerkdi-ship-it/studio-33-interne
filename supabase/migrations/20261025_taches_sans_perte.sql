-- Taches d'un projet : enregistrer sans jamais perdre celles des autres.
--
-- Les taches sont une liste JSON dans `projects.tasks`. L'app relit la liste,
-- la modifie, puis la renvoie entiere. Deux dangers :
--   * la relecture echoue (reseau faible) et l'app renvoie une liste vide ;
--   * quelqu'un modifie la liste entre la relecture et l'envoi.
-- Cette fonction n'enregistre la nouvelle liste que si la liste en base est
-- encore exactement celle que l'app a relue, et dit si c'est fait. Sinon l'app
-- relit et recommence. Security invoker : les droits habituels s'appliquent.

create or replace function public.s33_maj_taches(p_id bigint, p_avant jsonb, p_apres jsonb)
returns boolean
language sql
security invoker
set search_path = public
as $$
  with fait as (
    update public.projects
       set tasks = p_apres
     where id = p_id
       and jsonb_typeof(p_apres) = 'array'
       and coalesce(tasks, '[]'::jsonb) = coalesce(p_avant, '[]'::jsonb)
    returning 1
  )
  select exists (select 1 from fait);
$$;

revoke all on function public.s33_maj_taches(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.s33_maj_taches(bigint, jsonb, jsonb) to authenticated;

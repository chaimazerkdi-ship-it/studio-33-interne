-- Journaux techniques : on garde 7 jours (decision de Chaima, 25/10/2026).
--
-- Les traces des taches planifiees (cron.job_run_details) n'etaient jamais
-- videes : 236 000 lignes depuis mai 2026 (76 Mo), surtout le rappel
-- d'evenements qui tourne chaque minute. Les reponses web (net._http_response)
-- sont deja videes par pg_net lui-meme.
-- Supabase est proprietaire de ces tables : on peut supprimer les lignes, pas
-- compacter le fichier ; la place liberee est reutilisee au lieu de grossir.

create or replace function public.s33_purger_journaux()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.s33_purger_journaux() from public, anon, authenticated;

-- Chaque nuit a 3 h 17 (heure UTC)
select cron.schedule('purge-journaux', '17 3 * * *', 'select public.s33_purger_journaux()');

-- Premier menage tout de suite
select public.s33_purger_journaux();

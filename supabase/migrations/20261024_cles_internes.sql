-- Cles de garde des taches planifiees (pg_cron -> fonctions serveur).
--
-- Le depot est public : une cle ecrite dans le code ne protege rien. La cle
-- est tiree au hasard ici, dans la base, et n'apparait nulle part ailleurs.
-- RLS active sans aucune politique : ni la cle publique de l'app ni une
-- session d'utilisatrice ne peuvent la lire ; seul le serveur (cle serveur)
-- le peut.

create table if not exists public.s33_cles_internes (
  nom        text primary key,
  valeur     text not null,
  created_at timestamptz not null default now()
);
alter table public.s33_cles_internes enable row level security;
revoke all on table public.s33_cles_internes from anon, authenticated;

insert into public.s33_cles_internes (nom, valeur)
values ('rappel-salaires',
        replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (nom) do nothing;

-- La tache planifiee lit la cle dans la table au moment ou elle s'execute.
select cron.alter_job(
  job_id  := (select jobid from cron.job where jobname = 'rappel-salaires'),
  command := $cmd$ select net.http_post(
       url := 'https://yjxcqptgugatrxeyzrdc.supabase.co/functions/v1/rappel-salaires?k='
              || (select valeur from public.s33_cles_internes where nom = 'rappel-salaires'),
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGNxcHRndWdhdHJ4ZXl6cmRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MzEzNjksImV4cCI6MjA5MDMwNzM2OX0.Oijn7Q7g_IYy-ciUwcK5B88CBuJN48XTSAHo2dUqLhM'
       ),
       body := '{}'::jsonb
     ) $cmd$
);

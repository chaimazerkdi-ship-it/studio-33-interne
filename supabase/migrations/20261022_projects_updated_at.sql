-- Derniere activite sur un projet : tout ajout ou toute modification la met a
-- jour, pour que les projets touches remontent en premier dans la liste.
alter table public.projects add column if not exists updated_at timestamptz default now();
update public.projects set updated_at = now() where updated_at is null;

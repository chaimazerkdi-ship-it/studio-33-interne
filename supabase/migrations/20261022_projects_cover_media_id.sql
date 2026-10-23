-- 3D de couverture d'un projet : l'image choisie pour le representer dans
-- l'ecran « Plus ». Pointe vers une ligne de la table media (le fichier est
-- dans le Storage, avec sa vignette). Nullable : un projet sans couverture
-- affiche ses initiales.
alter table public.projects add column if not exists cover_media_id bigint;

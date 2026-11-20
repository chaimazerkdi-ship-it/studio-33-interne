-- Espace client unique : un seul lien par client, tous ses projets
-- (demande de Chaima, 20/11/2026).
--
-- Le client ouvre client.studio33.ma/espace/?<debut du jeton> puis
-- index.html?portal=<jeton du client> : la fonction client-portal (v14)
-- liste ses projets (tous, meme termines, sauf ceux dont l'acces est
-- suspendu) ; il touche celui qui l'interesse (&projet=<id>). Les liens par
-- projet (projects.portal_token) restent valides.
-- Ajout seul : rien d'existant n'est modifie.

alter table public.clients
  add column if not exists portal_token text unique
  check (portal_token is null or portal_token ~ '^[a-z0-9]{20,64}$');

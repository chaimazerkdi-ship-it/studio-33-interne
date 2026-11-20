-- Facture envoyee au client par lien (demande de Chaima, 20/11/2026).
--
-- « Envoyer au client » sur une facture cree un jeton ; le client ouvre
-- client.studio33.ma/facture/?<debut du jeton> (fonction lien-court) puis
-- index.html?facture=<jeton>, qui lit la facture par la fonction serveur
-- facture-client (lecture seule, cle serveur). La table invoices reste
-- fermee aux visiteurs sans compte.
-- Ajout seul : rien d'existant n'est modifie.

alter table public.invoices
  add column if not exists share_token text unique
  check (share_token is null or share_token ~ '^[a-z0-9]{20,64}$');

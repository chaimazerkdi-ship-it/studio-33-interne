-- Adresse du client (demande de Chaima, 19/11/2026).
--
-- La loi (article 145 du Code general des impots) demande l'adresse de
-- l'acheteur sur la facture. Saisie dans la fiche client ou le formulaire de
-- facture ; imprimee sous le nom du client. Texte libre, une ligne.
-- Ajout seul : rien d'existant n'est modifie.

alter table public.clients
  add column if not exists address text check (address is null or length(address) <= 200);

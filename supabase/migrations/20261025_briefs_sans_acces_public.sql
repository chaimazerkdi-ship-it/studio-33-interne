-- Questionnaire client : brief.html (publie le 25/10/2026) envoie ses reponses
-- par la fonction serveur brief-client. La table n'est donc plus ouverte sans
-- compte (elle l'etait en lecture ET en ecriture, avec la cle publique).
alter policy client_briefs_all on public.client_briefs to authenticated;

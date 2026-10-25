-- Factures en double : renumerotation decidee par Chaima le 25/10/2026.
--
-- En juillet 2026, le compteur de factures est retombe a 1 (une lecture
-- ratee au demarrage donnait 1, puis l'app reecrivait ce 1 en base). Les
-- nouvelles factures ont repris FAC-004, FAC-005... alors que les anciens
-- numeros allaient jusqu'a FAC-108. Les 12 factures actives en double les plus
-- recentes recoivent les numeros qui suivent FAC-108, dans l'ordre des dates.
-- (Les copies deja dans la corbeille ne changent pas.)
--
-- Retour arriere : remettre l'ancien numero indique en commentaire.

update invoices set num = 'FAC-109' where id = 216 and num = 'FAC-019'; -- 2026-04-29 Avance N°1
update invoices set num = 'FAC-110' where id = 217 and num = 'FAC-020'; -- 2026-05-18 Avance N°2
update invoices set num = 'FAC-111' where id = 218 and num = 'FAC-021'; -- 2026-07-10 Avance N°3
update invoices set num = 'FAC-112' where id = 203 and num = 'FAC-006'; -- 2026-07-24 Honoraires — E2
update invoices set num = 'FAC-113' where id = 205 and num = 'FAC-008'; -- 2026-07-28 Obtention de l'autorisation
update invoices set num = 'FAC-114' where id = 206 and num = 'FAC-009'; -- 2026-07-31 Signature du contrat
update invoices set num = 'FAC-115' where id = 207 and num = 'FAC-010'; -- 2026-09-30 Validation de l'APS
update invoices set num = 'FAC-116' where id = 208 and num = 'FAC-011'; -- 2026-09-30 Suivi de chantier sept.
update invoices set num = 'FAC-117' where id = 209 and num = 'FAC-012'; -- 2026-10-07 Signature du contrat (60%)
update invoices set num = 'FAC-118' where id = 211 and num = 'FAC-014'; -- 2026-10-20 Signature du contrat (60%)
update invoices set num = 'FAC-119' where id = 201 and num = 'FAC-004'; -- sans date, Gestion du projet
update invoices set num = 'FAC-120' where id = 202 and num = 'FAC-005'; -- sans date, Gestion du projet

-- La prochaine facture : FAC-121 (meme l'ancienne version de l'app, qui lit
-- ce compteur au demarrage, ne peut plus reprendre un numero deja pris)
update app_config set value = '121' where key = 'invoice_counter';

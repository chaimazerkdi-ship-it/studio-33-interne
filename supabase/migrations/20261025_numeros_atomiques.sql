-- Numeros de facture et de devis distribues par la base.
--
-- Avant : chaque appareil gardait son compteur en memoire, le renvoyait en
-- base apres chaque creation (et le remettait a 1 si sa lecture avait
-- echoue). Deux appareils pouvaient donner le meme numero, et une lecture
-- ratee remettait le compteur a zero.
--
-- Ici, un seul endroit donne le numero suivant, sous verrou de ligne : deux
-- appels simultanes recoivent deux numeros differents. Le numero ne descend
-- jamais sous le plus haut deja utilise (+1), meme si le compteur est faux.

create or replace function public.s33_prochain_numero(p_type text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cle      text;
  v_prefixe  text;
  v_plus_haut int;
  v_numero   int;
begin
  if p_type = 'facture' then
    v_cle := 'invoice_counter'; v_prefixe := 'FAC-';
    select coalesce(max((substring(num from '^FAC-(\d+)$'))::int), 0) into v_plus_haut from invoices;
  elsif p_type = 'devis' then
    v_cle := 'devis_counter'; v_prefixe := 'DEV-';
    select coalesce(max((substring(num from '^DEV-(\d+)$'))::int), 0) into v_plus_haut from devis;
  else
    raise exception 'type inconnu : %', p_type;
  end if;

  insert into app_config(key, value) values (v_cle, '1') on conflict (key) do nothing;

  update app_config
     set value = (greatest(coalesce(nullif(value, '')::int, 1), v_plus_haut + 1) + 1)::text
   where key = v_cle
  returning value::int - 1 into v_numero;

  return v_prefixe || lpad(v_numero::text, 3, '0');
end;
$$;

revoke all on function public.s33_prochain_numero(text) from public, anon;
grant execute on function public.s33_prochain_numero(text) to authenticated;

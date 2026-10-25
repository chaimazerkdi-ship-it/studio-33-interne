-- Droits de l'equipe : la base applique les memes regles que l'ecran.
--
-- Avant, toutes les tables etaient ouvertes a toute personne connectee :
-- une collaboratrice pouvait lire les salaires et les factures par l'API,
-- se donner le role admin (sa ligne de `team_members`), ou vider la
-- corbeille. Les regles ci-dessous s'ajoutent aux existantes (politiques
-- RESTRICTIVES : elles retirent des droits, n'en donnent aucun).
--
-- Decisions de Chaima (25/10/2026) :
--   * salaires : lisibles par elle et les co-admins ;
--   * suppression definitive (factures, devis, projets, clients) : elle seule.
-- Le reste suit les « sections » deja reglees pour chaque personne dans
-- l'onglet Equipe (meme logique que `updateUIForUser` dans l'app).

-- Admin principale : role 'admin' (pas co-admin)
create or replace function public.s33_admin_principale()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
     where user_id = (select auth.uid())::text and active and role = 'admin'
  )
$$;

-- Cette personne voit-elle la section ? (copie de _canSee dans l'app)
create or replace function public.s33_voit(p_section text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when tm.role = 'admin' then
        p_section <> 'administratif' or not coalesce((tm.permissions->>'no_administratif')::boolean, false)
      when coalesce((tm.permissions->>'is_co_admin')::boolean, false) then
        case when p_section = 'administratif'
             then coalesce((tm.permissions->'sections'->>p_section)::boolean, false)
             else coalesce((tm.permissions->'sections'->>p_section)::boolean, true) end
      else coalesce((tm.permissions->'sections'->>p_section)::boolean, false)
    end
    from public.team_members tm
    where tm.user_id = (select auth.uid())::text and tm.active
    limit 1
  ), false)
$$;

revoke all on function public.s33_admin_principale() from public, anon;
revoke all on function public.s33_voit(text) from public, anon;
grant execute on function public.s33_admin_principale() to authenticated;
grant execute on function public.s33_voit(text) to authenticated;

-- ── Equipe : seule l'admin change les roles, droits, comptes ────────────
-- Chacune peut encore modifier son propre nom et son poste. Les caracteres
-- < et > sont refuses dans le nom (un nom pouvait contenir du code, execute
-- ensuite chez l'admin dans l'onglet Equipe).
create or replace function public.s33_garde_equipe()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Serveur (fonctions, migrations) : aucune session d'utilisatrice
  if (select auth.uid()) is null then return coalesce(new, old); end if;

  if tg_op in ('INSERT', 'UPDATE') and
     (coalesce(new.display_name, '') ~ '[<>]' or coalesce(new.job_title, '') ~ '[<>]') then
    raise exception 'Les caractères < et > ne sont pas acceptés dans un nom' using errcode = '22023';
  end if;

  if public.s33_admin_principale() then return coalesce(new, old); end if;

  if tg_op <> 'UPDATE'
     or old.user_id is distinct from (select auth.uid())::text
     or new.role        is distinct from old.role
     or new.permissions is distinct from old.permissions
     or new.active      is distinct from old.active
     or new.user_id     is distinct from old.user_id
     or new.username    is distinct from old.username
     or new.email       is distinct from old.email then
    raise exception 'Réservé à l''administratrice' using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace trigger s33_garde_equipe
  before insert or update or delete on public.team_members
  for each row execute function public.s33_garde_equipe();

-- ── Salaires : admin et co-admins ────────────────────────────────────────
create policy s33_garde_salaires on public.salaires
  as restrictive for all to authenticated
  using (public.s33_is_admin()) with check (public.s33_is_admin());
create policy s33_garde_salaires_paiements on public.salaires_paiements
  as restrictive for all to authenticated
  using (public.s33_is_admin()) with check (public.s33_is_admin());

-- ── Argent : selon les sections de chaque personne ──────────────────────
create policy s33_section_factures on public.invoices
  as restrictive for all to authenticated
  using (public.s33_voit('invoices')) with check (public.s33_voit('invoices'));
create policy s33_section_echeances on public.honoraires_echeances
  as restrictive for all to authenticated
  using (public.s33_voit('invoices')) with check (public.s33_voit('invoices'));
create policy s33_section_paiements on public.payments
  as restrictive for all to authenticated
  using (public.s33_voit('invoices')) with check (public.s33_voit('invoices'));
create policy s33_section_devis on public.devis
  as restrictive for all to authenticated
  using (public.s33_voit('devis')) with check (public.s33_voit('devis'));
create policy s33_section_charges on public.charges
  as restrictive for all to authenticated
  using (public.s33_voit('finance')) with check (public.s33_voit('finance'));
create policy s33_section_entrees on public.entrees
  as restrictive for all to authenticated
  using (public.s33_voit('finance')) with check (public.s33_voit('finance'));
create policy s33_section_admin_docs on public.admin_docs
  as restrictive for all to authenticated
  using (public.s33_voit('administratif')) with check (public.s33_voit('administratif'));
create policy s33_section_cabinet_docs on public.cabinet_docs
  as restrictive for all to authenticated
  using (public.s33_voit('administratif')) with check (public.s33_voit('administratif'));

-- ── Suppression definitive (vider la corbeille) : l'admin seule ─────────
create policy s33_effacement_factures on public.invoices
  as restrictive for delete to authenticated using (public.s33_admin_principale());
create policy s33_effacement_devis on public.devis
  as restrictive for delete to authenticated using (public.s33_admin_principale());
create policy s33_effacement_projets on public.projects
  as restrictive for delete to authenticated using (public.s33_admin_principale());
create policy s33_effacement_clients on public.clients
  as restrictive for delete to authenticated using (public.s33_admin_principale());

-- ── Tables encore ouvertes sans compte : reservees aux personnes connectees
-- (l'app y accede avec la session ; le portail client passe par sa fonction)
alter policy pieces_all on public.pieces_dossier to authenticated;
alter policy presence_all on public.presence to authenticated;
alter policy message_reads_all on public.message_reads to authenticated;
alter policy "auth insert gendocs" on public.generated_documents to authenticated;

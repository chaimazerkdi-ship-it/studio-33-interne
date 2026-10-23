-- Suivi du paiement des salaires, mois par mois.
-- Chaima : « des fois je n'ai pas pu payer les salaires » — il faut donc
-- garder ce qui RESTE DU, pas seulement un coche paye / pas paye.

create table if not exists public.salaires (
  id bigserial primary key,
  nom text not null,
  user_id text,                    -- si la personne a un compte dans l'app
  poste text default '',
  montant numeric default 0,       -- le salaire mensuel fixe
  actif boolean default true,
  position int default 0,
  created_at timestamptz default now()
);

create table if not exists public.salaires_paiements (
  id bigserial primary key,
  salaire_id bigint references public.salaires(id) on delete cascade,
  mois text not null,              -- 'YYYY-MM', la convention de charges.month
  montant_du numeric default 0,
  montant_paye numeric default 0,  -- cumule des versements
  statut text default 'du',        -- 'du' | 'partiel' | 'paye'
  versements jsonb default '[]'::jsonb,  -- [{date, montant, moyen, charge_id}]
  dernier_paiement date,
  note text,
  created_at timestamptz default now(),
  unique (salaire_id, mois)
);

create index if not exists salaires_paiements_mois_idx on public.salaires_paiements (mois);

alter table public.salaires enable row level security;
alter table public.salaires_paiements enable row level security;

create policy auth_users_only on public.salaires
  for all to authenticated using (true) with check (true);
create policy auth_users_only on public.salaires_paiements
  for all to authenticated using (true) with check (true);

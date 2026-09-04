-- Decision OS Snapshot Caching (BATCH 2 optimization)
-- Cache snapshot results for 24h to reduce Supabase queries from 1,400/day to ~140/day
-- Expected savings: ~$200-300/month in Supabase egress + Inngest executions

create table if not exists public.decision_snapshots (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  snapshot_data jsonb not null,
  cacheado_en timestamp with time zone not null default now(),
  valido_hasta timestamp with time zone not null default (now() + interval '24 hours'),
  es_valido boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique(studio_id, cacheado_en)
);

create index if not exists idx_decision_snapshots_studio_valid
  on public.decision_snapshots(studio_id, es_valido, valido_hasta desc);

create or replace function decision_get_cached_snapshot(p_studio_id uuid)
returns jsonb language sql stable
as $$
  select snapshot_data
  from public.decision_snapshots
  where studio_id = p_studio_id
    and es_valido = true
    and valido_hasta > now()
  order by valido_hasta desc
  limit 1
$$;

create or replace function decision_cache_snapshot(
  p_studio_id uuid,
  p_snapshot_data jsonb
)
returns uuid language plpgsql
as $$
declare
  v_id uuid;
begin
  update public.decision_snapshots
  set es_valido = false, updated_at = now()
  where studio_id = p_studio_id and es_valido = true;

  insert into public.decision_snapshots (studio_id, snapshot_data)
  values (p_studio_id, p_snapshot_data)
  returning id into v_id;

  return v_id;
end;
$$;

alter table public.decision_snapshots enable row level security;
create policy "service_role only"
  on public.decision_snapshots
  for all
  using (auth.role() = 'service_role');

grant all on table public.decision_snapshots to service_role;
grant execute on all functions in schema public to service_role;

-- Caché del snapshot del Decision OS (BATCH 2, PR #1607).
--
-- `construirSnapshot` (lib/decision/snapshot.ts) es la pieza cara del motor:
-- una docena de consultas por estudio y pasada, dos pasadas al día. Desde
-- #1607, `lib/decision/snapshot-cache.ts` guarda aquí el resultado 24 h y lo
-- reutiliza mientras siga vigente.
--
-- ⚠️ Esta migración se mergeó en #1607 y NUNCA llegó a aplicarse: el fichero
-- original declaraba `studio_id uuid references public.studios(id)`, y
-- `studios.id` es TEXT en este proyecto (`studio-jskhn51goe8p7`), así que
-- Postgres la rechazaba con «Key columns "studio_id" and "id" are of
-- incompatible types: uuid and text». Lo cazó el check de deriva
-- (deriva-migraciones.yml, rojo en main desde el 4-sep 12:30). Mientras tanto
-- el código desplegado fallaba en silencio: `snapshot-cache.ts` captura el
-- error de la RPC y reconstruye el snapshot entero, así que el cron seguía
-- funcionando y la caché no existía.
--
-- Corregido el tipo (mismo `text references public.studios(id)` que usan
-- `decision_mensajes_dia` y `recomendaciones`) y, como nunca se había aplicado
-- en ningún sitio, endurecida en este mismo fichero con el patrón del repo
-- para tablas y RPCs "solo service-role": pg_default_acl de este proyecto da
-- privilegios DIRECTO a anon/authenticated en toda tabla y función nueva de
-- public, así que hay que revocarlos explícitamente (ver socio_companeras y
-- .claude/tentare-os.md, sección Seguridad).

create table if not exists public.decision_snapshots (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  snapshot_data jsonb not null,
  cacheado_en timestamp with time zone not null default now(),
  valido_hasta timestamp with time zone not null default (now() + interval '24 hours'),
  es_valido boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (studio_id, cacheado_en)
);

comment on table public.decision_snapshots is
  'Caché 24h del SnapshotEstudio del Decision OS (lib/decision/snapshot-cache.ts). Solo service-role: RLS activa sin ninguna policy deniega a todo lo demás.';

create index if not exists idx_decision_snapshots_studio_valid
  on public.decision_snapshots (studio_id, es_valido, valido_hasta desc);

-- Lectura: el snapshot vigente más reciente del estudio, o NULL si no hay.
create or replace function public.decision_get_cached_snapshot(p_studio_id text)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select snapshot_data
  from public.decision_snapshots
  where studio_id = p_studio_id
    and es_valido = true
    and valido_hasta > now()
  order by valido_hasta desc
  limit 1
$$;

-- Escritura: invalida lo que hubiera vigente y guarda el nuevo. Devuelve el id.
create or replace function public.decision_cache_snapshot(
  p_studio_id text,
  p_snapshot_data jsonb
)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
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

-- Sin ninguna policy, a propósito: solo lee y escribe el cliente service-role,
-- que salta la RLS. El fichero original traía una policy
-- `using (auth.role() = 'service_role')` que no aportaba nada (service_role no
-- pasa por policies) y que el advisor marcaría como auth_rls_initplan.
revoke all on table public.decision_snapshots from public, anon, authenticated;
grant all on table public.decision_snapshots to service_role;

-- Las dos RPCs son solo para el cron (requireSupabaseAdmin): los tres pasos
-- explícitos que exige .claude/tentare-os.md para funciones "solo
-- service-role". El `grant execute on all functions in schema public` del
-- fichero original se quita: era un grant global innecesario (service_role ya
-- lo tiene por defecto) que además tocaba funciones ajenas a esta migración.
revoke execute on function public.decision_get_cached_snapshot(text) from public, anon, authenticated;
revoke execute on function public.decision_cache_snapshot(text, jsonb) from public, anon, authenticated;
grant execute on function public.decision_get_cached_snapshot(text) to service_role;
grant execute on function public.decision_cache_snapshot(text, jsonb) to service_role;

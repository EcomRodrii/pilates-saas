-- PAY-5: Detector de doble cobro
-- Tabla que registra detecciones de múltiples pagos en el mismo recibo
-- Estado: DETECTADA → OMITIDA_*/PENDIENTE_APROBACION → RESUELTO

-- ⚠️ Fichero NO commiteado, tocado por la auditoría del 2026-09-19 (revísalo).
-- Tenía dos defectos que lo habrían hecho fallar al aplicarlo, los mismos que
-- dejaron a PAY-4 sin tabla:
--   · `studio_id uuid` — `studios.id` es **text** en toda la base.
--   · `detectar_dobles_cobros` es SECURITY DEFINER sin decisión escrita sobre
--     `anon`, lo que deja el listado de dobles cobros de toda la plataforma
--     llamable desde `/rest/v1/rpc/` (y rompía el test de contrato de grants).
-- Corregidos ambos aquí. La migración SIGUE SIN APLICARSE.

create table dobles_cobros_detectados (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null,
  recibo_id text not null,
  payment_intent_ids text[] not null,
  tipo text not null check (tipo in ('multiple_intent_ids', 'multiples_por_timestamp')),
  estado text not null check (estado in ('DETECTADA', 'OMITIDA_FALSO_POSITIVO', 'OMITIDA_AUTORIZADO', 'PENDIENTE_APROBACION', 'RESUELTO')),
  notas text,
  detectado_en timestamp with time zone not null default now(),
  resuelto_en timestamp with time zone,
  constraint fk_dobles_cobros_recibos foreign key (recibo_id) references recibos(id) on delete cascade
);

create index idx_dobles_cobros_studio on dobles_cobros_detectados(studio_id);
create index idx_dobles_cobros_recibo on dobles_cobros_detectados(recibo_id);
create index idx_dobles_cobros_estado on dobles_cobros_detectados(estado);

alter table dobles_cobros_detectados enable row level security;

create policy "dobles_cobros_service_role_writes" on dobles_cobros_detectados
  for insert to service_role
  with check (true);

create policy "dobles_cobros_authenticated_reads_own_studio" on dobles_cobros_detectados
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy "dobles_cobros_service_role_reads" on dobles_cobros_detectados
  for select to service_role
  using (true);

create policy "dobles_cobros_service_role_updates" on dobles_cobros_detectados
  for update to service_role
  using (true)
  with check (true);

-- RPC: detectar dobles cobros en recibos 
create or replace function detectar_dobles_cobros(
  p_dias_atras int default 7
)
returns table (
  recibo_id text,
  studio_id text,
  intents text[],
  tipo text
)
language sql
security definer
set search_path = ''
as $function$
  select
    r.id,
    r.studio_id,
    array_agg(ci.payment_intent_id),
    'multiple_intent_ids'::text
  from recibos r
  join cobros_intentos ci on ci.recibo_id = r.id
  where
    r.creado_en > now() - (p_dias_atras || ' days')::interval
    and r.studio_id is not null
    and ci.payment_intent_id is not null
  group by r.id, r.studio_id
  having count(distinct ci.payment_intent_id) > 1;
$function$;

comment on function detectar_dobles_cobros(int) is
  'Detecta recibos con múltiples payment_intent_ids distintos (posible doble cobro)';

-- Decisión explícita sobre anon/authenticated: esta RPC devuelve el libro de
-- dobles cobros de TODA la plataforma sin filtrar por estudio, así que es
-- exclusivamente de servidor. No basta con revocar PUBLIC: en este proyecto
-- `pg_default_acl` concede EXECUTE directo a anon y authenticated en cada
-- función nueva (.claude/tentare-os.md). Hay que nombrarlos a los tres.
revoke all on function public.detectar_dobles_cobros(int) from public, anon, authenticated;
grant execute on function public.detectar_dobles_cobros(int) to service_role, postgres;

-- Fase 3 (última pieza de las 13 reglas de reserva/cancelación pedidas
-- originalmente): penalización económica por cancelación tardía / no-show.
-- A diferencia de Fases 1/2a/2b/2c, esto implica DINERO REAL: un cargo a la
-- tarjeta guardada de la socia. Hoy el ciclo cancelación/no-show es 100%
-- no-monetario (solo decide si se devuelve el bono ya consumido).
--
-- Mismo patrón "hereda" de siempre: studios.<campo> + tipos_clase.<campo>
-- nullable = hereda. numeric(10,2) en EUROS, mismo tipo que recibos.importe.
alter table studios add column if not exists penalizacion_importe_eur numeric(10,2); -- NULL/0 = regla desactivada
alter table studios add column if not exists penalizacion_aplica_no_show boolean not null default true;
alter table studios add column if not exists penalizacion_aplica_cancelacion_tardia boolean not null default true;
alter table studios add column if not exists penalizacion_cobro_automatico boolean not null default false; -- default = MANUAL (más seguro)

alter table tipos_clase add column if not exists penalizacion_importe_eur numeric(10,2); -- null = hereda

comment on column studios.penalizacion_importe_eur is
  'Importe fijo en euros a cobrar por cancelación tardía o no-show. NULL o 0 = regla desactivada.';
comment on column tipos_clase.penalizacion_importe_eur is
  'NULL = hereda studios.penalizacion_importe_eur; 0 = esta clase nunca penaliza aunque el estudio sí.';
comment on column studios.penalizacion_cobro_automatico is
  'false (default) = cada cargo espera aprobación manual de un rol con permiso de dinero antes de cobrar. true = se cobra solo, como el cron de dunning.';

-- Tabla de detección + enlace con el recibo — evita cobrar dos veces la misma
-- reserva y deja histórico auditable de POR QUÉ no se cobró (sin tarjeta,
-- sin consentimiento, compensada) sin tener que leer logs.
create table if not exists public.penalizaciones (
  id text primary key,
  studio_id text not null references public.studios(id),
  socio_id text not null,
  reserva_id text not null,
  tipo text not null check (tipo in ('CANCELACION_TARDIA', 'NO_SHOW')),
  importe numeric(10,2) not null,
  estado text not null default 'DETECTADA'
    check (estado in (
      'DETECTADA', 'OMITIDA_SIN_TARJETA', 'OMITIDA_SIN_CONSENTIMIENTO',
      'OMITIDA_COMPENSADA', 'OMITIDA_REVERTIDA',
      'PENDIENTE_APROBACION', 'RECIBO_CREADO', 'COBRADA', 'FALLIDA'
    )),
  recibo_id text references public.recibos(id),
  detectada_en timestamptz not null default now(),
  procesada_en timestamptz,
  unique (reserva_id, tipo)
);

create index if not exists idx_penalizaciones_pendientes on public.penalizaciones (studio_id, estado)
  where estado in ('DETECTADA', 'PENDIENTE_APROBACION');

comment on table public.penalizaciones is
  'Fase 3: detección + ciclo de cobro de penalizaciones por cancelación tardía/no-show. Separada de reservas para no tocar su RLS ya delicada, y para auditar por qué NO se cobró sin leer logs.';

alter table public.penalizaciones enable row level security;

-- Mismo criterio que recibos/suscripciones: solo quien puede mover dinero
-- (PROPIETARIO/RECEPCION) lee/escribe. Nada de acceso para INSTRUCTOR ni para
-- anon/authenticated fuera de esos roles — es dinero, no calendario.
create policy penalizaciones_lectura on public.penalizaciones
  for select to authenticated
  using (
    studio_id = public.current_studio_id()
    and public.current_rol() in ('PROPIETARIO', 'RECEPCION')
  );

-- Sin policy de escritura para `authenticated`: todo el ciclo de vida
-- (crear/actualizar estado) lo hace service_role (cron + endpoint de
-- aprobación, que ya comprueba puedeMoverDinero en TS) o el trigger/RPC
-- SECURITY DEFINER — igual que `recibos`.

-- Trigger: detecta penalización por NO_ASISTIO sin importar si lo dispara
-- barrerNoShows (cron, UPDATE por lotes) o marcarNoShow (panel, UPDATE
-- directo) — la BD decide una vez, ambas superficies heredan la misma
-- respuesta, mismo principio que ya usa este repo en cancelar_reserva_plaza.
create or replace function public.trigger_detectar_penalizacion_no_show()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_importe numeric;
  v_tipo_clase_id text;
begin
  if new.estado = 'NO_ASISTIO' and old.estado is distinct from 'NO_ASISTIO' then
    select tipo_clase_id into v_tipo_clase_id from sesiones where id = new.sesion_id;
    select coalesce(tc.penalizacion_importe_eur, st.penalizacion_importe_eur)
      into v_importe
      from studios st
      left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = st.id
     where st.id = new.studio_id and coalesce(st.penalizacion_aplica_no_show, true);
    if v_importe is not null and v_importe > 0 and new.socio_id is not null then
      insert into penalizaciones (id, studio_id, socio_id, reserva_id, tipo, importe, estado)
        values ('pen-' || gen_random_uuid()::text, new.studio_id, new.socio_id, new.id, 'NO_SHOW', v_importe, 'DETECTADA')
        on conflict (reserva_id, tipo) do nothing;
    end if;

  -- Revertir un no-show marcado por error (revertirNoShow): anula la
  -- detección SOLO si todavía no se cobró de verdad — si ya hay recibo
  -- creado/cobrado, eso ya movió dinero real y requiere reembolso manual
  -- explícito, no un revert automático.
  elsif old.estado = 'NO_ASISTIO' and new.estado is distinct from 'NO_ASISTIO' then
    update penalizaciones
       set estado = 'OMITIDA_REVERTIDA', procesada_en = now()
     where reserva_id = new.id and tipo = 'NO_SHOW'
       and estado in ('DETECTADA', 'PENDIENTE_APROBACION');
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_penalizacion_no_show on public.reservas;
create trigger trg_penalizacion_no_show
  after update on public.reservas
  for each row execute function public.trigger_detectar_penalizacion_no_show();

-- Índice para el FK penalizaciones.recibo_id (get_advisors: unindexed_foreign_keys).
create index if not exists idx_penalizaciones_recibo_id on public.penalizaciones (recibo_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Clases fijas del estudio (Fase 1).
--
-- El estudio arma una OFERTA con nombre («Reformer · martes y jueves») a partir de
-- clases que ya se repiten en su horario; la alumna la pide eligiendo cuánto
-- tiempo, y el estudio la aprueba a mano. Aprobar da una plaza fija por cada
-- franja de la oferta, hasta la fecha elegida (`plazas_fijas.vigencia_hasta`, que
-- el motor ya respeta): esta migración NO toca `plazas_fijas` ni el motor.
--
--  · `clases_fijas`          la oferta (nombre, descripción, duraciones, tope).
--  · `clases_fijas_franjas`  sus franjas: (serie, día de la semana), NO un slot.
--    Sala, tipo, instructora, hora y aforo se leen de la serie viva —igual que la
--    vista «Horario»—, así que siguen solos a «editar esta y las siguientes» y a
--    la renovación de la serie. Sin FK a `series` a propósito: `sesiones.serie_id`
--    tampoco la tiene, y una franja cuya serie desaparece se lee como «sin clases»
--    en vez de borrarse en silencio.
--  · `solicitudes_plaza_fija`  gana el tipo `CREAR_CLASE_FIJA`: UNA petición = UNA
--    decisión sobre todas las franjas (atómica por construcción), con la duración
--    que eligió y la fecha hasta la que llegaría.
--
-- Sin políticas RLS y con los permisos de tabla quitados a anon/authenticated: todo
-- pasa por rutas de servidor con el `studio_id` de la sesión (los grants por
-- defecto de tabla SÍ llegan a anon en este proyecto, así que se quitan). Sin RPC
-- nueva: no hay gotcha de `pg_default_acl` que cerrar. Las dos tablas nuevas no
-- llevan `socio_id`, así que no entran en exportar/suprimir datos de una alumna;
-- las columnas nuevas de `solicitudes_plaza_fija` sí, y ya la cubren.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.clases_fijas (
  id text primary key default ('cf-' || gen_random_uuid()::text),
  studio_id text not null references public.studios(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  descripcion text check (descripcion is null or char_length(descripcion) <= 500),
  -- Cerrarla la deja de ofrecer; las plazas ya concedidas NO se tocan.
  activa boolean not null default true,
  -- Cuánto tiempo puede pedir la alumna, en meses. Cerradas, no una fecha libre.
  duraciones_meses integer[] not null default array[1, 3, 6],
  -- Tope de alumnas por franja; NULL = el aforo de la clase.
  plazas smallint check (plazas is null or plazas between 1 and 200),
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  constraint clases_fijas_duraciones_validas check (
    cardinality(duraciones_meses) between 1 and 6
    and duraciones_meses <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24]
  )
);

create index if not exists clases_fijas_estudio on public.clases_fijas (studio_id, activa);

create table if not exists public.clases_fijas_franjas (
  id text primary key default ('cff-' || gen_random_uuid()::text),
  clase_fija_id text not null references public.clases_fijas(id) on delete cascade,
  studio_id text not null references public.studios(id) on delete cascade,
  serie_id text not null,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  constraint clases_fijas_franjas_unica unique (clase_fija_id, serie_id, dia_semana)
);

create index if not exists clases_fijas_franjas_clase on public.clases_fijas_franjas (clase_fija_id);
create index if not exists clases_fijas_franjas_estudio on public.clases_fijas_franjas (studio_id);

alter table public.clases_fijas enable row level security;
alter table public.clases_fijas_franjas enable row level security;
revoke all on public.clases_fijas from public, anon, authenticated;
revoke all on public.clases_fijas_franjas from public, anon, authenticated;
grant all on public.clases_fijas to service_role;
grant all on public.clases_fijas_franjas to service_role;

-- ── La petición de una clase fija ────────────────────────────────────────────
alter table public.solicitudes_plaza_fija
  add column if not exists clase_fija_id text references public.clases_fijas(id) on delete cascade,
  add column if not exists duracion_meses smallint,
  add column if not exists vigencia_hasta_propuesta date;

alter table public.solicitudes_plaza_fija drop constraint if exists solicitudes_plaza_fija_tipo_check;
alter table public.solicitudes_plaza_fija add constraint solicitudes_plaza_fija_tipo_check
  check (tipo in ('CREAR', 'PAUSAR', 'REANUDAR', 'CREAR_CLASE_FIJA'));

-- Pausar y reanudar cuelgan de una plaza; crear (una plaza o una clase fija entera), no.
alter table public.solicitudes_plaza_fija drop constraint if exists solicitudes_plaza_fija_con_plaza;
alter table public.solicitudes_plaza_fija add constraint solicitudes_plaza_fija_con_plaza
  check (tipo in ('CREAR', 'CREAR_CLASE_FIJA') or plaza_id is not null);

alter table public.solicitudes_plaza_fija drop constraint if exists solicitudes_plaza_fija_clase_fija_completa;
alter table public.solicitudes_plaza_fija add constraint solicitudes_plaza_fija_clase_fija_completa
  check (tipo <> 'CREAR_CLASE_FIJA' or (
    clase_fija_id is not null and duracion_meses is not null and vigencia_hasta_propuesta is not null and plaza_id is null
  ));

-- Doble toque = la misma petición.
create unique index if not exists spf_una_pendiente_clase_fija
  on public.solicitudes_plaza_fija (socio_id, clase_fija_id)
  where estado = 'PENDIENTE' and tipo = 'CREAR_CLASE_FIJA';

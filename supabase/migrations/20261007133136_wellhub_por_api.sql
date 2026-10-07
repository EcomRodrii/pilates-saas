-- Wellhub por API (lib/plataformas/wellhub*, app/api/plataformas/wellhub/*,
-- docs/integraciones/wellhub.md). Todo lo nuevo lo toca SOLO el servidor:
-- RLS activa, sin políticas para el navegador, `service_role` con permisos.
--
-- 1) `plataforma_conexiones`: qué gym de la plataforma es cada estudio. Tabla
--    propia, y no `integraciones.config`, por dos motivos:
--    · el webhook de check-in solo trae el gym (`gym.id`) y resuelve el estudio
--      SIN sesión: esa resolución necesita un índice único (mismo motivo que
--      `integraciones.phone_number_id` de WhatsApp, migr 20260827150000). Con
--      el gym en un jsonb, una errata en dos estudios cruzaría check-ins y
--      Wellhub IDs, y uno publicaría clases en el gym del otro;
--    · el interruptor de Conexiones y el guardado genérico reescriben `config`
--      entera: apagar y encender la plataforma borraría la conexión y dejaría
--      sus clases reservables allí sin nadie que las quitara.
--    La escribe el servidor desde /interno mientras se prueba en el sandbox.
--
-- 2) `plataforma_clases`: qué clase de la plataforma es cada tipo de clase de
--    Tentare. En Wellhub una «clase» es una actividad (un tipo de clase) y un
--    «slot» es esa clase un día y una hora (una sesión, en `plataforma_eventos`).
--    Guarda el gym en el que se publicó (`contenedor_externo_id`): quitar algo
--    publicado se hace siempre con el gym de entonces, nunca con la conexión de
--    hoy, que puede haber cambiado o desaparecido. Por eso es única por tipo Y
--    gym: si el estudio cambia de gym, la clase vieja sigue apuntada (con sus
--    slots y sus reservas) mientras se crea la nueva, y se oculta después.
--
-- 3) `plataforma_eventos.contenedor_externo_id`: la clase de Wellhub de cada
--    slot (todas las rutas de un slot la piden).
--
-- 4) `plataforma_checkins`: los check-ins de la plataforma mientras se validan.
--    Validar es lo que hace que Wellhub pague la visita. El webhook apunta aquí
--    el check-in ANTES de contestar (Wellhub no reintenta tras un 200) y la
--    validación va después; el cron rehace lo pendiente. Datos mínimos: el
--    Wellhub ID solo mientras está pendiente — al resolverse se vacía (queda el
--    resultado, sin persona), así que no hay nada personal que purgar después.
--
-- 5) `reservas.estado_externo` admite dos estados más:
--    · 'Requested': la plataforma pidió la plaza, Tentare la ha dado
--      (`reservar_plaza_externa`) y aún no le ha dicho nada (PATCH RESERVED).
--    · 'Confirming': un proceso la ha cogido para confirmarla y el RESERVED pudo
--      llegar. Mientras `estado_externo_en` es reciente, nadie más le habla de
--      ella a la plataforma (dos RESERVED a la vez podían acabar en un 204 y un
--      4xx, y el 4xx habría cancelado una plaza buena).
--    El cron reintenta y decide con lo que conteste la plataforma, nunca por el
--    reloj. Y una 'Booked' que el estudio cancela aquí se anula allí
--    (CANCELLED_BY_GYM): si no, la socia la seguiría viendo reservada.

-- ── 1) plataforma_conexiones ─────────────────────────────────────────────────
create table if not exists public.plataforma_conexiones (
  id text primary key default ('pco-' || gen_random_uuid()::text),
  studio_id text not null references public.studios(id) on delete cascade,
  plataforma text not null check (plataforma in ('CLASSPASS', 'URBAN_SPORTS_CLUB', 'WELLHUB')),
  -- El gym de Wellhub (en Wellhub, un número).
  id_externo text not null check (id_externo ~ '^[0-9A-Za-z_-]{1,64}$'),
  -- El producto de Wellhub con el que se publican sus clases.
  producto_externo_id text check (producto_externo_id is null or producto_externo_id ~ '^[0-9]{1,18}$'),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists plataforma_conexiones_externo on public.plataforma_conexiones (plataforma, id_externo);
create unique index if not exists plataforma_conexiones_estudio on public.plataforma_conexiones (plataforma, studio_id);

alter table public.plataforma_conexiones enable row level security;
revoke all on public.plataforma_conexiones from anon, authenticated;
grant all on public.plataforma_conexiones to service_role;
-- La restrictiva de 20261003102845 en toda tabla con RLS (supabase/tests/rls-doble-factor.test.ts).
create policy exige_doble_factor on public.plataforma_conexiones as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- ── 2) plataforma_clases ─────────────────────────────────────────────────────
create table if not exists public.plataforma_clases (
  id text primary key default ('pcl-' || gen_random_uuid()::text),
  studio_id text not null references public.studios(id) on delete cascade,
  plataforma text not null check (plataforma in ('CLASSPASS', 'URBAN_SPORTS_CLUB', 'WELLHUB')),
  -- null = el tipo de clase se borró en Tentare: la clase sigue allí hasta ocultarla.
  tipo_clase_id text references public.tipos_clase(id) on delete set null,
  -- El gym en el que se publicó.
  contenedor_externo_id text not null,
  clase_externa_id text not null,
  visible boolean not null default true,
  huella text,
  error text,
  sincronizado_en timestamptz,
  creado_en timestamptz not null default now()
);
-- Completo, no parcial: el upsert del servidor (onConflict) no sabe usar un índice
-- parcial. Los NULL (tipos borrados) no chocan entre sí en un índice único.
create unique index if not exists plataforma_clases_tipo
  on public.plataforma_clases (plataforma, studio_id, tipo_clase_id, contenedor_externo_id);
create unique index if not exists plataforma_clases_externa
  on public.plataforma_clases (plataforma, contenedor_externo_id, clase_externa_id);
create index if not exists plataforma_clases_studio on public.plataforma_clases (studio_id);

alter table public.plataforma_clases enable row level security;
revoke all on public.plataforma_clases from anon, authenticated;
grant all on public.plataforma_clases to service_role;
create policy exige_doble_factor on public.plataforma_clases as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- ── 3) plataforma_eventos.contenedor_externo_id ──────────────────────────────
alter table public.plataforma_eventos
  add column if not exists contenedor_externo_id text;

-- ── 4) plataforma_checkins ───────────────────────────────────────────────────
create table if not exists public.plataforma_checkins (
  id text primary key default ('pck-' || gen_random_uuid()::text),
  studio_id text not null references public.studios(id) on delete cascade,
  plataforma text not null check (plataforma in ('CLASSPASS', 'URBAN_SPORTS_CLUB', 'WELLHUB')),
  -- Solo mientras está PENDIENTE (hace falta para validar). Al resolverse, null.
  id_cliente_externo text,
  -- La reserva de la plataforma, si el check-in la trae (booking_number).
  id_reserva_externa text,
  ocurrido_en timestamptz not null,
  -- Hasta cuándo se puede validar, si la plataforma lo dice.
  expira_en timestamptz,
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE', 'VALIDADO', 'YA_VALIDADO', 'SIN_CHECKIN', 'CADUCADO', 'CANCELADO', 'SIN_PERMISO', 'ERROR')),
  reserva_id text references public.reservas(id) on delete set null,
  intentos integer not null default 0,
  resuelto_en timestamptz,
  creado_en timestamptz not null default now(),
  constraint plataforma_checkins_persona_solo_pendiente
    check (estado = 'PENDIENTE' or id_cliente_externo is null)
);
-- Un mismo check-in (gym + persona + instante) entra una vez, aunque Wellhub
-- reintente el webhook. Parcial: los resueltos ya no llevan persona.
create unique index if not exists plataforma_checkins_unico
  on public.plataforma_checkins (plataforma, studio_id, id_cliente_externo, ocurrido_en)
  where id_cliente_externo is not null;
create index if not exists plataforma_checkins_pendientes
  on public.plataforma_checkins (plataforma, creado_en) where estado = 'PENDIENTE';
create index if not exists plataforma_checkins_studio on public.plataforma_checkins (studio_id, ocurrido_en desc);

alter table public.plataforma_checkins enable row level security;
revoke all on public.plataforma_checkins from anon, authenticated;
grant all on public.plataforma_checkins to service_role;
create policy exige_doble_factor on public.plataforma_checkins as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- ── 5) reservas.estado_externo: 'Requested' y 'Confirming' ───────────────────
alter table public.reservas drop constraint if exists reservas_estado_externo_valido;
alter table public.reservas
  add constraint reservas_estado_externo_valido check (
    estado_externo is null
    or estado_externo in ('Requested', 'Confirming', 'Booked', 'Cancelled', 'LateCancellation', 'CheckedIn', 'NoShow')
  );
-- Lo que el cron mira en cada pasada (conciliarWellhub): por confirmar, por
-- cancelar aquí, y lo confirmado allí que el estudio canceló aquí.
create index if not exists reservas_estado_externo_pendiente
  on public.reservas (origen, estado_externo) where estado_externo in ('Requested', 'Confirming', 'Cancelled', 'LateCancellation');
create index if not exists reservas_externa_por_anular
  on public.reservas (origen) where estado_externo = 'Booked' and estado = 'CANCELADA';

-- ── Comprobación: el navegador no ve nada de esto ────────────────────────────
do $$
declare
  v_tabla text;
  v_rol text;
begin
  foreach v_tabla in array array['plataforma_conexiones', 'plataforma_clases', 'plataforma_checkins'] loop
    foreach v_rol in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_rol, format('public.%I', v_tabla), 'SELECT')
         or has_table_privilege(v_rol, format('public.%I', v_tabla), 'INSERT')
         or has_table_privilege(v_rol, format('public.%I', v_tabla), 'UPDATE')
         or has_table_privilege(v_rol, format('public.%I', v_tabla), 'DELETE') then
        raise exception '% no debería tener permisos sobre %', v_rol, v_tabla;
      end if;
    end loop;
  end loop;
end $$;

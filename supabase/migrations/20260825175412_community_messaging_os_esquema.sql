-- Community & Messaging OS — P0, pieza 1/4: esquema, sin RLS todavía.
--
-- Núcleo de conversación nuevo, compartido por tres casos de uso: alumna↔
-- instructora, alumna↔mostrador (recepción/gerencia/propietaria) y el chat de
-- equipo (`mensajes_equipo`/`canales_equipo`, que quedan CONGELADOS — no se
-- borran ni se les toca la RLS, ver migración de backfill 4/4).
--
-- `conversaciones` es la unidad de agrupación; `conversacion_participantes`
-- resuelve QUIÉN puede leer una conversación que no sea de tipo EQUIPO (el
-- chat de equipo sigue siendo studio-wide, sin participantes explícitos);
-- `mensajes` es el cuerpo. RLS y la función guardia van en la migración 2/4 a
-- propósito — separar esquema de política dentro de un mismo P0 hace más
-- fácil revisar cada pieza por separado antes de aplicar.

create table public.conversaciones (
  id                 text primary key,
  studio_id          text not null references public.studios(id) on delete cascade,
  tipo               text not null check (tipo in ('ALUMNA_INSTRUCTORA', 'ALUMNA_MOSTRADOR', 'EQUIPO')),
  titulo             text,
  ancla_sesion_id    text references public.sesiones(id) on delete set null,
  ancla_reserva_id   text references public.reservas(id) on delete set null,
  creado_en          timestamptz not null default now(),
  ultimo_mensaje_en  timestamptz not null default now()
);
create index idx_conversaciones_studio_orden on public.conversaciones(studio_id, ultimo_mensaje_en desc);

create table public.conversacion_participantes (
  conversacion_id     text not null references public.conversaciones(id) on delete cascade,
  auth_user_id        uuid not null references auth.users(id) on delete cascade,
  rol_en_conversacion text not null check (rol_en_conversacion in ('SOCIO', 'STAFF')),
  socio_id            text references public.socios(id) on delete cascade,
  leido_hasta         timestamptz not null default '-infinity',
  unido_en            timestamptz not null default now(),
  primary key (conversacion_id, auth_user_id)
);
create index idx_conv_participantes_user on public.conversacion_participantes(auth_user_id);

create table public.mensajes (
  id                       text primary key,
  conversacion_id          text not null references public.conversaciones(id) on delete cascade,
  studio_id                text not null references public.studios(id) on delete cascade,
  remitente_auth_user_id   uuid not null references auth.users(id),
  cuerpo                   text not null check (char_length(cuerpo) between 1 and 4000),
  creado_en                timestamptz not null default now()
);
create index idx_mensajes_conversacion on public.mensajes(conversacion_id, creado_en);

-- Un mensaje nuevo sube la conversación al principio de la bandeja — mismo
-- criterio de "ordenar por actividad" que ya usa el chat de equipo en el
-- cliente (allí se calcula en TS con el último mensaje cargado; aquí conviene
-- en columna porque `idx_conversaciones_studio_orden` la usa para paginar).
create or replace function public.actualizar_ultimo_mensaje_conversacion()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.conversaciones
     set ultimo_mensaje_en = new.creado_en
   where id = new.conversacion_id;
  return new;
end;
$function$;

create trigger trg_actualizar_ultimo_mensaje
  after insert on public.mensajes
  for each row execute function public.actualizar_ultimo_mensaje_conversacion();

revoke all on function public.actualizar_ultimo_mensaje_conversacion() from public, anon;

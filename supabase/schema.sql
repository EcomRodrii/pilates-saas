-- ═══════════════════════════════════════════════════════════════════
-- PILATES SAAS — Schema completo
-- Pega esto en el SQL Editor de Supabase y ejecuta
-- ═══════════════════════════════════════════════════════════════════

-- Extensión para UUIDs (opcional, usamos text IDs propios)
-- create extension if not exists "uuid-ossp";

-- ─── Studios ─────────────────────────────────────────────────────────────────
create table if not exists studios (
  id text primary key,
  nombre text not null,
  nif text,
  razon_social text,
  direccion text,
  ciudad text,
  codigo_postal text,
  email text,
  telefono text,
  color_primario text default '#4F46E5',
  tema_portal text default 'original',
  plan text default 'BASE',
  avatar_admin text,
  owner_auth_user_id uuid references auth.users(id) on delete set null,
  slug text unique,
  creado_en timestamptz default now()
);

-- ─── Socios (miembros) ────────────────────────────────────────────────────────
create table if not exists socios (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  nombre text not null,
  apellidos text not null,
  email text not null,
  telefono text,
  nif text,
  fecha_alta timestamptz default now(),
  activo boolean default true,
  lead_stage text,
  tags text[] default '{}',
  aceptacion_fecha timestamptz,
  aceptacion_firma text,
  aceptacion_version text,
  avatar text
);

-- ─── Planes de tarifa ─────────────────────────────────────────────────────────
create table if not exists planes_tarifa (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  nombre text not null,
  descripcion text,
  precio numeric(10,2) not null,
  tipo text not null check (tipo in ('MENSUAL','BONO','PUNTUAL')),
  sesiones int,
  activo boolean default true
);

-- ─── Suscripciones ────────────────────────────────────────────────────────────
create table if not exists suscripciones (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  plan_id text references planes_tarifa(id),
  estado text not null default 'ACTIVA' check (estado in ('ACTIVA','PAUSADA','CANCELADA','EXPIRADA')),
  fecha_inicio date not null,
  fecha_fin date,
  sesiones_restantes int,
  stripe_subscription_id text
);

-- ─── Salas ───────────────────────────────────────────────────────────────────
create table if not exists salas (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  nombre text not null,
  capacidad int not null default 10,
  color text default '#6366F1'
);

-- ─── Spots (posiciones en sala) ───────────────────────────────────────────────
create table if not exists spots (
  id text primary key,
  sala_id text references salas(id) on delete cascade,
  studio_id text references studios(id) on delete cascade,
  numero int not null,
  nombre text,
  fila int default 0,
  columna int default 0,
  tipo text default 'MAT',
  activo boolean default true
);

-- ─── Tipos de clase ───────────────────────────────────────────────────────────
create table if not exists tipos_clase (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  nombre text not null,
  color text default '#4F46E5',
  duracion_minutos int default 60,
  descripcion text,
  nivel text default 'TODOS' check (nivel in ('TODOS','PRINCIPIANTE','MEDIO','AVANZADO'))
);

-- ─── Instructores ─────────────────────────────────────────────────────────────
create table if not exists instructores (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  nombre text not null,
  email text,
  telefono text,
  color text default '#4F46E5',
  activo boolean default true,
  avatar text,
  rol text default 'INSTRUCTOR',
  auth_user_id uuid references auth.users(id) on delete set null
);

-- ─── Sesiones ─────────────────────────────────────────────────────────────────
create table if not exists sesiones (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  tipo_clase_id text references tipos_clase(id),
  sala_id text references salas(id),
  instructor_id text references instructores(id),
  inicio timestamptz not null,
  fin timestamptz not null,
  aforo_maximo int not null default 10,
  cancelada boolean default false,
  notas text,
  precio_puntual numeric(10,2)
);

-- ─── Reservas ─────────────────────────────────────────────────────────────────
create table if not exists reservas (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  sesion_id text references sesiones(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  estado text not null default 'CONFIRMADA' check (estado in ('CONFIRMADA','LISTA_ESPERA','ASISTIDA','CANCELADA','NO_ASISTIO')),
  spot_id text references spots(id),
  posicion_espera int,
  check_in_en timestamptz,
  creado_en timestamptz default now()
);

-- Reserva atómica: decide CONFIRMADA vs LISTA_ESPERA e inserta en una sola
-- transacción, bloqueando la fila de la sesión (`for update`) mientras dura.
-- Antes, la decisión se tomaba en JS leyendo un snapshot de `reservas` y
-- luego insertando en un segundo paso — dos reservas concurrentes a la
-- última plaza podían leer "hay hueco" las dos y sobrevender el aforo. Con
-- el lock, la segunda transacción espera a que la primera confirme antes de
-- contar plazas, así que ve el cupo ya actualizado.
create or replace function crear_reserva_atomica(
  p_id text,
  p_studio_id text,
  p_sesion_id text,
  p_socio_id text,
  p_spot_id text default null
) returns reservas
language plpgsql
as $$
declare
  v_aforo int;
  v_confirmadas int;
  v_en_espera int;
  v_estado text;
  v_posicion int;
  v_row reservas;
begin
  select aforo_maximo into v_aforo
  from sesiones
  where id = p_sesion_id and studio_id = p_studio_id
  for update;

  if v_aforo is null then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  select count(*) into v_confirmadas
  from reservas
  where sesion_id = p_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');

  if v_confirmadas < v_aforo then
    v_estado := 'CONFIRMADA';
    v_posicion := null;
  else
    select count(*) into v_en_espera
    from reservas
    where sesion_id = p_sesion_id and estado = 'LISTA_ESPERA';
    v_estado := 'LISTA_ESPERA';
    v_posicion := v_en_espera + 1;
  end if;

  insert into reservas (id, studio_id, sesion_id, socio_id, spot_id, estado, posicion_espera)
  values (p_id, p_studio_id, p_sesion_id, p_socio_id, p_spot_id, v_estado, v_posicion)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function crear_reserva_atomica(text, text, text, text, text) to authenticated, anon, service_role;

-- ─── Recibos ──────────────────────────────────────────────────────────────────
create table if not exists recibos (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  suscripcion_id text references suscripciones(id),
  concepto text not null,
  importe numeric(10,2) not null,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','COBRADO','DEVUELTO','EN_CURSO')),
  fecha_vencimiento date not null,
  fecha_cobro date,
  fecha_devolucion date,
  intentos_reintento int default 0
);

-- ─── Facturas ─────────────────────────────────────────────────────────────────
create table if not exists facturas (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  recibo_id text references recibos(id),
  numero_completo text not null,
  fecha_emision date not null,
  receptor_nombre text,
  receptor_nif text,
  base_imponible numeric(10,2),
  tipo_iva numeric(5,2) default 21,
  cuota_iva numeric(10,2),
  total numeric(10,2),
  verifactu_hash text,
  -- Veri*Factu: cadena de huellas encadenadas por estudio (art. 7 RD 1007/2023).
  -- prev_hash = huella del registro anterior de la cadena; ts = FechaHoraHusoGen
  -- exacta usada en la huella (imprescindible para reverificar); seq = orden
  -- monotónico por estudio para localizar el extremo de la cadena.
  verifactu_prev_hash text,
  verifactu_ts text,
  verifactu_seq bigint
);

-- Migración idempotente para estudios existentes (la tabla ya existía sin estas
-- columnas). Ejecutable sobre la BD de producción sin recrear la tabla.
alter table facturas add column if not exists verifactu_prev_hash text;
alter table facturas add column if not exists verifactu_ts text;
alter table facturas add column if not exists verifactu_seq bigint;

-- ─── Citas privadas ───────────────────────────────────────────────────────────
create table if not exists citas (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  instructor_id text references instructores(id),
  tipo text not null default 'PRIVADA' check (tipo in ('PRIVADA','EVALUACION','FISIOTERAPIA','ONLINE')),
  inicio timestamptz not null,
  fin timestamptz not null,
  notas text,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','CONFIRMADA','COMPLETADA','CANCELADA','NO_ASISTIO')),
  precio numeric(10,2),
  creado_en timestamptz default now()
);

-- ─── Productos POS ────────────────────────────────────────────────────────────
create table if not exists productos_pos (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  nombre text not null,
  categoria text not null check (categoria in ('SESION','PACK','PRODUCTO','OTRO')),
  precio numeric(10,2) not null,
  activo boolean default true
);

-- ─── Ventas POS ───────────────────────────────────────────────────────────────
create table if not exists ventas_pos (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id),
  items jsonb not null default '[]',
  subtotal numeric(10,2) not null,
  descuento numeric(10,2) default 0,
  total numeric(10,2) not null,
  metodo_pago text not null check (metodo_pago in ('EFECTIVO','TARJETA','BIZUM','TRANSFERENCIA')),
  notas text,
  realizada_en timestamptz default now()
);

-- ─── Campañas de marketing ────────────────────────────────────────────────────
create table if not exists campanas (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('EMAIL','WHATSAPP','SMS')),
  asunto text,
  contenido text,
  estado text default 'BORRADOR' check (estado in ('BORRADOR','PROGRAMADA','ENVIADA','ACTIVA','PAUSADA')),
  destinatarios text default 'TODAS',
  enviados int default 0,
  abiertos int default 0,
  clics int default 0,
  creada_en timestamptz default now(),
  enviada_en timestamptz,
  programada_en timestamptz
);

-- ─── Automatizaciones ─────────────────────────────────────────────────────────
create table if not exists automatizaciones (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  nombre text not null,
  trigger text not null,
  accion text not null,
  asunto text,
  mensaje text,
  activa boolean default true,
  ejecutadas int default 0,
  creada_en timestamptz default now()
);

-- ─── Automation rules (motor avanzado) ───────────────────────────────────────
create table if not exists automation_rules (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  nombre text not null,
  descripcion text,
  icono text,
  trigger text not null,
  condicion jsonb default '{}',
  pasos jsonb default '[]',
  activa boolean default true,
  ejecutada_veces int default 0,
  ultima_ejecucion timestamptz,
  creada_en timestamptz default now()
);

-- ─── Automation logs ──────────────────────────────────────────────────────────
create table if not exists automation_logs (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  rule_id text references automation_rules(id),
  rule_name text,
  socio_id text,
  socio_nombre text,
  paso_index int,
  accion text,
  resultado text,
  detalle text,
  ejecutado_en timestamptz default now(),
  proxima_accion_en timestamptz
);

-- ─── Códigos de descuento ─────────────────────────────────────────────────────
create table if not exists codigos_descuento (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  codigo text not null,
  descripcion text,
  tipo text not null check (tipo in ('PORCENTAJE','IMPORTE_FIJO')),
  valor numeric(10,2) not null,
  usos int default 0,
  usos_max int,
  expira date,
  activo boolean default true,
  creado_en timestamptz default now()
);

-- ─── Actividad reciente ───────────────────────────────────────────────────────
create table if not exists actividad_reciente (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  tipo text not null,
  texto text not null,
  socio_id text references socios(id),
  enlace text,
  creado_en timestamptz default now()
);

-- ─── Chat de equipo (canal único compartido por negocio) ──────────────────────
create table if not exists mensajes_equipo (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  autor_instructor_id text references instructores(id) on delete set null,
  autor_nombre text not null,
  texto text not null,
  creado_en timestamptz default now()
);

-- ─── Notificaciones ───────────────────────────────────────────────────────────
create table if not exists notificaciones (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  titulo text not null,
  texto text not null,
  leida boolean default false,
  tipo text default 'INFO' check (tipo in ('INFO','AVISO','ERROR','EXITO')),
  enlace text,
  creada_en timestamptz default now()
);

-- ─── Videos on demand ─────────────────────────────────────────────────────────
create table if not exists videos_on_demand (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  titulo text not null,
  descripcion text,
  categoria text not null,
  duracion_minutos int,
  nivel text default 'TODOS',
  instructor_id text references instructores(id),
  vistas int default 0,
  likes int default 0,
  activo boolean default true,
  creado_en timestamptz default now()
);

-- ─── Posts comunidad ──────────────────────────────────────────────────────────
create table if not exists posts_comunidad (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  autor_id text,
  autor_nombre text not null,
  autor_inicial text,
  texto text not null,
  likes int default 0,
  comentarios_count int default 0,
  fijado boolean default false,
  creado_en timestamptz default now()
);

-- ─── Notas internas ───────────────────────────────────────────────────────────
create table if not exists notas_internas (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  texto text not null,
  tipo text default 'NOTA' check (tipo in ('NOTA','SISTEMA')),
  creado_en timestamptz default now()
);

-- ─── Notas de progreso ────────────────────────────────────────────────────────
create table if not exists notas_progreso (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  instructor_id text references instructores(id),
  sesion_id text,
  texto_libre text,
  progreso text,
  alertas text,
  plan_proxima_sesion text,
  ejercicios_casa text,
  creada_en timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════
-- Integraciones por negocio (Stripe, Resend, Google Calendar, WhatsApp…)
-- Solo guarda ajustes NO secretos (claves públicas, emails, flags).
-- Las claves SECRETAS viven en variables de entorno del servidor (Vercel).
-- ═══════════════════════════════════════════════════════════════════
create table if not exists integraciones (
  id text primary key,
  studio_id text not null references studios(id) on delete cascade,
  tipo text not null,
  activo boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now(),
  unique (studio_id, tipo)
);

-- RLS (Row Level Security) — política abierta para desarrollo
-- En producción real: añadir políticas por usuario autenticado
-- ═══════════════════════════════════════════════════════════════════

alter table studios enable row level security;
alter table integraciones enable row level security;
alter table socios enable row level security;
alter table planes_tarifa enable row level security;
alter table suscripciones enable row level security;
alter table salas enable row level security;
alter table spots enable row level security;
alter table tipos_clase enable row level security;
alter table instructores enable row level security;
alter table sesiones enable row level security;
alter table reservas enable row level security;
alter table recibos enable row level security;
alter table facturas enable row level security;
alter table citas enable row level security;
alter table productos_pos enable row level security;
alter table ventas_pos enable row level security;
alter table campanas enable row level security;
alter table automatizaciones enable row level security;
alter table automation_rules enable row level security;
alter table automation_logs enable row level security;
alter table codigos_descuento enable row level security;
alter table actividad_reciente enable row level security;
alter table notificaciones enable row level security;
alter table videos_on_demand enable row level security;
alter table posts_comunidad enable row level security;
alter table notas_internas enable row level security;
alter table notas_progreso enable row level security;

-- Migración: avatares predefinidos (mujer/hombre) para socios, instructores y el propietario
alter table socios add column if not exists avatar text;
alter table instructores add column if not exists avatar text;
alter table studios add column if not exists avatar_admin text;

-- Migración: roles y acceso al panel para el equipo
alter table instructores add column if not exists rol text default 'INSTRUCTOR';
alter table instructores add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

-- Migración: multi-tenancy — cada negocio tiene su propia propietaria
alter table studios add column if not exists owner_auth_user_id uuid references auth.users(id) on delete set null;

-- Migración: portal de socias con Supabase Auth (login por magic link / OTP).
-- Vincula cada socia a su usuario de auth. El vínculo se hace en el primer
-- login por email (claim), igual que instructores.auth_user_id para el equipo.
-- NO es único global: un mismo email puede ser socia de varios estudios, así
-- que el vínculo es por (socia de un estudio) → usuario de auth.
alter table socios add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
create index if not exists idx_socios_auth_user_id on socios(auth_user_id);

-- Migración: slug público para /reservar/[slug], /kiosk/[slug], /portal/[slug]
alter table studios add column if not exists slug text unique;
update studios set slug = 'tentare' where id = 'studio-1' and slug is null;

-- Migración: cobro autónomo — tarjeta guardada por socia (Stripe) y
-- trazabilidad del recibo asociado a cada propuesta de cobro en el log
alter table socios add column if not exists stripe_customer_id text;
alter table socios add column if not exists stripe_payment_method_id text;
alter table automation_logs add column if not exists recibo_id text;

-- Migración: Stripe Connect — cada estudio cobra en su propia cuenta de
-- Stripe (no en la de la plataforma). Se conecta vía OAuth desde
-- Configuración → Integraciones, sin que el estudio tenga que tocar
-- ninguna API key.
alter table studios add column if not exists stripe_account_id text;

-- Migración: suscripción de la PLATAFORMA (el SaaS cobra al estudio vía Stripe
-- Billing). Distinto de stripe_account_id, que es Connect (el estudio cobra a
-- sus socias). Sin subscription_status activo, el producto queda bloqueado.
alter table studios add column if not exists stripe_customer_id text;
alter table studios add column if not exists subscription_id text;
alter table studios add column if not exists subscription_status text;
alter table studios add column if not exists current_period_end timestamptz;

-- Migración: política de reservas y cancelaciones por estudio (auditoría C-2/C-4).
--  · cancelacion_ventana_horas: horas antes del inicio que separan una
--    cancelación "a tiempo" de una "tardía".
--  · cancelacion_devolver_bono_tardia: si en cancelación tardía se devuelve la
--    sesión al bono (false = se pierde, la penalización estándar del sector).
--  · reserva_exigir_plan: exigir plan/bono activo para que la socia reserve.
--  · reserva_max_simultaneas: tope de reservas activas futuras por socia
--    (null = sin límite).
alter table studios add column if not exists cancelacion_ventana_horas int default 12;
alter table studios add column if not exists cancelacion_devolver_bono_tardia boolean default false;
alter table studios add column if not exists reserva_exigir_plan boolean default false;
alter table studios add column if not exists reserva_max_simultaneas int;

-- Migración: registro de auditoría (quién hizo cada acción) y chat de equipo
alter table actividad_reciente add column if not exists actor_nombre text;

alter table mensajes_equipo enable row level security;
drop policy if exists "admin_mensajes_equipo" on mensajes_equipo;
create policy "admin_mensajes_equipo" on mensajes_equipo for all to authenticated
  using (studio_id = current_studio_id()) with check (studio_id = current_studio_id());

-- Migración: Portal de miembros — perfil completo y preferencias del alumno
alter table socios add column if not exists fecha_nacimiento date;
alter table socios add column if not exists direccion text;
alter table socios add column if not exists foto_url text;

-- Migración: programa de referidos ("invita a una amiga")
alter table socios add column if not exists referido_por text references socios(id) on delete set null;

-- Migración: foto del tipo de clase (ej. la sala de Reformer) — se muestra
-- en la tarjeta de reserva en el portal de socias.
alter table tipos_clase add column if not exists foto_url text;
-- Tope mensual de recompensas por regla (sobre todo REFERIDO_AMIGO): máximo de
-- veces al mes que una misma socia puede cobrar por esta regla. NULL = sin tope.
alter table reward_rules add column if not exists tope_mensual int;

create table if not exists preferencias_socio (
  socio_id text primary key references socios(id) on delete cascade,
  studio_id text references studios(id) on delete cascade,
  disponibilidad jsonb not null default '{}',
  instructor_favorito_id text references instructores(id) on delete set null,
  tipo_clase_favorita text,
  duracion_preferida int,
  nivel text,
  notif_email boolean not null default true,
  notif_whatsapp boolean not null default true,
  actualizado_en timestamptz not null default now()
);
alter table preferencias_socio enable row level security;
drop policy if exists "admin_preferencias_socio" on preferencias_socio;
drop policy if exists "public_read_preferencias_socio" on preferencias_socio;
drop policy if exists "public_write_preferencias_socio" on preferencias_socio;
create policy "admin_preferencias_socio" on preferencias_socio for all to authenticated
  using (studio_id = current_studio_id()) with check (studio_id = current_studio_id());
drop policy if exists "public_read_preferencias_socio" on preferencias_socio;
create policy "public_read_preferencias_socio" on preferencias_socio for select to anon using (true);
drop policy if exists "public_write_preferencias_socio" on preferencias_socio;
create policy "public_write_preferencias_socio" on preferencias_socio for insert to anon with check (true);
drop policy if exists "public_update_preferencias_socio" on preferencias_socio;
create policy "public_update_preferencias_socio" on preferencias_socio for update to anon using (true) with check (true);

-- Migración: Gamificación — créditos y recompensas (Fase 2, bloque 1)
-- El valor de cada acción SIEMPRE se lee de reward_rules — nunca hardcodeado.
create table if not exists reward_rules (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  trigger text not null,
  nombre text not null,
  descripcion text,
  creditos int not null default 0,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists reward_actions (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  trigger text not null,
  ref_id text,
  creado_en timestamptz not null default now(),
  unique (studio_id, trigger, ref_id)
);

create table if not exists reward_history (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  rule_id text references reward_rules(id) on delete set null,
  action_id text references reward_actions(id) on delete set null,
  creditos int not null,
  descripcion text not null,
  creado_en timestamptz not null default now()
);

create table if not exists credit_transactions (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  tipo text not null check (tipo in ('GANANCIA', 'CANJE')),
  creditos int not null,
  descripcion text not null,
  ref_id text,
  creado_en timestamptz not null default now()
);

create table if not exists member_credits (
  socio_id text primary key references socios(id) on delete cascade,
  studio_id text references studios(id) on delete cascade,
  saldo int not null default 0,
  total_ganado int not null default 0,
  total_canjeado int not null default 0,
  actualizado_en timestamptz not null default now()
);

create table if not exists reward_catalog (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  nombre text not null,
  descripcion text,
  coste_creditos int not null default 0,
  icono text not null default '🎁',
  activo boolean not null default true,
  stock int,
  creado_en timestamptz not null default now()
);

create table if not exists reward_redemptions (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  catalog_item_id text references reward_catalog(id) on delete cascade,
  creditos_gastados int not null,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'ENTREGADO', 'CANCELADO')),
  creado_en timestamptz not null default now()
);

-- Migración: Gamificación — logros (Fase 2, bloque 2)
-- El umbral de cada logro (5 clases, 10 clases...) SIEMPRE sale de
-- achievement_definitions — nunca hardcodeado en el motor.
create table if not exists achievement_definitions (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  metric text not null,
  nombre text not null,
  descripcion text,
  umbral int not null default 1,
  icono text not null default '🏆',
  creditos_recompensa int not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists achievement_progress (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  achievement_id text references achievement_definitions(id) on delete cascade,
  progreso_actual int not null default 0,
  completado boolean not null default false,
  completado_en timestamptz,
  unique (socio_id, achievement_id)
);

create table if not exists achievement_history (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  achievement_id text references achievement_definitions(id) on delete cascade,
  nombre text not null,
  icono text not null,
  creado_en timestamptz not null default now()
);

-- Migración: Gamificación — niveles (Fase 2, bloque 4)
-- El nivel de una socia se calcula sobre su total histórico de créditos
-- ganados (member_credits.total_ganado) — el umbral de cada nivel lo decide
-- el estudio aquí, nunca hardcodeado en el motor (lib/level-engine.ts).
create table if not exists level_definitions (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  nombre text not null,
  orden int not null default 0,
  umbral_creditos int not null default 0,
  color text not null default '#B08D57',
  icono text not null default '🏅',
  beneficios text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Migración: Gamificación — retos (Fase 2, bloque 5)
-- Como un logro, pero con fecha_inicio/fecha_fin: solo cuenta lo ocurrido
-- dentro de esa ventana (lib/challenge-engine.ts). Reutiliza el mismo
-- catálogo de métricas que achievement_definitions (campo metric).
create table if not exists challenge_definitions (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  nombre text not null,
  descripcion text,
  icono text not null default '🎯',
  metric text not null,
  objetivo int not null default 1,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  creditos_recompensa int not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists challenge_progress (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  challenge_id text references challenge_definitions(id) on delete cascade,
  progreso_actual int not null default 0,
  completado boolean not null default false,
  completado_en timestamptz,
  unique (socio_id, challenge_id)
);

create table if not exists challenge_history (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  socio_id text references socios(id) on delete cascade,
  challenge_id text references challenge_definitions(id) on delete cascade,
  nombre text not null,
  icono text not null,
  creado_en timestamptz not null default now()
);

-- Migración: gráficos personalizados del dashboard — solo el panel del
-- negocio los usa, sin acceso público.
create table if not exists dashboard_charts (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  nombre text not null,
  tipo text not null default 'LINEA' check (tipo in ('LINEA', 'BARRAS')),
  metrica text not null,
  agrupacion text not null default 'MES' check (agrupacion in ('DIA', 'SEMANA', 'MES')),
  rango int not null default 6,
  color text not null default '#F7A6C4',
  creado_en timestamptz not null default now()
);
alter table dashboard_charts enable row level security;
drop policy if exists "admin_dashboard_charts" on dashboard_charts;
create policy "admin_dashboard_charts" on dashboard_charts for all to authenticated using (studio_id = current_studio_id()) with check (studio_id = current_studio_id());

-- Migración: copias de seguridad. El contenido (columna datos) solo lo tocan
-- rutas de servidor con la service role key — el panel autenticado solo
-- puede LEER metadatos (nunca la columna datos, que no se selecciona desde
-- el cliente) y no puede insertar/borrar directamente: crear y restaurar
-- pasan siempre por /api/backups/*, que valida rol de propietaria para
-- restaurar.
create table if not exists backups (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  tipo text not null check (tipo in ('DIARIO', 'SEMANAL', 'MENSUAL', 'MANUAL')),
  datos jsonb not null,
  creado_en timestamptz not null default now()
);
alter table backups enable row level security;
drop policy if exists "admin_read_backups" on backups;
-- Solo propietaria: un backup es un volcado conjunto de todas las tablas
-- (recibos, socios...), más sensible que cualquiera de ellas por separado.
drop policy if exists "admin_read_backups" on backups;
create policy "admin_read_backups" on backups for select to authenticated using (current_rol() = 'PROPIETARIO' and studio_id = current_studio_id());

do $$
declare
  t text;
  gamification_tables text[] := array[
    'reward_rules', 'reward_actions', 'reward_history', 'credit_transactions',
    'member_credits', 'reward_catalog', 'reward_redemptions',
    'achievement_definitions', 'achievement_progress', 'achievement_history',
    'level_definitions',
    'challenge_definitions', 'challenge_progress', 'challenge_history'
  ];
begin
  foreach t in array gamification_tables loop
    execute format('alter table %s enable row level security', t);
    execute format('drop policy if exists "admin_%s" on %s', t, t);
    execute format('drop policy if exists "public_read_%s" on %s', t, t);
    execute format('drop policy if exists "public_write_%s" on %s', t, t);
    execute format('drop policy if exists "public_update_%s" on %s', t, t);
    -- Personal del estudio: acceso completo a su propio negocio.
    execute format('create policy "admin_%s" on %s for all to authenticated using (studio_id = current_studio_id()) with check (studio_id = current_studio_id())', t, t);
    -- Portal de miembros (sesión anónima por email, no Supabase Auth): la
    -- socia necesita leer su saldo/historial y el catálogo, e insertar sus
    -- propias acciones/transacciones/canjes.
    execute format('create policy "public_read_%s" on %s for select to anon using (true)', t, t);
    execute format('create policy "public_write_%s" on %s for insert to anon with check (true)', t, t);
    execute format('create policy "public_update_%s" on %s for update to anon using (true) with check (true)', t, t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- Políticas de acceso
--
-- El panel de administración vive detrás del login de Supabase Auth
-- (app/(dashboard)/layout.tsx), así que sus tablas solo se conceden a
-- "authenticated". Un puñado de tablas SÍ necesitan acceso anónimo
-- porque las usan páginas públicas sin sesión: /reservar (reservas de
-- visitantes), /kiosk (check-in en tablet compartida) y /portal
-- (portal de socias, con su propio login por email — no Supabase Auth).
-- Ese acceso anon se concede tabla por tabla y solo con las operaciones
-- que esas páginas realmente necesitan (nunca DELETE, y nunca sobre
-- tablas con datos sensibles como integraciones, notas internas o
-- logs de automatización).
--
-- Roles: el equipo (tabla instructores) tiene un campo `rol`
-- (PROPIETARIO / RECEPCION / INSTRUCTOR). current_rol() mira si el
-- usuario autenticado tiene una fila en instructores vinculada por
-- auth_user_id; si no la tiene (el login original del negocio, o
-- cualquier cuenta que aún no se haya vinculado a un miembro del
-- equipo) se trata como PROPIETARIO — mantiene el comportamiento
-- actual de un solo admin sin romper nada.
--
-- Multi-tenancy: current_studio_id() resuelve a qué negocio pertenece
-- el usuario autenticado (por su fila en instructores, o si es
-- propietaria de un negocio por studios.owner_auth_user_id), cayendo
-- a 'studio-1' solo como compatibilidad con el negocio único que ya
-- existía antes de esta migración. A partir de aquí, TODAS las tablas
-- del panel exigen studio_id = current_studio_id() además del rol —
-- sin esto, cualquier cuenta autenticada de un negocio podía leer los
-- datos de otro negocio con solo tener sesión iniciada.
--
-- Nota importante: las páginas públicas (/reservar, /kiosk, /portal)
-- siguen sin aislar por negocio en este pase — todas ven el mismo
-- negocio por defecto. Aislarlas requiere decidir cómo se referencia
-- cada negocio en la URL pública (subdominio, /reservar/tu-estudio...)
-- antes de tocar sus políticas anon.
-- ═══════════════════════════════════════════════════════════════════

create or replace function current_rol() returns text as $$
  -- Rol del usuario: el de su ficha de instructora, o PROPIETARIO si es la
  -- dueña del negocio (studios.owner_auth_user_id). SIN fallback general: antes
  -- devolvía 'PROPIETARIO' a CUALQUIER usuario autenticado sin ficha —una
  -- escalada de privilegios—. Ahora un usuario no vinculado obtiene NULL.
  select coalesce(
    (select rol from instructores where auth_user_id = auth.uid() limit 1),
    (select 'PROPIETARIO' from studios where owner_auth_user_id = auth.uid() limit 1)
  );
$$ language sql stable security definer;

create or replace function current_studio_id() returns text as $$
  -- Resuelve el estudio del usuario autenticado: primero como instructora
  -- vinculada, luego como propietaria. SIN fallback: si no resuelve devuelve
  -- NULL, y `studio_id = null` no casa ninguna fila (antes caía a 'studio-1',
  -- filtrando los datos de ese negocio a cualquier usuario no resuelto).
  select coalesce(
    (select studio_id from instructores where auth_user_id = auth.uid() limit 1),
    (select id from studios where owner_auth_user_id = auth.uid() limit 1)
  );
$$ language sql stable security definer;

-- Tablas solo para la propietaria: configuración del negocio, marketing,
-- automatizaciones y sus registros — nada de esto debe verlo ni tocarlo
-- recepción ni una instructora, y nunca de otro negocio.
do $$
declare
  t text;
  owner_tables text[] := array[
    'integraciones','automatizaciones','automation_rules','automation_logs',
    'campanas','codigos_descuento','notas_internas','actividad_reciente'
  ];
begin
  foreach t in array owner_tables loop
    execute format('drop policy if exists "allow_all_%s" on %s', t, t);
    execute format('drop policy if exists "admin_%s" on %s', t, t);
    execute format('drop policy if exists "owner_%s" on %s', t, t);
    execute format('create policy "owner_%s" on %s for all to authenticated using (current_rol() = ''PROPIETARIO'' and studio_id = current_studio_id()) with check (current_rol() = ''PROPIETARIO'' and studio_id = current_studio_id())', t, t);
  end loop;
end $$;

-- Tablas operativas: cualquier miembro del equipo con sesión (recepción,
-- instructora o propietaria) las necesita para el día a día del panel,
-- pero solo las de su propio negocio.
do $$
declare
  t text;
  admin_tables text[] := array[
    'citas','productos_pos','ventas_pos','notificaciones',
    'posts_comunidad','notas_progreso'
  ];
begin
  foreach t in array admin_tables loop
    execute format('drop policy if exists "allow_all_%s" on %s', t, t);
    execute format('drop policy if exists "admin_%s" on %s', t, t);
    execute format('create policy "admin_%s" on %s for all to authenticated using (studio_id = current_studio_id()) with check (studio_id = current_studio_id())', t, t);
  end loop;
end $$;

-- Migración: buzón de soporte del widget de ayuda del dashboard — cualquier
-- miembro del equipo puede dejar una duda/mejora/bug para el equipo de
-- Tentare; solo lectura/escritura del propio negocio (nadie ve peticiones
-- de otro estudio).
create table if not exists soporte_solicitudes (
  id text primary key,
  studio_id text references studios(id) on delete cascade,
  tipo text not null default 'DUDA' check (tipo in ('DUDA', 'MEJORA', 'BUG')),
  mensaje text not null,
  contacto text,
  creado_en timestamptz not null default now()
);
alter table soporte_solicitudes enable row level security;
drop policy if exists "admin_soporte_solicitudes" on soporte_solicitudes;
create policy "admin_soporte_solicitudes" on soporte_solicitudes for all to authenticated using (studio_id = current_studio_id()) with check (studio_id = current_studio_id());

-- Tablas de negocio: acceso completo para el panel del propio negocio
-- (autenticado) + lectura pública para reservar/kiosk/portal (todavía
-- sin aislar por negocio, ver nota arriba).
do $$
declare
  t text;
  business_tables text[] := array[
    'planes_tarifa','salas','spots','tipos_clase','sesiones','facturas','videos_on_demand'
  ];
begin
  foreach t in array business_tables loop
    execute format('drop policy if exists "allow_all_%s" on %s', t, t);
    execute format('drop policy if exists "admin_%s" on %s', t, t);
    execute format('drop policy if exists "public_read_%s" on %s', t, t);
    execute format('create policy "admin_%s" on %s for all to authenticated using (studio_id = current_studio_id()) with check (studio_id = current_studio_id())', t, t);
    execute format('create policy "public_read_%s" on %s for select to anon using (true)', t, t);
  end loop;
end $$;

-- Studios: solo la propietaria edita los datos de SU negocio; lectura
-- pública para que /reservar y el portal muestren nombre/dirección/contacto
drop policy if exists "allow_all_studios" on studios;
drop policy if exists "admin_studios" on studios;
drop policy if exists "owner_studios" on studios;
drop policy if exists "public_read_studios" on studios;
create policy "owner_studios" on studios for all to authenticated using (current_rol() = 'PROPIETARIO' and id = current_studio_id()) with check (current_rol() = 'PROPIETARIO' and id = current_studio_id());
-- "to public" (no solo "to anon"): las páginas públicas por slug
-- (/reservar/[slug], /kiosk/[slug], /portal/[slug]) deben poder resolver
-- CUALQUIER negocio a partir de la URL incluso si quien navega tiene una
-- sesión de admin abierta en el mismo navegador — si esto fuera solo
-- "to anon", esa consulta autenticada caería en la política restrictiva
-- de arriba (solo ve su propio negocio) y el slug ajeno no resolvería.
drop policy if exists "public_read_studios" on studios;
create policy "public_read_studios" on studios for select to public using (true);
-- Cualquier persona autenticada puede CREAR un negocio nuevo (alta de
-- una propietaria nueva vía /crear-estudio) — no exige studio_id porque
-- todavía no existe.
drop policy if exists "insert_studios" on studios;
create policy "insert_studios" on studios for insert to authenticated with check (owner_auth_user_id = auth.uid());

-- Instructores (el equipo): cualquier miembro autenticado ve la lista de
-- SU propio negocio (para asignar clases, ver compañeras…), pero solo
-- la propietaria da de alta/edita/da de baja. La excepción es "reclamar"
-- el acceso al panel: alguien que se acaba de registrar puede vincular
-- SU propia cuenta a la fila que la propietaria le creó, pero solo si
-- el email coincide exactamente con el de su sesión, y solo mientras
-- esa fila siga sin reclamar (esta política deliberadamente NO exige
-- studio_id = current_studio_id(), porque antes de reclamar la fila la
-- cuenta nueva todavía no pertenece a ningún negocio).
drop policy if exists "allow_all_instructores" on instructores;
drop policy if exists "admin_instructores" on instructores;
drop policy if exists "read_instructores" on instructores;
drop policy if exists "owner_write_instructores" on instructores;
drop policy if exists "self_claim_instructores" on instructores;
create policy "read_instructores" on instructores for select to authenticated using (studio_id = current_studio_id());
drop policy if exists "owner_write_instructores" on instructores;
create policy "owner_write_instructores" on instructores for all to authenticated using (current_rol() = 'PROPIETARIO' and studio_id = current_studio_id()) with check (current_rol() = 'PROPIETARIO' and studio_id = current_studio_id());
drop policy if exists "self_claim_instructores" on instructores;
create policy "self_claim_instructores" on instructores for update to authenticated
  using (auth_user_id is null and email = (auth.jwt() ->> 'email'))
  with check (auth_user_id = auth.uid());

-- Socios: lectura pública (login del portal por email) + edición pública
-- limitada (una socia edita su propio avatar/perfil desde el portal).
-- El acceso autenticado (panel) se restringe al propio negocio.
drop policy if exists "allow_all_socios" on socios;
drop policy if exists "admin_socios" on socios;
drop policy if exists "public_read_socios" on socios;
drop policy if exists "public_update_socios" on socios;
create policy "admin_socios" on socios for all to authenticated using (studio_id = current_studio_id()) with check (studio_id = current_studio_id());
drop policy if exists "public_read_socios" on socios;
create policy "public_read_socios" on socios for select to anon using (true);
drop policy if exists "public_update_socios" on socios;
create policy "public_update_socios" on socios for update to anon using (true) with check (true);

-- Suscripciones: la app pública necesita ver el bono activo y descontar
-- sesiones al hacer check-in en el kiosco. El acceso autenticado se
-- restringe al propio negocio.
drop policy if exists "allow_all_suscripciones" on suscripciones;
drop policy if exists "admin_suscripciones" on suscripciones;
drop policy if exists "public_read_suscripciones" on suscripciones;
drop policy if exists "public_update_suscripciones" on suscripciones;
create policy "admin_suscripciones" on suscripciones for all to authenticated using (studio_id = current_studio_id()) with check (studio_id = current_studio_id());
drop policy if exists "public_read_suscripciones" on suscripciones;
create policy "public_read_suscripciones" on suscripciones for select to anon using (true);
drop policy if exists "public_update_suscripciones" on suscripciones;
create policy "public_update_suscripciones" on suscripciones for update to anon using (true) with check (true);

-- Reservas: reservar (crear/cancelar) y kiosk (check-in) son públicos por
-- diseño. El acceso autenticado se restringe al propio negocio.
drop policy if exists "allow_all_reservas" on reservas;
drop policy if exists "admin_reservas" on reservas;
drop policy if exists "public_read_reservas" on reservas;
drop policy if exists "public_write_reservas" on reservas;
create policy "admin_reservas" on reservas for all to authenticated using (studio_id = current_studio_id()) with check (studio_id = current_studio_id());
drop policy if exists "public_read_reservas" on reservas;
create policy "public_read_reservas" on reservas for select to anon using (true);
drop policy if exists "public_write_reservas" on reservas;
create policy "public_write_reservas" on reservas for insert to anon with check (true);
drop policy if exists "public_update_reservas" on reservas;
create policy "public_update_reservas" on reservas for update to anon using (true) with check (true);

-- Recibos: el check-in del kiosco genera un recibo de renovación cuando
-- se agota un bono, y el portal muestra el historial de pagos. El acceso
-- autenticado se restringe al propio negocio.
drop policy if exists "allow_all_recibos" on recibos;
drop policy if exists "admin_recibos" on recibos;
drop policy if exists "public_read_recibos" on recibos;
drop policy if exists "public_insert_recibos" on recibos;
create policy "admin_recibos" on recibos for all to authenticated using (studio_id = current_studio_id()) with check (studio_id = current_studio_id());
drop policy if exists "public_read_recibos" on recibos;
create policy "public_read_recibos" on recibos for select to anon using (true);
drop policy if exists "public_insert_recibos" on recibos;
create policy "public_insert_recibos" on recibos for insert to anon with check (true);

-- ═══════════════════════════════════════════════════════════════════
-- CIERRE DE LECTURA ANÓNIMA (proxy de servidor en producción)
-- Las páginas públicas (reserva/portal/kiosk) ya NO leen estas tablas con la
-- anon key: lo hacen vía /api/public/* con service-role y validación. Por eso
-- retiramos la lectura anónima de las tablas con PII / datos financieros / datos
-- por-socia. El catálogo público (clases, salas, planes, vídeos, definiciones de
-- gamificación) mantiene lectura anónima porque no es información sensible.
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists "public_read_socios" on socios;
drop policy if exists "public_read_suscripciones" on suscripciones;
drop policy if exists "public_read_reservas" on reservas;
drop policy if exists "public_read_recibos" on recibos;
drop policy if exists "public_read_preferencias_socio" on preferencias_socio;
drop policy if exists "public_read_facturas" on facturas;
drop policy if exists "public_read_member_credits" on member_credits;
drop policy if exists "public_read_reward_history" on reward_history;
drop policy if exists "public_read_credit_transactions" on credit_transactions;
drop policy if exists "public_read_reward_redemptions" on reward_redemptions;
drop policy if exists "public_read_reward_actions" on reward_actions;
drop policy if exists "public_read_achievement_progress" on achievement_progress;
drop policy if exists "public_read_achievement_history" on achievement_history;
drop policy if exists "public_read_challenge_progress" on challenge_progress;
drop policy if exists "public_read_challenge_history" on challenge_history;

-- ═══════════════════════════════════════════════════════════════════
-- CIERRE DE ESCRITURA ANÓNIMA (proxy de servidor en producción)
-- Las páginas públicas escriben vía /api/public/* con service-role y validación
-- de identidad (id+email). Se retira la escritura anónima directa.
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists "public_update_socios" on socios;
drop policy if exists "public_update_suscripciones" on suscripciones;
drop policy if exists "public_write_reservas" on reservas;
drop policy if exists "public_update_reservas" on reservas;
drop policy if exists "public_insert_recibos" on recibos;
drop policy if exists "public_write_preferencias_socio" on preferencias_socio;
drop policy if exists "public_update_preferencias_socio" on preferencias_socio;
drop policy if exists "public_write_reward_rules" on reward_rules;
drop policy if exists "public_update_reward_rules" on reward_rules;
drop policy if exists "public_write_reward_actions" on reward_actions;
drop policy if exists "public_update_reward_actions" on reward_actions;
drop policy if exists "public_write_reward_history" on reward_history;
drop policy if exists "public_update_reward_history" on reward_history;
drop policy if exists "public_write_credit_transactions" on credit_transactions;
drop policy if exists "public_update_credit_transactions" on credit_transactions;
drop policy if exists "public_write_member_credits" on member_credits;
drop policy if exists "public_update_member_credits" on member_credits;
drop policy if exists "public_write_reward_catalog" on reward_catalog;
drop policy if exists "public_update_reward_catalog" on reward_catalog;
drop policy if exists "public_write_reward_redemptions" on reward_redemptions;
drop policy if exists "public_update_reward_redemptions" on reward_redemptions;
drop policy if exists "public_write_achievement_definitions" on achievement_definitions;
drop policy if exists "public_update_achievement_definitions" on achievement_definitions;
drop policy if exists "public_write_achievement_progress" on achievement_progress;
drop policy if exists "public_update_achievement_progress" on achievement_progress;
drop policy if exists "public_write_achievement_history" on achievement_history;
drop policy if exists "public_update_achievement_history" on achievement_history;
drop policy if exists "public_write_level_definitions" on level_definitions;
drop policy if exists "public_update_level_definitions" on level_definitions;
drop policy if exists "public_write_challenge_definitions" on challenge_definitions;
drop policy if exists "public_update_challenge_definitions" on challenge_definitions;
drop policy if exists "public_write_challenge_progress" on challenge_progress;
drop policy if exists "public_update_challenge_progress" on challenge_progress;
drop policy if exists "public_write_challenge_history" on challenge_history;

-- Migración: Google Calendar (OAuth real) — mismo patrón que Stripe Connect:
-- una sola app de Google para toda la plataforma, cada estudio conecta su
-- propia cuenta. `google_calendar_email` es solo la referencia visible (no
-- sensible) que usa la UI para mostrar "Conectado" — el access/refresh token
-- de verdad vive en `integracion_credenciales`, una tabla sin ninguna policy
-- para anon/authenticated a propósito: solo rutas de servidor con la service
-- role key pueden leerla o escribirla, nunca el navegador del estudio.
alter table studios add column if not exists google_calendar_email text;
alter table sesiones add column if not exists google_event_id text;

create table if not exists integracion_credenciales (
  studio_id text references studios(id) on delete cascade,
  provider text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  actualizado_en timestamptz default now(),
  primary key (studio_id, provider)
);
alter table integracion_credenciales enable row level security;
drop policy if exists "public_update_challenge_history" on challenge_history;

-- ═══════════════════════════════════════════════════════════════════
-- AFORO TRANSACCIONAL (Fase 1) — no sobrevender + lista de espera real
--
-- El problema: crear una reserva era leer-decidir-insertar en dos pasos, así
-- que dos reservas concurrentes de la última plaza podían confirmarse ambas
-- (sobreventa). Estas funciones hacen la decisión (CONFIRMADA vs LISTA_ESPERA)
-- y la inserción DENTRO de una transacción que serializa por sesión con
-- SELECT ... FOR UPDATE. Las llaman tanto el proxy público (service-role) como
-- el panel (sesión autenticada); en el panel se exige que el estudio coincida.
-- ═══════════════════════════════════════════════════════════════════

-- Defensa en profundidad: una socia no puede tener dos reservas ACTIVAS en la
-- misma sesión aunque la lógica de la app fallara.
create unique index if not exists uq_reserva_activa_socio_sesion
  on reservas (sesion_id, socio_id)
  where estado in ('CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA');

-- I-12 · Un spot (reformer) no puede estar ocupado por dos reservas activas en
-- la misma sesión: guard atómico de la selección de sitio por la socia.
create unique index if not exists uq_reserva_spot_activo
  on reservas (sesion_id, spot_id)
  where spot_id is not null and estado in ('CONFIRMADA', 'ASISTIDA');

-- I-3 · Serie de clases recurrentes: las sesiones creadas juntas comparten un
-- serie_id, para poder editar/cancelar "esta y las siguientes" sin tocar 50
-- sesiones a mano. null = clase suelta.
alter table sesiones add column if not exists serie_id text;
create index if not exists idx_sesiones_serie on sesiones (serie_id) where serie_id is not null;

create or replace function reservar_plaza(
  p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text
) returns table(estado text, posicion_espera int)
language plpgsql security definer as $$
#variable_conflict use_column
declare
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
begin
  -- Aislamiento por negocio en llamadas autenticadas (panel). Las de
  -- service-role (endpoints públicos) no tienen auth.uid() y se saltan el check.
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  -- Serializa las reservas concurrentes de ESTA sesión.
  select aforo_maximo into v_aforo
    from sesiones where id = p_sesion_id and studio_id = p_studio_id
    for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  if exists (
    select 1 from reservas
    where sesion_id = p_sesion_id and socio_id = p_socio_id
      and estado in ('CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA')
  ) then
    raise exception 'YA_RESERVADA';
  end if;

  select count(*) into v_ocupadas
    from reservas
    where sesion_id = p_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');

  if v_aforo is null or v_ocupadas < v_aforo then
    v_estado := 'CONFIRMADA';
    v_pos := null;
  else
    select count(*) into v_espera
      from reservas where sesion_id = p_sesion_id and estado = 'LISTA_ESPERA';
    v_estado := 'LISTA_ESPERA';
    v_pos := v_espera + 1;
  end if;

  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en)
    values (p_reserva_id, p_studio_id, p_sesion_id, p_socio_id, v_estado, null, v_pos, null, now());

  return query select v_estado, v_pos;
end;
$$;

-- Cancela una reserva y, si liberó una plaza confirmada, promociona atómicamente
-- a la primera de la lista de espera. Devuelve si la cancelada era confirmada
-- (para devolver bono) y a quién se promovió (para consumirle el bono).
create or replace function cancelar_reserva_plaza(
  p_studio_id text, p_reserva_id text, p_socio_id text
) returns table(era_confirmada boolean, promovida_socio_id text)
language plpgsql security definer as $$
declare
  v_sesion_id text;
  v_estado text;
  v_res_socio text;
  v_promo_id text;
  v_promo_socio text;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  select sesion_id, estado, socio_id into v_sesion_id, v_estado, v_res_socio
    from reservas where id = p_reserva_id and studio_id = p_studio_id
    for update;
  if not found then raise exception 'RESERVA_NO_ENCONTRADA'; end if;
  if p_socio_id is not null and v_res_socio is distinct from p_socio_id then
    raise exception 'NO_AUTORIZADO';
  end if;
  if v_estado = 'CANCELADA' then
    return query select false, null::text;
    return;
  end if;

  -- Serializa con nuevas reservas / otras cancelaciones de la misma sesión.
  perform 1 from sesiones where id = v_sesion_id for update;

  update reservas set estado = 'CANCELADA', posicion_espera = null where id = p_reserva_id;

  if v_estado in ('CONFIRMADA', 'ASISTIDA') then
    select id, socio_id into v_promo_id, v_promo_socio
      from reservas
      where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
      order by posicion_espera asc nulls last
      limit 1 for update;
    if found then
      update reservas set estado = 'CONFIRMADA', posicion_espera = null where id = v_promo_id;
    end if;
  end if;

  return query select (v_estado in ('CONFIRMADA', 'ASISTIDA')), v_promo_socio;
end;
$$;

grant execute on function reservar_plaza(text, text, text, text) to authenticated, service_role;
grant execute on function cancelar_reserva_plaza(text, text, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════
-- P0-20 · Ajuste ATÓMICO del saldo de créditos (gamificación).
--
-- Antes el saldo se actualizaba leer-calcular-sobrescribir en JS + upsert de la
-- fila entera: dos canjes/otorgamientos concurrentes de la misma socia leían el
-- mismo saldo inicial y el último upsert pisaba al otro (transacción perdida o
-- canje por encima del saldo). Aquí el incremento es atómico (on conflict do
-- update sobre la propia fila) y se prohíbe el saldo negativo.
-- ═══════════════════════════════════════════════════════════════════
create or replace function ajustar_creditos(
  p_socio_id text, p_studio_id text,
  p_delta_saldo int, p_delta_ganado int, p_delta_canjeado int
) returns int
language plpgsql security definer as $$
declare v_saldo int;
begin
  insert into member_credits (socio_id, studio_id, saldo, total_ganado, total_canjeado, actualizado_en)
    values (p_socio_id, p_studio_id, p_delta_saldo, p_delta_ganado, p_delta_canjeado, now())
  on conflict (socio_id) do update set
    saldo = member_credits.saldo + p_delta_saldo,
    total_ganado = member_credits.total_ganado + p_delta_ganado,
    total_canjeado = member_credits.total_canjeado + p_delta_canjeado,
    actualizado_en = now()
  returning saldo into v_saldo;
  if v_saldo < 0 then
    raise exception 'SALDO_INSUFICIENTE';
  end if;
  return v_saldo;
end;
$$;

grant execute on function ajustar_creditos(text, text, int, int, int) to authenticated, anon, service_role;

-- ═══════════════════════════════════════════════════════════════════
-- P0-1 · ÍNDICES multi-tenant. Sin esto, cada query por studio_id es un
-- sequential scan de la tabla entera (todas las filas de todos los
-- tenants mezcladas). Índices B-tree (studio_id, ...) según el patrón de
-- acceso real; en las tablas calientes, compuestos que además cubren el
-- filtro por studio_id solo (columna líder).
-- ═══════════════════════════════════════════════════════════════════

-- Índice (studio_id) en todas las tablas tenant salvo las calientes (que
-- llevan compuesto).
create index if not exists idx_achievement_definitions_studio on achievement_definitions(studio_id);
create index if not exists idx_achievement_history_studio on achievement_history(studio_id);
create index if not exists idx_achievement_progress_studio on achievement_progress(studio_id);
create index if not exists idx_actividad_reciente_studio on actividad_reciente(studio_id);
create index if not exists idx_automation_logs_studio on automation_logs(studio_id);
create index if not exists idx_automation_rules_studio on automation_rules(studio_id);
create index if not exists idx_automatizaciones_studio on automatizaciones(studio_id);
create index if not exists idx_backups_studio on backups(studio_id);
create index if not exists idx_campanas_studio on campanas(studio_id);
create index if not exists idx_challenge_definitions_studio on challenge_definitions(studio_id);
create index if not exists idx_challenge_history_studio on challenge_history(studio_id);
create index if not exists idx_challenge_progress_studio on challenge_progress(studio_id);
create index if not exists idx_citas_studio on citas(studio_id);
create index if not exists idx_codigos_descuento_studio on codigos_descuento(studio_id);
create index if not exists idx_credit_transactions_studio on credit_transactions(studio_id);
create index if not exists idx_dashboard_charts_studio on dashboard_charts(studio_id);
create index if not exists idx_facturas_studio on facturas(studio_id);
create index if not exists idx_instructores_studio on instructores(studio_id);
create index if not exists idx_integracion_credenciales_studio on integracion_credenciales(studio_id);
create index if not exists idx_integraciones_studio on integraciones(studio_id);
create index if not exists idx_level_definitions_studio on level_definitions(studio_id);
create index if not exists idx_member_credits_studio on member_credits(studio_id);
create index if not exists idx_mensajes_equipo_studio on mensajes_equipo(studio_id);
create index if not exists idx_notas_internas_studio on notas_internas(studio_id);
create index if not exists idx_notas_progreso_studio on notas_progreso(studio_id);
create index if not exists idx_notificaciones_studio on notificaciones(studio_id);
create index if not exists idx_planes_tarifa_studio on planes_tarifa(studio_id);
create index if not exists idx_posts_comunidad_studio on posts_comunidad(studio_id);
create index if not exists idx_preferencias_socio_studio on preferencias_socio(studio_id);
create index if not exists idx_productos_pos_studio on productos_pos(studio_id);
create index if not exists idx_reward_actions_studio on reward_actions(studio_id);
create index if not exists idx_reward_catalog_studio on reward_catalog(studio_id);
create index if not exists idx_reward_history_studio on reward_history(studio_id);
create index if not exists idx_reward_redemptions_studio on reward_redemptions(studio_id);
create index if not exists idx_reward_rules_studio on reward_rules(studio_id);
create index if not exists idx_salas_studio on salas(studio_id);
create index if not exists idx_soporte_solicitudes_studio on soporte_solicitudes(studio_id);
create index if not exists idx_tipos_clase_studio on tipos_clase(studio_id);
create index if not exists idx_ventas_pos_studio on ventas_pos(studio_id);
create index if not exists idx_videos_on_demand_studio on videos_on_demand(studio_id);

-- Tablas calientes: compuestos por patrón de acceso.
create index if not exists idx_reservas_studio_sesion on reservas(studio_id, sesion_id);
create index if not exists idx_reservas_studio_socio on reservas(studio_id, socio_id);
create index if not exists idx_reservas_sesion_estado on reservas(sesion_id, estado);
create index if not exists idx_sesiones_studio_inicio on sesiones(studio_id, inicio);
create index if not exists idx_suscripciones_studio_socio on suscripciones(studio_id, socio_id);
create index if not exists idx_recibos_studio_estado_venc on recibos(studio_id, estado, fecha_vencimiento);
create index if not exists idx_recibos_studio_socio on recibos(studio_id, socio_id);
create index if not exists idx_spots_studio_sala on spots(studio_id, sala_id);
create index if not exists idx_socios_studio_email on socios(studio_id, lower(email));

-- ═══════════════════════════════════════════════════════════════════
-- P0-6 · studio_id NOT NULL en las 45 tablas tenant.
--
-- La invariante del multi-tenant (toda fila pertenece a un negocio) no la
-- garantizaba la BD, solo la disciplina del código. Un insert sin studio_id
-- creaba filas huérfanas invisibles para siempre. Esto lo prohíbe la BD.
-- REQUISITO: no puede haber filas con studio_id NULL (backfill antes). Si
-- algún ALTER falla, esa tabla tiene huérfanos que hay que resolver.
-- ═══════════════════════════════════════════════════════════════════
alter table achievement_definitions alter column studio_id set not null;
alter table achievement_history alter column studio_id set not null;
alter table achievement_progress alter column studio_id set not null;
alter table actividad_reciente alter column studio_id set not null;
alter table automation_logs alter column studio_id set not null;
alter table automation_rules alter column studio_id set not null;
alter table automatizaciones alter column studio_id set not null;
alter table backups alter column studio_id set not null;
alter table campanas alter column studio_id set not null;
alter table challenge_definitions alter column studio_id set not null;
alter table challenge_history alter column studio_id set not null;
alter table challenge_progress alter column studio_id set not null;
alter table citas alter column studio_id set not null;
alter table codigos_descuento alter column studio_id set not null;
alter table credit_transactions alter column studio_id set not null;
alter table dashboard_charts alter column studio_id set not null;
alter table facturas alter column studio_id set not null;
alter table instructores alter column studio_id set not null;
alter table integracion_credenciales alter column studio_id set not null;
alter table integraciones alter column studio_id set not null;
alter table level_definitions alter column studio_id set not null;
alter table member_credits alter column studio_id set not null;
alter table mensajes_equipo alter column studio_id set not null;
alter table notas_internas alter column studio_id set not null;
alter table notas_progreso alter column studio_id set not null;
alter table notificaciones alter column studio_id set not null;
alter table planes_tarifa alter column studio_id set not null;
alter table posts_comunidad alter column studio_id set not null;
alter table preferencias_socio alter column studio_id set not null;
alter table productos_pos alter column studio_id set not null;
alter table recibos alter column studio_id set not null;
alter table reservas alter column studio_id set not null;
alter table reward_actions alter column studio_id set not null;
alter table reward_catalog alter column studio_id set not null;
alter table reward_history alter column studio_id set not null;
alter table reward_redemptions alter column studio_id set not null;
alter table reward_rules alter column studio_id set not null;
alter table salas alter column studio_id set not null;
alter table sesiones alter column studio_id set not null;
alter table socios alter column studio_id set not null;
alter table soporte_solicitudes alter column studio_id set not null;
alter table spots alter column studio_id set not null;
alter table suscripciones alter column studio_id set not null;
alter table tipos_clase alter column studio_id set not null;
alter table ventas_pos alter column studio_id set not null;
alter table videos_on_demand alter column studio_id set not null;

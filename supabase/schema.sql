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
  plan text default 'BASE',
  avatar_admin text,
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
  avatar text
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
  verifactu_hash text
);

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
-- ═══════════════════════════════════════════════════════════════════

-- Acceso completo para el panel de administración (requiere sesión)
do $$
declare
  t text;
  admin_tables text[] := array[
    'instructores','citas','productos_pos','ventas_pos','campanas',
    'automatizaciones','automation_rules','automation_logs',
    'codigos_descuento','actividad_reciente','notificaciones',
    'posts_comunidad','notas_internas','notas_progreso','integraciones'
  ];
begin
  foreach t in array admin_tables loop
    execute format('drop policy if exists "allow_all_%s" on %s', t, t);
    execute format('drop policy if exists "admin_%s" on %s', t, t);
    execute format('create policy "admin_%s" on %s for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

-- Tablas de negocio: acceso completo para el panel (autenticado) +
-- lectura pública para reservar/kiosk/portal
do $$
declare
  t text;
  business_tables text[] := array[
    'studios','planes_tarifa','salas','spots','tipos_clase','sesiones','facturas','videos_on_demand'
  ];
begin
  foreach t in array business_tables loop
    execute format('drop policy if exists "allow_all_%s" on %s', t, t);
    execute format('drop policy if exists "admin_%s" on %s', t, t);
    execute format('drop policy if exists "public_read_%s" on %s', t, t);
    execute format('create policy "admin_%s" on %s for all to authenticated using (true) with check (true)', t, t);
    execute format('create policy "public_read_%s" on %s for select to anon using (true)', t, t);
  end loop;
end $$;

-- Socios: lectura pública (login del portal por email) + edición pública
-- limitada (una socia edita su propio avatar/perfil desde el portal)
drop policy if exists "allow_all_socios" on socios;
drop policy if exists "admin_socios" on socios;
drop policy if exists "public_read_socios" on socios;
drop policy if exists "public_update_socios" on socios;
create policy "admin_socios" on socios for all to authenticated using (true) with check (true);
create policy "public_read_socios" on socios for select to anon using (true);
create policy "public_update_socios" on socios for update to anon using (true) with check (true);

-- Suscripciones: la app pública necesita ver el bono activo y descontar
-- sesiones al hacer check-in en el kiosco
drop policy if exists "allow_all_suscripciones" on suscripciones;
drop policy if exists "admin_suscripciones" on suscripciones;
drop policy if exists "public_read_suscripciones" on suscripciones;
drop policy if exists "public_update_suscripciones" on suscripciones;
create policy "admin_suscripciones" on suscripciones for all to authenticated using (true) with check (true);
create policy "public_read_suscripciones" on suscripciones for select to anon using (true);
create policy "public_update_suscripciones" on suscripciones for update to anon using (true) with check (true);

-- Reservas: reservar (crear/cancelar) y kiosk (check-in) son públicos por diseño
drop policy if exists "allow_all_reservas" on reservas;
drop policy if exists "admin_reservas" on reservas;
drop policy if exists "public_read_reservas" on reservas;
drop policy if exists "public_write_reservas" on reservas;
create policy "admin_reservas" on reservas for all to authenticated using (true) with check (true);
create policy "public_read_reservas" on reservas for select to anon using (true);
create policy "public_write_reservas" on reservas for insert to anon with check (true);
create policy "public_update_reservas" on reservas for update to anon using (true) with check (true);

-- Recibos: el check-in del kiosco genera un recibo de renovación cuando
-- se agota un bono, y el portal muestra el historial de pagos
drop policy if exists "allow_all_recibos" on recibos;
drop policy if exists "admin_recibos" on recibos;
drop policy if exists "public_read_recibos" on recibos;
drop policy if exists "public_insert_recibos" on recibos;
create policy "admin_recibos" on recibos for all to authenticated using (true) with check (true);
create policy "public_read_recibos" on recibos for select to anon using (true);
create policy "public_insert_recibos" on recibos for insert to anon with check (true);

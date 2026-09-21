-- ─────────────────────────────────────────────────────────────────────────────
-- Opening OS: guía de apertura de un estudio (de local vacío a operando).
--
-- Solo persiste lo que no se puede derivar. Capacidad, demanda y riesgo se
-- calculan en TS (lib/opening/) reutilizando frecuenciaHabitual y la ventana
-- de lib/decision/senales.ts — no se duplican en SQL. Las plazas vendidas de
-- una etapa tampoco se guardan: se cuentan sobre suscripciones al leer.
--
-- Acceso: solo PROPIETARIO/MANAGER, mismo patrón que novedades_estudio
-- (20260826220000). Sin GRANT manual: 20260823124234 ya quita
-- TRUNCATE/TRIGGER/REFERENCES por defecto.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.studios add column if not exists fecha_apertura date;

create table public.opening_progreso (
  studio_id text primary key references public.studios(id) on delete cascade,
  fase text not null default 'PREPARACION'
    check (fase in ('PREPARACION','CAPTACION','PREVENTA','SOFT_OPENING',
                    'GRAND_OPENING','PRIMEROS_30','OPERANDO')),
  objetivos jsonb not null default '{}'::jsonb,
  checklist jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.opening_progreso enable row level security;

create policy admin_opening_progreso on public.opening_progreso
  for all to authenticated
  using (studio_id = public.current_studio_id()
         and public.current_rol() in ('PROPIETARIO','MANAGER'))
  with check (studio_id = public.current_studio_id()
              and public.current_rol() in ('PROPIETARIO','MANAGER'));

-- Umbrales configurables por estudio. Ausencia de fila = defaults en TS.
create table public.opening_config (
  studio_id text primary key references public.studios(id) on delete cascade,
  umbral_amarillo numeric(3,2) not null default 0.70
    check (umbral_amarillo > 0 and umbral_amarillo < 1),
  umbral_rojo numeric(3,2) not null default 0.85
    check (umbral_rojo > 0 and umbral_rojo <= 1.5),
  conversion_leads numeric(3,2) not null default 0.20
    check (conversion_leads >= 0 and conversion_leads <= 1),
  objetivo_preventa numeric(3,2) not null default 0.40
    check (objetivo_preventa > 0 and objetivo_preventa <= 1),
  ventana_analisis_dias integer not null default 42
    check (ventana_analisis_dias between 7 and 120),
  -- Supuestos cuando una socia aún no tiene historial (estudio sin abrir):
  -- se enseñan en pantalla como supuestos, nunca como hechos.
  sesiones_semana_sin_tope numeric(3,1) not null default 2.0
    check (sesiones_semana_sin_tope > 0 and sesiones_semana_sin_tope <= 7),
  semanas_bono_sin_caducidad integer not null default 8
    check (semanas_bono_sin_caducidad between 1 and 52),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opening_config_umbrales_ordenados check (umbral_amarillo < umbral_rojo)
);
alter table public.opening_config enable row level security;

create policy admin_opening_config on public.opening_config
  for all to authenticated
  using (studio_id = public.current_studio_id()
         and public.current_rol() in ('PROPIETARIO','MANAGER'))
  with check (studio_id = public.current_studio_id()
              and public.current_rol() in ('PROPIETARIO','MANAGER'));

-- La FK de launch_stages.plan_id es compuesta (plan_id, studio_id): la RLS solo
-- mira el studio_id de la fila, y una FK simple dejaría enlazar el plan de otro
-- estudio. `id` ya es PK, así que este índice no cambia qué filas caben.
create unique index if not exists planes_tarifa_id_studio on public.planes_tarifa(id, studio_id);

create table public.launch_stages (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  etapa text not null
    check (etapa in ('LISTA_ESPERA','ACCESO_ANTICIPADO','FUNDADORA','OFERTA_LANZAMIENTO','NORMAL')),
  plan_id text,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  limite_plazas integer check (limite_plazas is null or limite_plazas > 0),
  estado text not null default 'PLANIFICADA'
    check (estado in ('PLANIFICADA','ACTIVA','CERRADA')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint launch_stages_fechas check (fecha_fin > fecha_inicio),
  constraint launch_stages_plan_mismo_estudio foreign key (plan_id, studio_id)
    references public.planes_tarifa(id, studio_id) on delete set null (plan_id),
  constraint launch_stages_unica unique (studio_id, etapa, fecha_inicio)
);
alter table public.launch_stages enable row level security;

create index idx_launch_stages_studio on public.launch_stages(studio_id, estado);

create policy admin_launch_stages on public.launch_stages
  for all to authenticated
  using (studio_id = public.current_studio_id()
         and public.current_rol() in ('PROPIETARIO','MANAGER'))
  with check (studio_id = public.current_studio_id()
              and public.current_rol() in ('PROPIETARIO','MANAGER'));

create table public.alertas_opening (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  tipo text not null,
  severidad text not null check (severidad in ('CRITICA','ALTA','MEDIA','BAJA')),
  titulo text not null,
  descripcion text,
  datos jsonb not null default '{}'::jsonb,
  resuelta_en timestamptz,
  created_at timestamptz not null default now()
);
alter table public.alertas_opening enable row level security;

-- Una sola alerta ABIERTA por tipo y estudio: repetir la detección no duplica.
-- (No `DATE(created_at)`: sobre timestamptz no es IMMUTABLE y el índice no se crea.)
create unique index uq_alertas_opening_abierta
  on public.alertas_opening(studio_id, tipo) where resuelta_en is null;

create policy admin_alertas_opening on public.alertas_opening
  for all to authenticated
  using (studio_id = public.current_studio_id()
         and public.current_rol() in ('PROPIETARIO','MANAGER'))
  with check (studio_id = public.current_studio_id()
              and public.current_rol() in ('PROPIETARIO','MANAGER'));

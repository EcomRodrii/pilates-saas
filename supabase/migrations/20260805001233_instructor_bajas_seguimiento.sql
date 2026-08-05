-- Fila 18 del informe estratégico (P2, Impacto 5/Dificultad 4): "La
-- instructora se lleva alumnas al irse" → protocolo de salida + seguimiento
-- de cartera tras la baja. Diseñado con tentare-arquitecto — Fase 1 acotada:
-- reutiliza `instructor_dependency_snapshots` (fila ya existente, riesgo de
-- concentración por instructor) para el "grafo social"; esto solo añade la
-- pieza que faltaba, "qué pasó DESPUÉS de la baja".
--
-- Tabla NUEVA y separada, no una columna en `instructor_dependency_snapshots`:
-- esa tabla tiene `instructor_id` con FK `ON DELETE CASCADE` a `instructores`
-- (0018) — cualquier dato "congelado" ahí desaparecería en el mismo instante
-- de la baja dura (DELETE /api/equipo), justo lo contrario de lo que hace
-- falta para poder medir retención SEMANAS después. `instructor_id` aquí es
-- texto plano SIN FK a propósito: tiene que sobrevivir a que la ficha de
-- `instructores` ya no exista.
create table if not exists public.instructor_bajas_seguimiento (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  instructor_id text not null, -- sin FK: debe sobrevivir a la baja dura de `instructores`
  instructor_nombre text not null, -- copiado en el momento de la baja, por el mismo motivo
  fecha_baja timestamptz not null default now(),
  nivel_riesgo_al_salir text not null check (nivel_riesgo_al_salir in ('ALTO', 'MEDIO', 'BAJO')),
  porcentaje_facturacion_al_salir numeric(5,2) not null default 0,
  alumnas_cautivas_count integer not null default 0,
  -- Copia de `detalle` del último snapshot de dependencia disponible en el
  -- momento de la baja: [{socioId, nombre, gasto, pctConInstructor}]. Puede
  -- llevar hasta una semana de antigüedad (el cron de dependencia es
  -- semanal) — aceptable para un indicador de seguimiento, no para dinero.
  alumnas_cautivas jsonb not null default '[]'::jsonb,
  evaluado_en timestamptz, -- NULL = seguimiento pendiente; se rellena a las N semanas
  alumnas_retenidas_count integer -- de alumnas_cautivas, cuántas siguen viniendo al evaluar
);

create index if not exists idx_instructor_bajas_seguimiento_studio
  on public.instructor_bajas_seguimiento (studio_id, fecha_baja desc);
create index if not exists idx_instructor_bajas_seguimiento_pendientes
  on public.instructor_bajas_seguimiento (fecha_baja)
  where evaluado_en is null;

comment on table public.instructor_bajas_seguimiento is
  'Fila 18 del informe estratégico: foto de la cartera de una instructora en el momento exacto de su baja, más el seguimiento de retención a las N semanas — "¿se quedaron sus alumnas cautivas, o se fueron con ella?". instructor_id sin FK a propósito: debe sobrevivir al DELETE de instructores.';

alter table public.instructor_bajas_seguimiento enable row level security;

-- Mismo criterio que instructor_dependency_snapshots/liquidaciones: solo
-- quien gestiona el equipo lee. Sin policy de escritura para
-- authenticated/anon — solo el endpoint de baja (service-role) y el cron de
-- seguimiento (service-role) escriben aquí.
create policy instructor_bajas_seguimiento_lectura on public.instructor_bajas_seguimiento
  for select to authenticated
  using (
    studio_id = public.current_studio_id()
    and public.current_rol() in ('PROPIETARIO', 'MANAGER')
  );

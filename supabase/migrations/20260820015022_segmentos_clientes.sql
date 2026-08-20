-- Segmentos de clientes guardables (auditoría vs Momence: su CRM permite
-- combinar condiciones con AND/OR y guardar el resultado como audiencia
-- reutilizable — Tentare no tenía nada equivalente, solo etiqueta única +
-- 4 presets fijos hardcodeados en el filtro de Clientes).
--
-- `condiciones` guarda un árbol de UN nivel (grupo raíz + condiciones planas,
-- todas unidas por el mismo operador AND/OR del grupo) — no un árbol anidado
-- arbitrario: la complejidad de anidar grupos dentro de grupos no aporta
-- valor real a un estudio de Pilates con ~10 condiciones posibles, y añade
-- superficie de bug al evaluador sin necesidad. Ver lib/segmentos/tipos.ts
-- para la forma exacta (NodoSegmento).
--
-- jsonb, no una tabla de condiciones normalizada: se leen enteras siempre
-- que se evalúa un segmento (nunca por WHERE SQL dinámico — la evaluación es
-- en memoria contra los datos ya cargados del panel, mismo criterio que
-- socios.campos_extra en 0015_campos_personalizados).
create table if not exists public.segmentos_clientes (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  nombre text not null,
  condiciones jsonb not null,
  creado_por text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_segmentos_clientes_studio
  on public.segmentos_clientes (studio_id, creado_en desc);

comment on table public.segmentos_clientes is
  'Auditoría vs Momence: constructor de segmentos de clientes guardables (condiciones combinables AND/OR). Definición reutilizable por estudio, evaluada en memoria en el panel — nunca por SQL dinámico.';

alter table public.segmentos_clientes enable row level security;

-- Mismo criterio que campos_personalizados: es una definición reutilizable
-- de estudio, no dinero ni dato clínico. PROPIETARIO/MANAGER/RECEPCION
-- pueden crear/editar/borrar (puedeGestionarClientas ya les da acceso a
-- Clientes en el resto de esa pantalla, sin guard adicional aquí).
create policy segmentos_clientes_por_estudio on public.segmentos_clientes
  for all to authenticated
  using (studio_id = public.current_studio_id())
  with check (studio_id = public.current_studio_id());

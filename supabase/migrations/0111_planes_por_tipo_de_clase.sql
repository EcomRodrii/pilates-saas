-- ─────────────────────────────────────────────────────────────────────────────
-- Un bono que solo vale para ciertas clases.
--
-- Hoy un plan cubre TODO lo que se imparta. La dueña de un estudio con reformer
-- lo dijo claro: "el reformer me cuesta el doble de producir que el mat, y no
-- puedo hacer un Bono 10 Reformer que no sirva para Mat — esto me obliga a
-- cobrar mal". Es la base de su tarifa, no un capricho.
--
-- Tabla puente y no una columna `tipo_clase_id` (como en `plazas_fijas`) porque
-- un bono de reformer tiene que cubrir "Reformer Iniciación", "Intermedio" y
-- "Avanzado" a la vez: con una sola columna habría que colapsarlos en un tipo.
--
-- SEMÁNTICA, igual que en plazas_fijas: SIN filas = el plan vale para TODAS las
-- clases. Es lo que hacen hoy todos los planes existentes, así que la migración
-- no cambia el comportamiento de nadie — solo abre la puerta a restringir.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.plan_tipos_clase (
  plan_id       text not null references public.planes_tarifa(id) on delete cascade,
  tipo_clase_id text not null references public.tipos_clase(id)   on delete cascade,
  studio_id     text not null references public.studios(id)       on delete cascade,
  primary key (plan_id, tipo_clase_id)
);

comment on table public.plan_tipos_clase is
  'Tipos de clase que cubre un plan. SIN filas para un plan = cubre todas (comportamiento por defecto). Con filas = solo esas.';

-- El acceso va por `plan_id`/`studio_id`; la PK ya cubre plan_id.
create index if not exists idx_plan_tipos_clase_studio on public.plan_tipos_clase(studio_id);
create index if not exists idx_plan_tipos_clase_tipo on public.plan_tipos_clase(tipo_clase_id);

alter table public.plan_tipos_clase enable row level security;

-- Mismo criterio que el resto de tablas del catálogo: el staff del estudio.
drop policy if exists admin_plan_tipos_clase on public.plan_tipos_clase;
create policy admin_plan_tipos_clase on public.plan_tipos_clase
  for all to authenticated
  using (studio_id = public.current_studio_id())
  with check (studio_id = public.current_studio_id());

-- El portal público lee el catálogo con service-role, que salta RLS; anon no
-- necesita acceso directo.
grant select, insert, update, delete on table public.plan_tipos_clase to authenticated;

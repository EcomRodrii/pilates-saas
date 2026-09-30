-- El código del widget por ID (constructor de widgets, 30-sep-2026).
--
-- Hasta ahora el contenido de cada widget (qué clases, precio, nivel, etiqueta,
-- pestaña…) viajaba congelado en el código pegado, y cambiarlo obligaba a pegarlo
-- otra vez. Un código nuevo lleva solo `w=<id>` (o `data-widget="<id>"` sin
-- marco), y esta tabla guarda lo PUBLICADO de ese widget: lo que la propietaria
-- aplicó con «Aplicar en mi web». El borrador sigue en `studios.widget_builder`.
--
-- Decisión del fundador: UN código por widget y estudio (`unique (studio_id,
-- widget)`). El id es aleatorio y va aparte del nombre del widget a propósito:
-- si algún día hay «otro distinto» del mismo widget, los códigos ya pegados no
-- cambian.
--
-- Quién la toca:
--  - escribe SOLO el servidor (service_role), desde el endpoint de la
--    propietaria, que valida la config campo a campo;
--  - lee la propietaria de ese estudio (el panel, para saber qué hay publicado);
--  - la lectura pública (resolver un código pegado) va por servidor con
--    service_role y nunca sirve este jsonb: solo los parámetros que generaría
--    el código.
--
-- Sin datos personales (ids de catálogo, colores, textos del botón): no entra
-- en la purga de estudios vencidos, y se borra en cascada con el estudio.

create table if not exists public.widget_piezas (
  id text primary key check (id ~ '^[A-Za-z0-9]{10}$'),
  studio_id text not null references public.studios(id) on delete cascade,
  widget text not null check (widget ~ '^[a-z0-9-]{1,40}$'),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint widget_piezas_una_por_widget unique (studio_id, widget)
);

comment on table public.widget_piezas is
  'Lo publicado de cada widget del constructor, por id: un código pegado con w=<id> se resuelve con esto. Escribe solo el servidor.';

alter table public.widget_piezas enable row level security;

create policy widget_piezas_lectura_propietaria on public.widget_piezas
  for select to authenticated
  using ((select public.current_rol()) = 'PROPIETARIO' and studio_id = (select public.current_studio_id()));

revoke all on table public.widget_piezas from public, anon, authenticated;
grant select on table public.widget_piezas to authenticated;
grant all on table public.widget_piezas to service_role;

do $$
begin
  if has_table_privilege('anon', 'public.widget_piezas', 'select')
     or has_table_privilege('anon', 'public.widget_piezas', 'insert')
     or has_table_privilege('authenticated', 'public.widget_piezas', 'insert')
     or has_table_privilege('authenticated', 'public.widget_piezas', 'update')
     or has_table_privilege('authenticated', 'public.widget_piezas', 'delete')
     or not has_table_privilege('authenticated', 'public.widget_piezas', 'select')
     or not has_table_privilege('service_role', 'public.widget_piezas', 'insert')
     or not has_table_privilege('service_role', 'public.widget_piezas', 'update') then
    raise exception 'widget_piezas: grants distintos de lo previsto';
  end if;
end $$;

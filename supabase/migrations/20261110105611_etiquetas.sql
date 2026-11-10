-- ─────────────────────────────────────────────────────────────────────────────
-- Etiquetas de alumnas: un catálogo por estudio.
--
-- Hasta hoy una etiqueta era un texto suelto en `socios.tags`: la ficha ofrecía siete fijas («VIP», «Lesión»…), no había
-- forma de crear una propia desde ella ni de renombrar, juntar o quitar una de todas las alumnas a la vez, y ninguna
-- tenía color. Este catálogo da a cada estudio sus etiquetas (nombre + color) y dos operaciones que antes eran
-- imposibles sin tocar ficha por ficha: RENOMBRAR (o fusionar con otra) y ELIMINAR.
--
-- Decisiones:
--   · `socios.tags` SIGUE siendo la verdad de «quién la tiene» (la leen campañas, segmentos y el filtro de Clientas):
--     el catálogo solo añade nombre estable, color y las que aún no tiene nadie. Una etiqueta que está en alguna
--     alumna y no en el catálogo sigue siendo válida (la lista de Configuración las junta: lib/etiquetas/etiquetas.ts).
--   · Renombrar y eliminar tocan `socios.tags` de TODO el estudio, y `socios` solo se escribe por columnas desde el
--     navegador: por eso son dos RPC SECURITY DEFINER, con su guardia (`puede_gestionar_clientas()`, el mismo permiso
--     que etiquetar a mano) y acotadas al estudio de quien llama (`current_studio_id()`).
--   · Quién ve el catálogo: el equipo que gestiona clientas (no INSTRUCTOR: no ve datos de alumnas).
--   · Nada de esto es dinero, ni ledger, ni dato de salud.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.etiquetas (
  id        uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  nombre    text not null check (char_length(nombre) between 1 and 30 and nombre = btrim(nombre)),
  color     text not null default 'gris' check (color in ('gris', 'rosa', 'rojo', 'naranja', 'amarillo', 'verde', 'azul', 'violeta')),
  creada_en timestamptz not null default now()
);

comment on table public.etiquetas is
  'Catálogo de etiquetas de alumnas de cada estudio (nombre + color). Quién tiene cada una sigue en socios.tags.';

-- Dos etiquetas del mismo estudio no se distinguen por mayúsculas.
create unique index if not exists etiquetas_nombre_unico on public.etiquetas (studio_id, lower(nombre));

alter table public.etiquetas enable row level security;

drop policy if exists etiquetas_lectura on public.etiquetas;
drop policy if exists etiquetas_insert on public.etiquetas;
drop policy if exists etiquetas_update on public.etiquetas;
drop policy if exists etiquetas_delete on public.etiquetas;

-- ⚠️ Las funciones de ayuda, SIEMPRE envueltas en (select …): a pelo se evalúan por fila.
create policy etiquetas_lectura on public.etiquetas
  for select to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_clientas()));

create policy etiquetas_insert on public.etiquetas
  for insert to authenticated
  with check (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_clientas()));

create policy etiquetas_update on public.etiquetas
  for update to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_clientas()))
  with check (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_clientas()));

create policy etiquetas_delete on public.etiquetas
  for delete to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_clientas()));

-- La política restrictiva de la verificación en dos pasos, copiada de 20261003102845 (la vigila
-- supabase/tests/rls-doble-factor.test.ts: sin ella, CI falla).
drop policy if exists exige_doble_factor on public.etiquetas;
create policy exige_doble_factor on public.etiquetas as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- Grants por columnas: el navegador crea (estudio, nombre, color) y cambia el COLOR. Renombrar no es un UPDATE de
-- `nombre`: tiene que arrastrar a las alumnas, y eso es la RPC de abajo.
revoke all on public.etiquetas from anon, authenticated;
grant select on public.etiquetas to authenticated;
grant insert (studio_id, nombre, color) on public.etiquetas to authenticated;
grant update (color) on public.etiquetas to authenticated;
grant delete on public.etiquetas to authenticated;
grant all on public.etiquetas to service_role;

-- ── Renombrar o fusionar ─────────────────────────────────────────────────────
-- Cambia `p_viejo` por `p_nuevo` en el catálogo y en TODAS las alumnas del estudio que la tengan. Si `p_nuevo` ya
-- existe (en el catálogo o en alguna alumna) se FUSIONAN: la alumna que tenía las dos se queda con una sola, y el color
-- que manda es el de la que ya existía. Devuelve a cuántas alumnas ha tocado.
create or replace function public.etiqueta_renombrar(p_viejo text, p_nuevo text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_studio text := (select public.current_studio_id());
  v_viejo  text := btrim(coalesce(p_viejo, ''));
  v_nuevo  text := btrim(coalesce(p_nuevo, ''));
  v_canon  text;
  v_tocadas integer := 0;
begin
  if v_studio is null or not (select public.puede_gestionar_clientas()) then
    raise exception 'No tienes permiso para cambiar etiquetas' using errcode = '42501';
  end if;
  if char_length(v_viejo) = 0 then
    raise exception 'Falta la etiqueta que se renombra' using errcode = '22023';
  end if;
  if char_length(v_nuevo) not between 1 and 30 then
    raise exception 'El nombre de una etiqueta tiene de 1 a 30 caracteres' using errcode = '22023';
  end if;

  -- Catálogo. Si el nombre nuevo ya tiene fila (otra distinta de la vieja), la vieja se funde en ella y manda SU escritura
  -- (`v_canon`); si no, se renombra. Las etiquetas no se distinguen por mayúsculas.
  select nombre into v_canon from public.etiquetas
   where studio_id = v_studio and lower(nombre) = lower(v_nuevo) and lower(nombre) <> lower(v_viejo);
  if v_canon is not null then
    delete from public.etiquetas where studio_id = v_studio and lower(nombre) = lower(v_viejo);
  else
    v_canon := v_nuevo;
    update public.etiquetas set nombre = v_canon where studio_id = v_studio and lower(nombre) = lower(v_viejo);
  end if;

  -- Alumnas: sustituye y quita duplicados conservando el orden en que las tenía.
  with cambio as (
    update public.socios s
       set tags = (
         select coalesce(array_agg(t order by primera), '{}'::text[])
           from (
             select case when lower(u.x) in (lower(v_viejo), lower(v_canon)) then v_canon else u.x end as t, min(u.ord) as primera
               from unnest(s.tags) with ordinality as u(x, ord)
              group by 1
           ) z
       )
     where s.studio_id = v_studio
       and exists (select 1 from unnest(s.tags) as w(x) where lower(w.x) = lower(v_viejo))
    returning 1
  )
  select count(*) into v_tocadas from cambio;

  return v_tocadas;
end;
$$;

-- ── Eliminar ─────────────────────────────────────────────────────────────────
-- Quita la etiqueta del catálogo y de TODAS las alumnas del estudio. Devuelve a cuántas se la ha quitado.
create or replace function public.etiqueta_eliminar(p_nombre text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_studio text := (select public.current_studio_id());
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_tocadas integer := 0;
begin
  if v_studio is null or not (select public.puede_gestionar_clientas()) then
    raise exception 'No tienes permiso para cambiar etiquetas' using errcode = '42501';
  end if;
  if char_length(v_nombre) = 0 then
    raise exception 'Falta la etiqueta que se elimina' using errcode = '22023';
  end if;

  delete from public.etiquetas where studio_id = v_studio and lower(nombre) = lower(v_nombre);

  with cambio as (
    update public.socios s
       set tags = coalesce((select array_agg(u.x order by u.ord) from unnest(s.tags) with ordinality as u(x, ord) where lower(u.x) <> lower(v_nombre)), '{}'::text[])
     where s.studio_id = v_studio
       and exists (select 1 from unnest(s.tags) as w(x) where lower(w.x) = lower(v_nombre))
    returning 1
  )
  select count(*) into v_tocadas from cambio;

  return v_tocadas;
end;
$$;

-- ⚠️ Una función SECURITY DEFINER nace con EXECUTE para anon/authenticated/service_role (pg_default_acl): revocar solo
-- PUBLIC no basta. Las llama el panel con la sesión del equipo, así que `authenticated` SÍ; `anon` no.
revoke all on function public.etiqueta_renombrar(text, text) from public, anon, authenticated;
grant execute on function public.etiqueta_renombrar(text, text) to authenticated, service_role;
revoke all on function public.etiqueta_eliminar(text) from public, anon, authenticated;
grant execute on function public.etiqueta_eliminar(text) to authenticated, service_role;

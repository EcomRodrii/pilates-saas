-- Tentare Network — endurecimiento tras /ultrareview sobre el PR de las 11
-- fases (docs/NETWORK-IMPLEMENTATION-PLAN.md). Cierra dos huecos reales de
-- "RLS es la cerradura real" que la Fase 3 (20260813112713) dejó a medias.

-- ── 1. Autoservicio de badges de confianza vía REST directo ────────────────
-- `red_perfiles_update_propio`/`red_experiencias_update_propio` permiten al
-- dueño escribir CUALQUIER columna de su fila, `identidad_verificada_en` y
-- `estado_verificacion` incluidas — ambas solo deberían moverse desde un
-- endpoint con `getSupabaseAdmin()` (service_role). La API nunca las expone
-- en `saneaCambios`/el body aceptado, pero RLS no lo impedía: un UPDATE
-- directo con el JWT propio podía fijar `identidad_verificada_en = now()` o
-- `estado_verificacion = 'confirmada'` sin pasar por ningún estudio.
-- Un trigger, no una policy más: el filtro tiene que sobrevivir aunque la
-- policy de UPDATE cambie de forma en el futuro, y una policy no puede
-- restringir columnas concretas dentro de una misma fila.
create or replace function public.red_perfiles_proteger_verificacion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.identidad_verificada_en := old.identidad_verificada_en;
  end if;
  return new;
end;
$$;

drop trigger if exists red_perfiles_proteger_verificacion_trigger on public.red_perfiles;
create trigger red_perfiles_proteger_verificacion_trigger
  before update on public.red_perfiles
  for each row execute function public.red_perfiles_proteger_verificacion();

create or replace function public.red_experiencias_proteger_verificacion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.estado_verificacion := old.estado_verificacion;
    new.studio_id := old.studio_id;
  end if;
  return new;
end;
$$;

drop trigger if exists red_experiencias_proteger_verificacion_trigger on public.red_experiencias;
create trigger red_experiencias_proteger_verificacion_trigger
  before update on public.red_experiencias
  for each row execute function public.red_experiencias_proteger_verificacion();

-- ── 2. Evasión de moderación por delete+recreate ────────────────────────────
-- `red_perfiles_delete_propio` no miraba `estado`: un perfil suspendido
-- (Fase 10) podía autoborrarse por REST directo y recrearse en 'draft' con
-- historial limpio — la misma promesa que ya se cerró para UPDATE en Fase 3
-- (20260813112713) se había quedado sin cerrar en DELETE.
drop policy if exists red_perfiles_delete_propio on public.red_perfiles;
create policy red_perfiles_delete_propio on public.red_perfiles
  for delete to authenticated
  using (auth_user_id = auth.uid() and estado <> 'suspended');

-- ── 3. Resolver una verificación, atómico ───────────────────────────────────
-- app/api/network/verificaciones/resolver/route.ts hacía dos UPDATE
-- secuenciales (red_verificaciones_experiencia, luego red_experiencias). Si
-- el segundo fallaba, la verificación quedaba 'confirmada'/'rechazada' pero
-- la experiencia seguía en 'pendiente' — estado inconsistente, y
-- irrecuperable: /api/network/experiencia/verificar bloquea una nueva
-- solicitud mientras `estado_verificacion = 'pendiente'`. Mismo criterio que
-- `resolver_reserva_pendiente` (Fase 2a de reservas): una sola función,
-- ambos UPDATE en la misma transacción.
create or replace function public.red_resolver_verificacion_experiencia(
  p_verificacion_id text,
  p_studio_id text,
  p_aprobar boolean,
  p_resuelto_por uuid
)
returns table(experiencia_id text, perfil_auth_user_id uuid, perfil_nombre text, nombre_estudio text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_experiencia_id text;
  v_estado text;
begin
  select rve.experiencia_id, rve.estado into v_experiencia_id, v_estado
    from red_verificaciones_experiencia rve
    where rve.id = p_verificacion_id and rve.studio_id = p_studio_id
    for update;

  if not found then
    raise exception 'VERIFICACION_NO_ENCONTRADA';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'YA_RESUELTA';
  end if;

  update red_verificaciones_experiencia
    set estado = case when p_aprobar then 'confirmada' else 'rechazada' end,
        resuelto_en = now(), resuelto_por = p_resuelto_por
    where id = p_verificacion_id;

  update red_experiencias
    set estado_verificacion = case when p_aprobar then 'confirmada' else 'rechazada' end
    where id = v_experiencia_id;

  return query
    select re.id, rp.auth_user_id, rp.nombre, re.nombre_estudio
    from red_experiencias re
    join red_perfiles rp on rp.id = re.perfil_id
    where re.id = v_experiencia_id;
end;
$$;

revoke all on function public.red_resolver_verificacion_experiencia(text, text, boolean, uuid) from public;
revoke all on function public.red_resolver_verificacion_experiencia(text, text, boolean, uuid) from anon;
revoke all on function public.red_resolver_verificacion_experiencia(text, text, boolean, uuid) from authenticated;
grant execute on function public.red_resolver_verificacion_experiencia(text, text, boolean, uuid) to service_role;

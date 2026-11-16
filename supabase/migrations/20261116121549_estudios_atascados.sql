-- ═══════════════════════════════════════════════════════════════════════════
-- Estudios atascados: la lista de quién empezó el alta y lleva días sin avanzar,
-- con el seguimiento personal del fundador (contactado, pospuesta, cerrada).
--
--   1. `estudios_atascados_seguimiento`: SOLO INSERCIÓN. Cada contacto, cada
--      posposición y cada cierre es una fila: nada se pisa y todo se puede
--      auditar. La última fila de una cuenta es su estado.
--   2. `estudios_atascados_detalle()`: una fila por cuenta que empezó un alta
--      (`altas_estudio`), con las marcas que YA existen (correo, estudio, primera
--      clase, clase reservable, reserva, accesos) y su último seguimiento. Lo que
--      ya vive en otra tabla no se copia: se cruza al leer.
--
-- Quién NO sale: estudios demo o excluidos de métricas, sedes de cadena, cuentas
-- del equipo de Tentare (`plataforma_admin`), cuentas que ya trabajan en un
-- estudio ajeno (`es_equipo`) y quien ya puede recibir reservas.
--
-- Sin datos nuevos de la alumna: solo cuenta del propietario, que ya está en
-- `altas_estudio`. Solo service_role (la ruta de /interno comprueba el permiso).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.estudios_atascados_seguimiento (
  id uuid primary key default gen_random_uuid(),
  -- `auth.users.id` de la propietaria. Sin FK: el historial sobrevive a un borrado
  -- de cuenta (RGPD: la nota se borra con `on delete` desde el servidor si hace falta).
  auth_user_id uuid not null,
  accion text not null check (accion in ('contactado', 'pospuesta', 'cerrada', 'reabierta')),
  -- Solo con 'pospuesta': día de Madrid hasta el que no molesta.
  hasta date,
  nota text check (nota is null or char_length(nota) <= 500),
  -- Quién lo hizo (`plataforma_admin.auth_user_id`).
  por uuid not null,
  creado_en timestamptz not null default now(),
  check ((accion = 'pospuesta') = (hasta is not null))
);

create index if not exists estudios_atascados_seguimiento_cuenta_idx
  on public.estudios_atascados_seguimiento (auth_user_id, creado_en desc);

comment on table public.estudios_atascados_seguimiento is
  'Seguimiento personal de estudios atascados en el alta. Solo inserción; la última fila de una cuenta es su estado. Solo service_role (ruta de /interno con crm.update).';

alter table public.estudios_atascados_seguimiento enable row level security;
create policy exige_doble_factor on public.estudios_atascados_seguimiento as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
revoke all on public.estudios_atascados_seguimiento from public, anon, authenticated;
grant all on public.estudios_atascados_seguimiento to service_role;

-- ── La lista ────────────────────────────────────────────────────────────────
create or replace function public.estudios_atascados_detalle(p_limite integer default 300)
returns table (
  clave uuid,
  studio_id text,
  nombre text,
  email text,
  version text,
  alta_en timestamptz,
  email_confirmado_en timestamptz,
  estudio_creado_en timestamptz,
  ultimo_acceso_en timestamptz,
  ultima_actividad_en timestamptz,
  tiene_tipo_clase boolean,
  tiene_clase boolean,
  tiene_tarifa_activa boolean,
  clase_reservable boolean,
  tiene_reserva boolean,
  error_estudio_en timestamptz,
  seg_accion text,
  seg_creado_en timestamptz,
  seg_hasta date,
  seg_nota text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.auth_user_id as clave,
    s.id as studio_id,
    coalesce(s.nombre, a.estudio_nombre) as nombre,
    u.email::text as email,
    a.version,
    a.iniciada_en as alta_en,
    u.email_confirmed_at as email_confirmado_en,
    s.creado_en as estudio_creado_en,
    u.last_sign_in_at as ultimo_acceso_en,
    greatest(
      a.iniciada_en, u.email_confirmed_at, u.last_sign_in_at, s.creado_en, a.error_estudio_en,
      (select max(se.creado_en) from public.sesiones se where se.studio_id = s.id),
      (select max(ea.ocurrido_en) from public.embudo_alta ea where ea.studio_id = s.id)
    ) as ultima_actividad_en,
    exists (select 1 from public.tipos_clase t where t.studio_id = s.id) as tiene_tipo_clase,
    exists (select 1 from public.sesiones se where se.studio_id = s.id) as tiene_clase,
    exists (
      select 1 from public.planes_tarifa pt where pt.studio_id = s.id and pt.activo is true and pt.precio > 0
    ) as tiene_tarifa_activa,
    exists (select 1 from public.embudo_alta ea where ea.studio_id = s.id and ea.paso = 'clase_reservable') as clase_reservable,
    exists (select 1 from public.reservas r where r.studio_id = s.id) as tiene_reserva,
    a.error_estudio_en,
    g.accion as seg_accion,
    g.creado_en as seg_creado_en,
    g.hasta as seg_hasta,
    g.nota as seg_nota
  from public.altas_estudio a
  join auth.users u on u.id = a.auth_user_id
  left join public.studios s
    on s.owner_auth_user_id = a.auth_user_id and s.cadena_id is null
  left join lateral (
    select sg.accion, sg.creado_en, sg.hasta, sg.nota
      from public.estudios_atascados_seguimiento sg
     where sg.auth_user_id = a.auth_user_id
     order by sg.creado_en desc
     limit 1
  ) g on true
  where not exists (select 1 from public.instructores i where i.auth_user_id = a.auth_user_id)
    and a.version <> 'v2_prueba'
    and not coalesce(s.es_demo, false)
    and not coalesce(s.excluir_de_metricas, false)
    and not exists (select 1 from public.plataforma_admin pa where pa.auth_user_id = a.auth_user_id)
  order by a.iniciada_en desc
  limit least(greatest(coalesce(p_limite, 300), 1), 1000);
$$;

-- `revoke ... from public` NO basta en este proyecto (`pg_default_acl` da EXECUTE
-- directo a anon y authenticated): los tres pasos, explícitos.
revoke execute on function public.estudios_atascados_detalle(integer) from public;
revoke execute on function public.estudios_atascados_detalle(integer) from anon;
revoke execute on function public.estudios_atascados_detalle(integer) from authenticated;
grant execute on function public.estudios_atascados_detalle(integer) to service_role;

do $$
declare
  f text := 'public.estudios_atascados_detalle(integer)';
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, f, 'EXECUTE') then
      raise exception '% puede ejecutar %', r, f;
    end if;
  end loop;
  if not has_function_privilege('service_role', f, 'EXECUTE') then
    raise exception 'service_role no puede ejecutar %', f;
  end if;
end $$;

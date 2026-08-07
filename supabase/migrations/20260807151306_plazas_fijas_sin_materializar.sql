-- Detección de solo lectura para avisar a la socia cuando su plaza fija NO
-- se materializó esta semana. Duplica a propósito el mismo JOIN de
-- emparejamiento de materializar_plazas_fijas (0084) en vez de tocar esa RPC
-- de escritura ya probada en producción — mantener ambos sincronizados si
-- algún día cambia el criterio de emparejamiento/vigencia.
--
-- Tres motivos:
--  · 'sesion_cancelada': la sesión de esa semana está cancelada.
--  · 'suscripcion_pausada': la socia no tiene suscripción ACTIVA.
--  · 'sin_aforo': hay sesión y suscripción activa, pero no quedó hueco tras
--    priorizar por antigüedad de la plaza (mismo criterio que 0084).
-- El caso "sitio ocupado" NO se incluye: esa semana SÍ se materializa (solo
-- sin spot fijo), así que no es un hueco que avisar.
create or replace function public.plazas_fijas_sin_materializar(p_horizonte_dias int default 42)
  returns table(plaza_id text, studio_id text, socio_id text, sesion_id text, motivo text)
  language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  return query
  with matches as (
    select
      pf.id         as plaza_id,
      pf.studio_id,
      pf.socio_id,
      pf.creada_en,
      s.id          as sesion_id,
      coalesce(s.cancelada, false) as sesion_cancelada,
      not exists (
        select 1 from suscripciones su
        where su.socio_id = pf.socio_id and su.studio_id = pf.studio_id and su.estado = 'ACTIVA'
      ) as sin_suscripcion_activa,
      row_number() over (partition by pf.socio_id, s.id order by pf.creada_en, pf.id) as rn_dup
    from plazas_fijas pf
    join sesiones s
      on s.studio_id = pf.studio_id
     and s.sala_id = pf.sala_id
     and s.inicio >= now()
     and s.inicio <  now() + make_interval(days => p_horizonte_dias)
     and extract(dow from s.inicio at time zone 'Europe/Madrid') = pf.dia_semana
     and (s.inicio at time zone 'Europe/Madrid')::time = pf.hora_inicio
     and (pf.tipo_clase_id is null or s.tipo_clase_id = pf.tipo_clase_id)
     and (s.inicio at time zone 'Europe/Madrid')::date >= pf.vigencia_desde
     and (pf.vigencia_hasta is null or (s.inicio at time zone 'Europe/Madrid')::date <= pf.vigencia_hasta)
    where pf.estado = 'ACTIVA'
      and not exists (
        select 1 from reservas r
        where r.sesion_id = s.id and r.socio_id = pf.socio_id
          and r.estado in ('CONFIRMADA','LISTA_ESPERA','ASISTIDA')
      )
  ),
  dedupadas as (
    select * from matches where rn_dup = 1
  ),
  sin_hueco as (
    select
      d.plaza_id, d.studio_id, d.socio_id, d.sesion_id,
      greatest(0, aforo_efectivo(d.sesion_id) - (
        select count(*) from reservas r2
        where r2.sesion_id = d.sesion_id and r2.estado in ('CONFIRMADA','ASISTIDA')
      )) as huecos,
      row_number() over (partition by d.sesion_id order by d.creada_en, d.plaza_id) as rn
    from dedupadas d
    where not d.sesion_cancelada and not d.sin_suscripcion_activa
  )
  select d.plaza_id, d.studio_id, d.socio_id, d.sesion_id, 'sesion_cancelada'::text as motivo
  from dedupadas d where d.sesion_cancelada
  union all
  select d.plaza_id, d.studio_id, d.socio_id, d.sesion_id, 'suscripcion_pausada'::text as motivo
  from dedupadas d where not d.sesion_cancelada and d.sin_suscripcion_activa
  union all
  select h.plaza_id, h.studio_id, h.socio_id, h.sesion_id, 'sin_aforo'::text as motivo
  from sin_hueco h where h.rn > h.huecos;
end;
$$;

-- ⚠️ `revoke ... from anon, public` NO basta en este proyecto: por defecto
-- `authenticated` tiene EXECUTE propio en funciones nuevas del esquema
-- public, no solo heredado de PUBLIC — hay que revocárselo explícitamente o
-- cualquier socia/instructora autenticada podría llamarla directo y leer
-- socio_id/sesion_id de TODOS los estudios (no filtra por studio_id).
-- Verificado con has_function_privilege tras aplicar, no solo asumido.
revoke execute on function public.plazas_fijas_sin_materializar(int) from anon, public, authenticated;
grant  execute on function public.plazas_fijas_sin_materializar(int) to service_role;

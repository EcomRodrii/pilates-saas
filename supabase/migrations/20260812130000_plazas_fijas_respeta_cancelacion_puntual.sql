-- Feature #1 (autoservicio de cancelación/recuperación, ficha Lorari-vs-Tentare):
-- cancelar UNA ocurrencia de plaza fija (vía cancelarReservaPublica, reserva
-- 'res-pf-…') no debe reanularse sola. Pero el JOIN de emparejamiento de 0084
-- solo excluye reservas CONFIRMADA/LISTA_ESPERA/ASISTIDA para esa (socia,
-- sesión) — una reserva CANCELADA no está en esa lista, así que el cron
-- nocturno la vuelve a materializar esa misma noche, pisando la cancelación
-- de la socia. Detectado en diseño, antes de que ocurriera en producción.
--
-- Fix: excluir también las reservas CANCELADA cuyo id empieza por 'res-pf-'
-- (el prefijo que solo produce esta misma función) para esa (socia, sesión).
-- Acotado a ese prefijo a propósito: una reserva MANUAL cancelada antes en esa
-- sesión no debe bloquear que la plaza fija ocupe el sitio por otra vía — solo
-- su propia cancelación cuenta.
--
-- Mismo criterio aplicado en dos sitios: la RPC de escritura (materializar) y
-- su gemela de solo lectura (plazas_fijas_sin_materializar, 20260807151306) —
-- sin este segundo fix, el aviso "tu plaza fija no se hizo esta semana" le
-- llegaría a una socia que la canceló ella misma a propósito.
--
-- Firma sin cambios en ambas funciones (mismo `(int default 42)` / `(int
-- default 42) returns table(...)`) — no aplica el gotcha de grants por cambio
-- de firma, los GRANT/REVOKE ya existentes se mantienen.

create or replace function public.materializar_plazas_fijas(p_horizonte_dias int default 42)
  returns integer
  language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_creadas int;
begin
  with matches as (
    select
      pf.id         as plaza_id,
      pf.studio_id,
      pf.socio_id,
      pf.creada_en,
      s.id          as sesion_id,
      -- sitio preferido sólo si está libre en esta sesión; si no, null (sin sitio)
      case when pf.spot_id is not null and not exists (
             select 1 from reservas r3
             where r3.sesion_id = s.id and r3.spot_id = pf.spot_id
               and r3.estado in ('CONFIRMADA','ASISTIDA')
           ) then pf.spot_id else null end as spot_asignado,
      row_number() over (partition by pf.socio_id, s.id order by pf.creada_en, pf.id) as rn_dup
    from plazas_fijas pf
    join sesiones s
      on s.studio_id = pf.studio_id
     and s.sala_id = pf.sala_id
     and coalesce(s.cancelada, false) = false
     and s.inicio >= now()
     and s.inicio <  now() + make_interval(days => p_horizonte_dias)
     and extract(dow from s.inicio at time zone 'Europe/Madrid') = pf.dia_semana
     and (s.inicio at time zone 'Europe/Madrid')::time = pf.hora_inicio
     and (pf.tipo_clase_id is null or s.tipo_clase_id = pf.tipo_clase_id)
     and (s.inicio at time zone 'Europe/Madrid')::date >= pf.vigencia_desde
     and (pf.vigencia_hasta is null or (s.inicio at time zone 'Europe/Madrid')::date <= pf.vigencia_hasta)
    where pf.estado = 'ACTIVA'
      and exists (
        select 1 from suscripciones su
        where su.socio_id = pf.socio_id and su.studio_id = pf.studio_id and su.estado = 'ACTIVA'
      )
      and not exists (
        select 1 from reservas r
        where r.sesion_id = s.id and r.socio_id = pf.socio_id
          and r.estado in ('CONFIRMADA','LISTA_ESPERA','ASISTIDA')
      )
      -- Cancelación puntual de la propia plaza fija (autoservicio, Feature #1):
      -- no se re-materializa esa ocurrencia.
      and not exists (
        select 1 from reservas r5
        where r5.sesion_id = s.id and r5.socio_id = pf.socio_id
          and r5.estado = 'CANCELADA' and r5.id like 'res-pf-%'
      )
  ),
  candidatas as (
    select
      m.*,
      greatest(0, aforo_efectivo(m.sesion_id) - (
        select count(*) from reservas r2
        where r2.sesion_id = m.sesion_id and r2.estado in ('CONFIRMADA','ASISTIDA')
      )) as huecos,
      row_number() over (partition by m.sesion_id order by m.creada_en, m.plaza_id) as rn
    from matches m
    where m.rn_dup = 1
  )
  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en)
  select 'res-pf-' || gen_random_uuid()::text, studio_id, sesion_id, socio_id, 'CONFIRMADA', spot_asignado, null, null, now()
  from candidatas
  where rn <= huecos;

  get diagnostics v_creadas = row_count;
  return v_creadas;
end;
$$;

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
      -- Misma exclusión que materializar_plazas_fijas: cancelar la ocurrencia a
      -- propósito no es "no se hizo hueco" — no avisar de un hueco que la
      -- propia socia no quería.
      and not exists (
        select 1 from reservas r5
        where r5.sesion_id = s.id and r5.socio_id = pf.socio_id
          and r5.estado = 'CANCELADA' and r5.id like 'res-pf-%'
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

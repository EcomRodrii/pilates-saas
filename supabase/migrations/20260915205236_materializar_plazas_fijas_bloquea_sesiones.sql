-- ─────────────────────────────────────────────────────────────────────────────
-- C-1 (auditoría 15-sep-2026): `materializar_plazas_fijas` insertaba reservas
-- calculando el hueco libre con un `count(*)` suelto (snapshot de inicio de
-- sentencia en READ COMMITTED), sin ningún candado — a diferencia de
-- `reservar_plaza`, que bloquea la fila de `sesiones` con `for update` antes
-- de contar. Mientras esto solo corría en el cron nocturno (02:00, nadie
-- reservando) el riesgo era bajo; desde que se llama en síncrono al guardar
-- una plaza fija (en horario de mostrador, con el motor normal reservando a
-- la vez), dos pasadas concurrentes pueden ver el mismo hueco libre y las dos
-- insertar — overbooking real, sin ningún índice único que lo frene.
--
-- Fix: bloquear las sesiones candidatas (`for update`, ordenadas por id para
-- no cruzar deadlocks) ANTES de calcular huecos, mismo criterio que
-- `reservar_plaza`. La selección de sesiones a bloquear está sobre-aproximada
-- a propósito (sala + día de la semana + hora, sin cuota/vigencia/pausa):
-- bloquear alguna sesión de más que luego no recibe fila es inofensivo;
-- omitir una que sí la necesita, no. Verificado en vivo (execute_sql +
-- ROLLBACK): mismo resultado que la versión anterior contra datos reales
-- (0 creadas en ambas), y el `for update` sí toma un `RowShareLock` real
-- sobre `sesiones` (confirmado vía `pg_locks`).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.materializar_plazas_fijas(p_horizonte_dias integer DEFAULT 42, p_plaza_id text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_creadas int;
begin
  perform 1 from sesiones s
   where s.id in (
     select s2.id
     from plazas_fijas pf
     join sesiones s2
       on s2.studio_id = pf.studio_id
      and s2.sala_id = pf.sala_id
      and coalesce(s2.cancelada, false) = false
      and s2.inicio >= now()
      and s2.inicio <  now() + make_interval(days => p_horizonte_dias)
      and extract(dow from s2.inicio at time zone 'Europe/Madrid') = pf.dia_semana
      and (s2.inicio at time zone 'Europe/Madrid')::time = pf.hora_inicio
     where pf.estado = 'ACTIVA'
       and (p_plaza_id is null or pf.id = p_plaza_id)
   )
   order by s.id
   for update;

  with matches as (
    select
      pf.id         as plaza_id,
      pf.studio_id,
      pf.socio_id,
      pf.creada_en,
      s.id          as sesion_id,
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
     -- Nada que empiece dentro de la ventana de cancelación (tipo de clase y, si
     -- no la fija, la del estudio). `interval * numeric` y no
     -- make_interval(hours => …), que solo acepta enteros.
     and s.inicio >= now() + coalesce(
           (select tc0.ventana_cancelacion_horas from tipos_clase tc0 where tc0.id = s.tipo_clase_id),
           (select st0.cancelacion_ventana_horas from studios st0 where st0.id = s.studio_id),
           0) * interval '1 hour'
     and extract(dow from s.inicio at time zone 'Europe/Madrid') = pf.dia_semana
     and (s.inicio at time zone 'Europe/Madrid')::time = pf.hora_inicio
     and (pf.tipo_clase_id is null or s.tipo_clase_id = pf.tipo_clase_id)
     and (s.inicio at time zone 'Europe/Madrid')::date >= pf.vigencia_desde
     and (pf.vigencia_hasta is null or (s.inicio at time zone 'Europe/Madrid')::date <= pf.vigencia_hasta)
    where pf.estado = 'ACTIVA'
      and (p_plaza_id is null or pf.id = p_plaza_id)
      -- Pausa con fechas: esas semanas no se reservan y la plaza no se pierde.
      and not (pf.pausa_desde is not null
               and (s.inicio at time zone 'Europe/Madrid')::date between pf.pausa_desde and pf.pausa_hasta)
      and not public.fecha_en_cierre(pf.studio_id, (s.inicio at time zone 'Europe/Madrid')::date)
      -- La regla de la cuota, en su función (la comparte el barrido).
      and public.cuota_cubre_plaza_fija(pf.studio_id, pf.socio_id, s.tipo_clase_id, (s.inicio at time zone 'Europe/Madrid')::date)
      and not exists (
        select 1 from tipos_clase tc
        where tc.id = s.tipo_clase_id and coalesce(tc.requiere_autorizacion, false)
          and not exists (
            select 1 from socio_tipos_clase_autorizados a
            where a.studio_id = pf.studio_id and a.socio_id = pf.socio_id and a.tipo_clase_id = tc.id
          )
      )
      and not exists (
        select 1 from reservas r
        where r.sesion_id = s.id and r.socio_id = pf.socio_id
          and r.estado in ('CONFIRMADA','LISTA_ESPERA','ASISTIDA','PENDIENTE_APROBACION')
      )
      and not exists (
        select 1 from reservas r5
        where r5.sesion_id = s.id and r5.socio_id = pf.socio_id
          and r5.estado = 'CANCELADA' and r5.id like 'res-pf-%'
          and r5.cancelada_motivo is distinct from 'plaza_fija_retirada'
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
  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en, bono_consumo_rastreado)
  select 'res-pf-' || gen_random_uuid()::text, studio_id, sesion_id, socio_id, 'CONFIRMADA', spot_asignado, null, null, now(), false
  from candidatas
  where rn <= huecos;

  get diagnostics v_creadas = row_count;
  return v_creadas;
end;
$function$;

revoke all on function public.materializar_plazas_fijas(integer,text) from public, anon, authenticated;
grant execute on function public.materializar_plazas_fijas(integer,text) to service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.materializar_plazas_fijas(integer,text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'materializar_plazas_fijas sigue ejecutable por anon';
  END IF;
  IF has_function_privilege('authenticated', 'public.materializar_plazas_fijas(integer,text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'materializar_plazas_fijas sigue ejecutable por authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.materializar_plazas_fijas(integer,text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'materializar_plazas_fijas ya no es ejecutable por service_role';
  END IF;
END $$;

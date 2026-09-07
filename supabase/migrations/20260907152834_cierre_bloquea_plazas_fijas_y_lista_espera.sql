-- Auditoría 26ª pasada, P-4: el cierre del centro solo cerraba UNA puerta.
--
-- `fecha_en_cierre` (20260905153105_cierre_del_centro.sql) ya la respetan
-- `reservar_plaza` y `resolver_reserva_pendiente` — un socio no puede reservar
-- ni ser aprobado en un día declarado cerrado. Pero el cron de las 02:00
-- (`materializar_plazas_fijas`) seguía CONFIRMANDO plazas fijas en días
-- cerrados si el estudio declaraba el cierre DESPUÉS de crear la sesión, y
-- `promocionar_siguiente_espera` seguía promocionando desde la lista de
-- espera a esas mismas sesiones — ambas avisando a la socia de que tiene
-- clase un día que el estudio ya dijo que no abre.
--
-- La propia migración del cierre ya lo advertía: la condición "tiene que
-- seguir siendo cierto para una sesión creada DESPUÉS de declarar el
-- cierre" solo se aplicó a un camino. Este PR cierra los otros dos.
--
-- Sin urgencia real (0 filas en `cierres_estudio` en producción a día de
-- hoy) pero con el precedente del 29-ago (`lista_espera_spots_y_valoracion`,
-- una columna sin cualificar dentro de un RETURNS TABLE reventó en la
-- primera llamada con el `create or replace` ya aplicado en verde): las dos
-- funciones de abajo se verificaron ANTES de escribir esta migración con
-- `execute_sql`+`ROLLBACK`, incluido control positivo (un cierre sintético
-- bloqueando una plaza fija/oferta de lista de espera reales, y el mismo
-- escenario sin cierre confirmando que sigue funcionando con normalidad).
--
-- Ninguna de las dos cambia de firma → conserva los grants existentes
-- (materializar_plazas_fijas: SECURITY DEFINER, sin EXECUTE para
-- anon/authenticated desde 20260807151942; promocionar_siguiente_espera:
-- SECURITY INVOKER, tampoco expuesta a anon/authenticated). Verificado con
-- has_function_privilege tras aplicar — sin cambios respecto a antes.

create or replace function public.materializar_plazas_fijas(p_horizonte_dias integer default 42)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
      -- P-4: un día cerrado no materializa ninguna plaza fija, ni siquiera
      -- si el cierre se declaró DESPUÉS de crear la sesión o la plaza fija.
      and not public.fecha_en_cierre(pf.studio_id, (s.inicio at time zone 'Europe/Madrid')::date)
      and exists (
        select 1 from suscripciones su
        where su.socio_id = pf.socio_id and su.studio_id = pf.studio_id and su.estado = 'ACTIVA'
      )
      and not exists (
        select 1 from reservas r
        where r.sesion_id = s.id and r.socio_id = pf.socio_id
          and r.estado in ('CONFIRMADA','LISTA_ESPERA','ASISTIDA')
      )
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
$function$;

create or replace function public.promocionar_siguiente_espera(p_studio_id text, p_sesion_id text, p_plazo_minutos integer)
 returns table(promovida_socio_id text, oferta_socio_id text, oferta_expira_en timestamp with time zone)
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id text; v_socio text; v_expira timestamptz;
  v_aforo int; v_ocupadas int;
  v_tipo text; v_requiere boolean;
begin
  -- P-4: si el día se cerró después de que la clase se creara, no se
  -- promociona a nadie a esa sesión — mismo criterio que reservar_plaza.
  -- Nótese `s.` en todo el bloque: esta función tiene un `RETURNS TABLE` con
  -- una columna llamada `oferta_expira_en`, el mismo nombre que
  -- `reservas.oferta_expira_en` (ver el gotcha ya documentado en
  -- 20260829234415_lista_espera_spots_y_valoracion.sql) — este `exists` solo
  -- toca `sesiones`, nunca `reservas`, así que no hay ambigüedad posible.
  if not exists (
    select 1 from public.sesiones s
     where s.id = p_sesion_id
       and s.studio_id = p_studio_id
       and coalesce(s.cancelada, false) = false
       and s.inicio > now()
       and not public.fecha_en_cierre(s.studio_id, (s.inicio at time zone 'Europe/Madrid')::date)
  ) then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  select s.tipo_clase_id into v_tipo from public.sesiones s where s.id = p_sesion_id;
  select tc.requiere_autorizacion into v_requiere
    from public.tipos_clase tc where tc.id = v_tipo;

  select r.id, r.socio_id into v_id, v_socio from reservas as r
   where r.sesion_id = p_sesion_id and r.estado = 'LISTA_ESPERA' and r.oferta_expira_en is null
     and (
       not coalesce(v_requiere, false)
       or exists (
         select 1 from socio_tipos_clase_autorizados a
          where a.studio_id = p_studio_id
            and a.socio_id = r.socio_id
            and a.tipo_clase_id = v_tipo
       )
     )
   order by r.creado_en asc, r.id asc limit 1 for update;
  if not found then return query select null::text, null::text, null::timestamptz; return; end if;

  if coalesce(p_plazo_minutos,0) <= 0 then
    v_aforo := aforo_efectivo(p_sesion_id);
    select count(*) into v_ocupadas from reservas as r
     where r.sesion_id = p_sesion_id and r.estado in ('CONFIRMADA', 'ASISTIDA');
    if v_aforo is not null and v_ocupadas >= v_aforo then
      return query select null::text, null::text, null::timestamptz;
      return;
    end if;
    update reservas set estado='CONFIRMADA', posicion_espera=null, oferta_expira_en=null where id=v_id;
    return query select v_socio, null::text, null::timestamptz;
  else
    v_expira := now() + make_interval(mins => p_plazo_minutos);
    update reservas set oferta_expira_en = v_expira where id=v_id;
    return query select null::text, v_socio, v_expira;
  end if;
end; $function$;

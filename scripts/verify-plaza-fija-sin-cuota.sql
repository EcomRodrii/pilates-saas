-- Drill de la política de plaza fija sin cuota (migraciones
-- 20260915203717_plaza_fija_se_suelta_sin_cuota.sql y
-- 20260915215236_politica_plaza_fija_sin_cuota.sql), en producción y sin dejar
-- rastro: un único DO que termina en `raise exception 'DRILL_RESULT …'`, así que
-- el error trae las cifras y deshace todo. (Con `begin … rollback` por
-- execute_sql vuelve `[]` y no prueba nada.)
--
-- ⚠️ `studios` es una tabla caliente: el `lock_timeout` hace que un ALTER que no
-- consigue su lock falle en 3 s en vez de dejar en cola las lecturas del panel.
--
-- Antes de aplicar la migración, pega sus sentencias en los `execute $mig$ … $mig$`
-- marcados (cambiando `$function$` por `$f$`). Después de aplicarla, quítalos:
-- mide lo que ya está vivo.
--
-- Qué comprueba, con la primera plaza fija que tenga clases en su hueco y cuota
-- MENSUAL (si no hay ninguna, sus cifras salen null):
--   · con la cuota cancelada, MANTENER y MANTENER_SIN_PENALIZAR no sueltan nada;
--   · LIBERAR suelta todo lo del motor, también una clase dentro del plazo;
--   · una clase ya empezada no se toca;
--   · con la renovación pendiente de cobro (cuota ACTIVA vencida) no se suelta;
--   · el CHECK de penalizaciones acepta OMITIDA_SIN_CUOTA.

do $drill$
declare
  v_plaza text; v_socio text; v_studio text; v_sus text; v_sesion text;
  v_c int; v_b int; v_a int; v_a_dentro_plazo int; v_a_empezada int; v_a_gracia int; v_check_ok boolean;
begin
  perform set_config('lock_timeout', '3000', true);
  perform set_config('statement_timeout', '20000', true);

  -- execute $mig$ <sentencias de la migración> $mig$;

  select pf.id, pf.socio_id, pf.studio_id, su.id
    into v_plaza, v_socio, v_studio, v_sus
  from plazas_fijas pf
  join suscripciones su on su.socio_id = pf.socio_id and su.studio_id = pf.studio_id
  join planes_tarifa pt on pt.id = su.plan_id and pt.tipo = 'MENSUAL'
  where exists (
    select 1 from sesiones s
    where s.studio_id = pf.studio_id and s.sala_id = pf.sala_id and coalesce(s.cancelada, false) = false
      and s.inicio >= now() + interval '3 days' and s.inicio < now() + interval '42 days'
      and extract(dow from s.inicio at time zone 'Europe/Madrid') = pf.dia_semana
      and (s.inicio at time zone 'Europe/Madrid')::time = pf.hora_inicio
      and (pf.tipo_clase_id is null or s.tipo_clase_id = pf.tipo_clase_id)
      and public.plan_cubre_tipo_clase(su.plan_id, s.tipo_clase_id)
  )
  order by pf.creada_en
  limit 1;

  if v_plaza is not null then
    update plazas_fijas set estado = 'ACTIVA', pausa_desde = null, pausa_hasta = null where id = v_plaza;
    update suscripciones set estado = 'ACTIVA', baja_al_vencer = false, fecha_fin = null where id = v_sus;
    perform public.materializar_plazas_fijas(42, v_plaza);
    update suscripciones set estado = 'CANCELADA' where id = v_sus;

    update studios set plaza_fija_sin_cuota = 'MANTENER' where id = v_studio;
    select count(*) into v_c from public.reservas_plaza_fija_sin_cuota(v_studio, v_socio);
    update studios set plaza_fija_sin_cuota = 'MANTENER_SIN_PENALIZAR' where id = v_studio;
    select count(*) into v_b from public.reservas_plaza_fija_sin_cuota(v_studio, v_socio);
    update studios set plaza_fija_sin_cuota = 'LIBERAR' where id = v_studio;
    select count(*) into v_a from public.reservas_plaza_fija_sin_cuota(v_studio, v_socio);

    select r.sesion_id into v_sesion from reservas r join sesiones s on s.id = r.sesion_id
     where r.socio_id = v_socio and r.id like 'res-pf-%' and r.estado = 'CONFIRMADA' order by s.inicio limit 1;
    update sesiones set inicio = now() + interval '2 hours', fin = now() + interval '3 hours' where id = v_sesion;
    select count(*) into v_a_dentro_plazo from public.reservas_plaza_fija_sin_cuota(v_studio, v_socio);
    update sesiones set inicio = now() - interval '10 minutes', fin = now() + interval '50 minutes' where id = v_sesion;
    select count(*) into v_a_empezada from public.reservas_plaza_fija_sin_cuota(v_studio, v_socio);
    update suscripciones set estado = 'ACTIVA', fecha_fin = current_date - 2 where id = v_sus;
    select count(*) into v_a_gracia from public.reservas_plaza_fija_sin_cuota(v_studio, v_socio);
  end if;

  v_check_ok := exists (select 1 from pg_constraint where conname = 'penalizaciones_estado_check' and pg_get_constraintdef(oid) like '%OMITIDA_SIN_CUOTA%');

  raise exception 'DRILL_RESULT %', json_build_object(
    'hay_escenario', v_plaza is not null,
    'C_mantener', v_c, 'B_sin_penalizar', v_b, 'A_liberar', v_a,
    'A_con_una_dentro_del_plazo', v_a_dentro_plazo, 'A_con_una_ya_empezada', v_a_empezada,
    'A_renovacion_pendiente', v_a_gracia, 'check_acepta_omitida_sin_cuota', v_check_ok);
end $drill$;

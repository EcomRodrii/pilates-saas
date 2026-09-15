-- Drill de 20260915203717_plaza_fija_se_suelta_sin_cuota.sql, en producción y
-- sin dejar rastro: todo va en un único DO que termina en `raise exception
-- 'DRILL_RESULT …'`, así que el error trae las cifras y deshace todo.
-- (Con `begin … rollback` por execute_sql vuelve `[]` y no prueba nada.)
--
-- Antes de aplicar, pega aquí las tres `create or replace` de la migración en los
-- `execute $mig$ … $mig$` marcados (cambiando `$function$` por `$f$`). Después de
-- aplicar, basta con quitarlos: mide la función ya viva.
--
-- Qué comprueba:
--   · el motor con la regla de cuota en su función reserva lo mismo que antes;
--   · con una plaza fija viva y cuota activa, el barrido no suelta nada;
--   · con la cuota cancelada o cambiada por un bono, suelta todo lo del motor;
--   · lo que ya está dentro del plazo de cancelación se mantiene.
-- El escenario usa la primera plaza fija con cuota MENSUAL que encuentre; si no
-- hay ninguna, sus cifras salen null.

do $drill$
declare
  v_antes int; v_despues int; v_sin_cuota_global int;
  v_plaza text; v_socio text; v_studio text; v_sus text; v_bono text;
  v_creadas int; v_con_cuota int; v_renovacion_pendiente int; v_pausada int;
  v_cancelada int; v_con_bono int; v_dentro_plazo int;
begin
  begin
    v_antes := public.materializar_plazas_fijas(42);
    raise exception using errcode = 'TSIMU';
  exception when sqlstate 'TSIMU' then null;
  end;

  -- execute $mig$ <cuota_cubre_plaza_fija> $mig$;
  -- execute $mig$ <reservas_plaza_fija_sin_cuota> $mig$;
  -- execute $mig$ <materializar_plazas_fijas> $mig$;

  begin
    v_despues := public.materializar_plazas_fijas(42);
    raise exception using errcode = 'TSIMU';
  exception when sqlstate 'TSIMU' then null;
  end;

  select count(*) into v_sin_cuota_global from public.reservas_plaza_fija_sin_cuota();

  select pf.id, pf.socio_id, pf.studio_id, su.id
    into v_plaza, v_socio, v_studio, v_sus
  from plazas_fijas pf
  join suscripciones su on su.socio_id = pf.socio_id and su.studio_id = pf.studio_id
  join planes_tarifa pt on pt.id = su.plan_id and pt.tipo = 'MENSUAL'
  order by pf.creada_en
  limit 1;

  if v_plaza is not null then
    update plazas_fijas set estado = 'ACTIVA', pausa_desde = null, pausa_hasta = null where id = v_plaza;
    update suscripciones set estado = 'ACTIVA', baja_al_vencer = false, fecha_fin = null where id = v_sus;
    v_creadas := public.materializar_plazas_fijas(42, v_plaza);
    select count(*) into v_con_cuota from public.reservas_plaza_fija_sin_cuota(v_studio, v_socio);

    -- Periodo acabado con la renovación sin cobrar: sigue ACTIVA → conserva lo reservado.
    update suscripciones set fecha_fin = current_date - 2 where id = v_sus;
    select count(*) into v_renovacion_pendiente from public.reservas_plaza_fija_sin_cuota(v_studio, v_socio);
    update suscripciones set fecha_fin = null, estado = 'PAUSADA' where id = v_sus;
    select count(*) into v_pausada from public.reservas_plaza_fija_sin_cuota(v_studio, v_socio);

    update suscripciones set estado = 'CANCELADA' where id = v_sus;
    select count(*) into v_cancelada from public.reservas_plaza_fija_sin_cuota(v_studio, v_socio);

    select id into v_bono from planes_tarifa where studio_id = v_studio and tipo = 'BONO' limit 1;
    if v_bono is not null then
      update suscripciones set estado = 'ACTIVA', plan_id = v_bono where id = v_sus;
      select count(*) into v_con_bono from public.reservas_plaza_fija_sin_cuota(v_studio, v_socio);
    end if;

    update sesiones set inicio = now() + interval '2 hours', fin = now() + interval '3 hours'
     where id = (select r.sesion_id from reservas r join sesiones s on s.id = r.sesion_id
                 where r.socio_id = v_socio and r.id like 'res-pf-%' and r.estado = 'CONFIRMADA'
                 order by s.inicio limit 1);
    select count(*) into v_dentro_plazo from public.reservas_plaza_fija_sin_cuota(v_studio, v_socio);
  end if;

  raise exception 'DRILL_RESULT %', json_build_object(
    'motor_antes', v_antes, 'motor_despues', v_despues, 'sin_cuota_hoy_global', v_sin_cuota_global,
    'escenario_creadas', v_creadas, 'con_cuota', v_con_cuota, 'renovacion_pendiente', v_renovacion_pendiente,
    'pausada', v_pausada, 'cancelada', v_cancelada,
    'con_bono', v_con_bono, 'una_dentro_del_plazo', v_dentro_plazo);
end $drill$;

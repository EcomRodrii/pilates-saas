-- Drill de 20260915231920_solicitudes_plaza_fija.sql, en producción y sin dejar
-- rastro: un único DO que termina en `raise exception 'DRILL_RESULT …'`, así que
-- el error trae las cifras y deshace todo.
--
-- ⚠️ `studios` es una tabla caliente: el `lock_timeout` hace que un ALTER que no
-- consigue su lock falle en 3 s en vez de dejar en cola las lecturas del panel.
--
-- Antes de aplicar, pega las sentencias de la migración en los `execute $mig$ … $mig$`
-- marcados (`$function$` → `$f$`). Después de aplicarla, quítalos.
--
-- Usa la primera plaza fija que tenga clases en su franja las próximas semanas y
-- otra socia de su estudio (si no hay, todo null). Comprueba:
--   · en pausa liberada, sin nadie más en su franja → 'OK';
--   · aforo 1 y otra plaza fija ACTIVA en su franja → 'SIN_CUPO';
--   · las dos con el mismo sitio concreto → 'SITIO_OCUPADO' (si la sala tiene sitios);
--   · una sola solicitud pendiente por plaza y tipo;
--   · una pendiente con fecha de resolución no entra (CHECK);
--   · ni anon ni authenticated leen la tabla ni ejecutan la función.

do $drill$
declare
  v_plaza record; v_otra_socia text; v_spot text;
  v_ok text; v_sin_cupo text; v_sitio text;
  v_unica boolean := false; v_coherente boolean := false;
begin
  perform set_config('lock_timeout', '3000', true);
  perform set_config('statement_timeout', '20000', true);

  -- execute $mig$ <sentencias de la migración> $mig$;

  select pf.* into v_plaza
  from plazas_fijas pf
  where exists (
    select 1 from sesiones s
    where s.studio_id = pf.studio_id and s.sala_id = pf.sala_id and coalesce(s.cancelada, false) = false
      and s.inicio >= now() + interval '1 day' and s.inicio < now() + interval '40 days'
      and extract(dow from s.inicio at time zone 'Europe/Madrid') = pf.dia_semana
      and (s.inicio at time zone 'Europe/Madrid')::time = pf.hora_inicio
  )
  order by pf.creada_en
  limit 1;

  if v_plaza.id is not null then
    select id into v_otra_socia from socios where studio_id = v_plaza.studio_id and id <> v_plaza.socio_id limit 1;

    delete from plazas_fijas o
     where o.id <> v_plaza.id and o.studio_id = v_plaza.studio_id and o.sala_id = v_plaza.sala_id
       and o.dia_semana = v_plaza.dia_semana and o.hora_inicio = v_plaza.hora_inicio;
    update plazas_fijas set estado = 'PAUSADA', pausa_desde = current_date - 7, pausa_hasta = current_date,
      vigencia_hasta = null, spot_id = null
     where id = v_plaza.id;
    v_ok := public.plaza_fija_hueco_para_volver(v_plaza.id);

    update sesiones set aforo_maximo = 1
     where studio_id = v_plaza.studio_id and sala_id = v_plaza.sala_id and coalesce(cancelada, false) = false
       and extract(dow from inicio at time zone 'Europe/Madrid') = v_plaza.dia_semana
       and (inicio at time zone 'Europe/Madrid')::time = v_plaza.hora_inicio;
    insert into plazas_fijas (id, studio_id, socio_id, sala_id, dia_semana, hora_inicio, estado, vigencia_desde)
    values ('zzdrill-pf-otra', v_plaza.studio_id, v_otra_socia, v_plaza.sala_id, v_plaza.dia_semana, v_plaza.hora_inicio, 'ACTIVA', current_date);
    v_sin_cupo := public.plaza_fija_hueco_para_volver(v_plaza.id);

    select id into v_spot from spots where sala_id = v_plaza.sala_id limit 1;
    if v_spot is not null then
      update plazas_fijas set spot_id = v_spot where id in (v_plaza.id, 'zzdrill-pf-otra');
      v_sitio := public.plaza_fija_hueco_para_volver(v_plaza.id);
    end if;

    insert into solicitudes_plaza_fija (studio_id, socio_id, tipo, plaza_id, desde_propuesta, hasta_propuesta)
    values (v_plaza.studio_id, v_plaza.socio_id, 'PAUSAR', v_plaza.id, current_date + 7, current_date + 14);
    begin
      insert into solicitudes_plaza_fija (studio_id, socio_id, tipo, plaza_id, desde_propuesta, hasta_propuesta)
      values (v_plaza.studio_id, v_plaza.socio_id, 'PAUSAR', v_plaza.id, current_date + 20, current_date + 25);
    exception when unique_violation then v_unica := true;
    end;
    begin
      insert into solicitudes_plaza_fija (studio_id, socio_id, tipo, plaza_id, resuelta_en)
      values (v_plaza.studio_id, v_plaza.socio_id, 'REANUDAR', v_plaza.id, now());
    exception when check_violation then v_coherente := true;
    end;
  end if;

  raise exception 'DRILL_RESULT %', json_build_object(
    'hay_escenario', v_plaza.id is not null,
    'hueco_ok', v_ok, 'hueco_sin_cupo', v_sin_cupo, 'hueco_sitio_ocupado', coalesce(v_sitio, 'sin sitios en la sala'),
    'una_pendiente_por_plaza', v_unica, 'check_resuelta_coherente', v_coherente,
    'tabla_select', json_build_object(
      'anon', has_table_privilege('anon', 'public.solicitudes_plaza_fija', 'SELECT'),
      'authenticated', has_table_privilege('authenticated', 'public.solicitudes_plaza_fija', 'SELECT'),
      'service_role', has_table_privilege('service_role', 'public.solicitudes_plaza_fija', 'SELECT')),
    'fn_execute', json_build_object(
      'anon', has_function_privilege('anon', 'public.plaza_fija_hueco_para_volver(text)', 'EXECUTE'),
      'authenticated', has_function_privilege('authenticated', 'public.plaza_fija_hueco_para_volver(text)', 'EXECUTE'),
      'service_role', has_function_privilege('service_role', 'public.plaza_fija_hueco_para_volver(text)', 'EXECUTE')));
end $drill$;

-- La vigencia de bonos, cuotas, recuperaciones y plazas fijas se mide con el «hoy» de Madrid, no con el de UTC.
--
-- Continúa 20261008165518 (`hoy_estudio()`, `crear_recuperacion`, `descongelar_suscripcion`). La base de datos corre en UTC y
-- `current_date` es el día UTC: entre las 00:00 y las 02:00 de Madrid (01:00 en invierno) sigue siendo el de ayer. Un bono que
-- caducó «ayer» seguía sirviendo para reservar hasta las 02:00, mientras el panel (hora de Madrid) y el cron de las 08:00 lo
-- daban por caducado. El error era indulgente con la alumna, pero decidía distinto según quién preguntara.
--
-- CÓMO: no se reescriben a mano 18 funciones (varias son largas y algunas las ha tocado otra migración después de la que las
-- creó): se parte de la definición VIVA de cada una (`pg_get_functiondef`), se cambia `current_date` por `public.hoy_estudio()`
-- y se vuelve a crear con la misma firma. `CREATE OR REPLACE` conserva dueño, permisos y comentarios, y la migración COMPRUEBA
-- que los permisos no han cambiado y que ninguna función de la lista conserva `current_date`.
--
-- El valor por defecto de `p_hoy` en `elegir_bono_consumible` y `socio_tiene_entitlement_activo` (`DEFAULT CURRENT_DATE`) se
-- cambia igual: es la ruta por la que `reservar_plaza` y sus ayudantes preguntan «¿tiene derecho hoy?».
--
-- Caso aparte, `otorgar_credito_disparador`: además de comparar fechas, convierte días a instantes (`v_lunes::timestamptz`,
-- `date_trunc('month', current_date)::timestamptz`), y esa conversión también cae en UTC. Se hace a mano: la semana y el mes
-- empiezan a las 00:00 de Madrid.
--
-- Fuera, a propósito: `aprobar_recomendacion_autonoma` (el tope diario del piloto automático es un límite de IA, no de dinero ni
-- de derechos) e `instructor_horas_mes` (sin llamadores).

set lock_timeout = '5s';

do $mig$
declare
  v_firmas text[] := array[
    'public.aceptar_oferta_lista_espera(text,text,text)',
    'public.ampliar_caducidades(text,text[],integer)',
    'public.caduca_creditos(text)',
    'public.calcular_excede_limite_semanal(text,text,text,timestamp with time zone)',
    'public.congelar_suscripcion(text,text,text,text)',
    'public.consumir_bono_interno(text,text,text)',
    'public.cuota_cubre_plaza_fija(text,text,text,date,boolean)',
    'public.elegir_bono_consumible(text,text,text,date)',
    'public.evaluar_reserva(text,text,text,jsonb)',
    'public.intentar_consumir_recuperacion_semanal(text,text,text)',
    'public.member_credits_caducidad()',
    'public.plaza_fija_hueco_para_volver(text)',
    'public.plazas_fijas_sin_materializar(integer)',
    'public.promocionar_siguiente_espera(text,text,integer)',
    'public.registrar_venta_pos(text,text,text,jsonb,text,numeric,text,text,text,uuid,text,numeric,text,text,text)',
    'public.resolver_reserva_pendiente(text,text,boolean)',
    'public.saldo_vivo(integer,date)',
    'public.socio_tiene_entitlement_activo(text,text,text,date)'
  ];
  v_creditos constant text := 'public.otorgar_credito_disparador(text,text,text,text,text)';
  v_todas text[] := v_firmas || v_creditos;
  f text;
  v_def text;
  v_nuevo text;
  v_antes jsonb := '{}'::jsonb;
  v_despues jsonb := '{}'::jsonb;
  v_cambiadas int := 0;
begin
  -- Foto de los permisos ANTES: el reemplazo no puede tocarlos.
  foreach f in array v_todas loop
    v_antes := v_antes || jsonb_build_object(f, jsonb_build_array(
      has_function_privilege('anon', f::regprocedure, 'EXECUTE'),
      has_function_privilege('authenticated', f::regprocedure, 'EXECUTE'),
      has_function_privilege('service_role', f::regprocedure, 'EXECUTE')));
  end loop;

  -- 1) El reemplazo directo: `current_date` → `public.hoy_estudio()`.
  foreach f in array v_firmas loop
    v_def := pg_get_functiondef(f::regprocedure);
    v_nuevo := regexp_replace(v_def, 'current_date', 'public.hoy_estudio()', 'gi');
    if v_nuevo <> v_def then
      execute v_nuevo;
      v_cambiadas := v_cambiadas + 1;
    end if;
  end loop;

  -- 2) Los créditos de fidelidad: fechas y también las fronteras de semana y de mes, en hora de Madrid.
  v_def := pg_get_functiondef(v_creditos::regprocedure);
  v_nuevo := v_def;
  v_nuevo := replace(v_nuevo, 'v_lunes > current_date', 'v_lunes > public.hoy_estudio()');
  v_nuevo := replace(v_nuevo, 'to_char(current_date, ''YYYY-MM'')', 'to_char(public.hoy_estudio(), ''YYYY-MM'')');
  v_nuevo := replace(v_nuevo, '(v_lunes + 8)::timestamptz', '(v_lunes + 8)::timestamp at time zone ''Europe/Madrid''');
  v_nuevo := replace(v_nuevo, 'v_lunes::timestamptz', 'v_lunes::timestamp at time zone ''Europe/Madrid''');
  v_nuevo := replace(v_nuevo,
    '(date_trunc(''month'', current_date) + interval ''1 month'')::timestamptz',
    '((date_trunc(''month'', public.hoy_estudio()::timestamp) + interval ''1 month'') at time zone ''Europe/Madrid'')');
  v_nuevo := replace(v_nuevo,
    'date_trunc(''month'', current_date)::timestamptz',
    '(date_trunc(''month'', public.hoy_estudio()::timestamp) at time zone ''Europe/Madrid'')');
  if v_nuevo ~* 'current_date' or v_nuevo !~ 'Europe/Madrid' or v_nuevo = v_def then
    raise exception 'otorgar_credito_disparador: no se pudo cambiar al hoy de Madrid (la definición ya no es la esperada)';
  end if;
  execute v_nuevo;
  v_cambiadas := v_cambiadas + 1;

  -- Comprobaciones: ninguna conserva `current_date` y los permisos son los de antes.
  foreach f in array v_todas loop
    if pg_get_functiondef(f::regprocedure) ~* 'current_date' then
      raise exception '% todavía usa current_date', f;
    end if;
    v_despues := v_despues || jsonb_build_object(f, jsonb_build_array(
      has_function_privilege('anon', f::regprocedure, 'EXECUTE'),
      has_function_privilege('authenticated', f::regprocedure, 'EXECUTE'),
      has_function_privilege('service_role', f::regprocedure, 'EXECUTE')));
  end loop;
  if v_antes <> v_despues then
    raise exception 'los permisos de alguna función han cambiado: antes % · después %', v_antes, v_despues;
  end if;

  raise notice 'vigencia con el hoy de Madrid: % funciones actualizadas', v_cambiadas;
end
$mig$;

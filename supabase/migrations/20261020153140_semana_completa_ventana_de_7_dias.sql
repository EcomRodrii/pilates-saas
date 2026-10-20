-- «Semana completa»: la ventana del RPC pasa de 8 a 7 días, solo lunes y sin clases canceladas.
-- (Fase 3, PR 3.3-B, decisión D12 del fundador.)
--
-- APLICADA en producción el 20-oct-2026 (sello 20261020153140), tras ensayo en transacción con ROLLBACK.
--
-- Hoy `otorgar_credito_disparador` acepta para SEMANA_COMPLETA una clave de lunes o de domingo y una
-- asistencia en [lunes, lunes+8): una asistencia del lunes SIGUIENTE bastaba para cobrar la semana
-- anterior, y una clase cancelada por el estudio contaba. Es un resto de un arreglo antiguo del huso.
-- El servidor y el panel mandan siempre el lunes (`claveSemanaEstudio`) y exigen la asistencia en su
-- semana, así que esto solo estrecha lo que un cliente forjado podría pedir.
--
-- Comprobado en solo lectura antes de escribir esto: los 19 pagos SEMANA_COMPLETA existentes tienen
-- clave de lunes (19/19) y una asistencia ASISTIDA en clase no cancelada dentro de [lunes, lunes+7)
-- en hora de Madrid (19/19). Ninguno se habría negado.
--
-- Mismo método que `20261008165935_vigencia_con_el_hoy_de_madrid`: se reescribe la definición VIVA
-- (no una copia a mano que pudiera perder cambios posteriores), con comprobaciones de que el texto
-- esperado estaba y de que los permisos de las tres roles no cambian. Misma firma: no hay función
-- nueva, así que no hay grant por defecto a PUBLIC (aun así se verifica con has_function_privilege).
-- Tocar solo la rama SEMANA_COMPLETA: OBJETIVO_MENSUAL y el resto quedan exactamente como están.

do $mig$
declare
  v_firma constant text := 'public.otorgar_credito_disparador(text,text,text,text,text)';
  v_def text;
  v_nuevo text;
  v_antes jsonb;
  v_despues jsonb;
begin
  v_antes := jsonb_build_array(
    has_function_privilege('anon', v_firma::regprocedure, 'EXECUTE'),
    has_function_privilege('authenticated', v_firma::regprocedure, 'EXECUTE'),
    has_function_privilege('service_role', v_firma::regprocedure, 'EXECUTE'));

  v_def := pg_get_functiondef(v_firma::regprocedure);
  if v_def !~ 'not in \(1, 7\)' or v_def !~ '\(v_lunes \+ 8\)::timestamp at time zone ''Europe/Madrid''' then
    raise exception 'otorgar_credito_disparador: la rama SEMANA_COMPLETA ya no es la esperada; no se toca nada';
  end if;

  v_nuevo := v_def;
  -- Solo lunes.
  v_nuevo := replace(v_nuevo, 'extract(isodow from v_lunes) not in (1, 7)', 'extract(isodow from v_lunes) <> 1');
  -- Siete días, no ocho (las dos consultas de la rama: la de la socia y la de la instructora).
  v_nuevo := replace(v_nuevo, '(v_lunes + 8)::timestamp at time zone ''Europe/Madrid''', '(v_lunes + 7)::timestamp at time zone ''Europe/Madrid''');
  -- Una clase cancelada por el estudio no es asistencia.
  v_nuevo := replace(v_nuevo,
    'and s.inicio >= v_lunes::timestamp at time zone ''Europe/Madrid''',
    'and not coalesce(s.cancelada, false)
        and s.inicio >= v_lunes::timestamp at time zone ''Europe/Madrid''');

  if v_nuevo = v_def
     or v_nuevo ~ 'not in \(1, 7\)'
     or v_nuevo ~ '\(v_lunes \+ 8\)'
     or (length(v_nuevo) - length(replace(v_nuevo, 'not coalesce(s.cancelada, false)', ''))) / length('not coalesce(s.cancelada, false)') <> 2 then
    raise exception 'otorgar_credito_disparador: el reemplazo de SEMANA_COMPLETA no quedó como se esperaba';
  end if;
  execute v_nuevo;

  v_despues := jsonb_build_array(
    has_function_privilege('anon', v_firma::regprocedure, 'EXECUTE'),
    has_function_privilege('authenticated', v_firma::regprocedure, 'EXECUTE'),
    has_function_privilege('service_role', v_firma::regprocedure, 'EXECUTE'));
  if v_antes <> v_despues then
    raise exception 'los permisos de otorgar_credito_disparador han cambiado: antes % · después %', v_antes, v_despues;
  end if;
end
$mig$;

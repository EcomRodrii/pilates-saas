-- Motor de derechos, FASE 3c: `reservar_plaza` DECIDE con `evaluar_reserva`.
--
-- Hasta ahora la elegibilidad de una reserva vivía en DOS sitios: las comprobaciones inline de `reservar_plaza` y su espejo
-- de solo lectura `evaluar_reserva` (en sombra, atado a `reservar_plaza` por un test de paridad con 27 escenarios reales).
-- Con la paridad demostrada, `reservar_plaza` deja de repetirlas: toma sus candados (advisory por socia y fila de la sesión),
-- pregunta a `evaluar_reserva` y, si dice que no, lanza LA MISMA EXCEPCIÓN de siempre (`detalle`: SIN_ENTITLEMENT,
-- LIMITE_SEMANAL, SPOT_OCUPADO…), de modo que el servidor ve exactamente lo mismo. Una sola fuente de verdad: la regla se
-- cambia en un sitio.
--
-- Lo que sigue en `reservar_plaza`, porque es de ESCRITURA y no de decisión: los candados, el consumo de la recuperación
-- que paga el exceso del tope semanal, la inserción de la reserva y el cobro del bono (`consumir_bono_interno`, con su
-- bloque defensivo).
--
-- Mismos permisos (CREATE OR REPLACE con la misma firma conserva el ACL; se comprueba al final).
--
-- Notas de concurrencia: `evaluar_reserva` se llama DESPUÉS de los candados, en su propia sentencia, así que ve lo que la
-- reserva anterior de la misma clase ya confirmó (READ COMMITTED toma instantánea por sentencia). El candado del sitio
-- (`for update` sobre `spots`) se conserva, aunque el candado de la sesión ya serializa toda reserva de esa clase.

create or replace function public.reservar_plaza(
  p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text,
  p_permite_lista_espera boolean default true, p_requiere_aprobacion boolean default false,
  p_spot_id text default null::text, p_saltar_gate_impago boolean default false,
  p_exigir_entitlement boolean default true, p_suscripcion_id text default null::text
)
returns table(estado text, posicion_espera integer, bono_resultado text, bono_saldo_restante integer, bono_suscripcion_id text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_tipo_clase_id text;
  v_ev jsonb;
  v_estado text;
  v_pos int;
  v_bono_resultado text := null;
  v_bono_saldo int := null;
  v_bono_sus_id text := null;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':' || p_socio_id));

  select tipo_clase_id into v_tipo_clase_id
    from sesiones where id = p_sesion_id and studio_id = p_studio_id
    for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  -- La DECISIÓN, en un solo sitio. Sin ningún `select` de por medio entre los candados y esta llamada que pueda dejar la
  -- instantánea vieja: la función se evalúa en su propia sentencia, ya con la sesión bloqueada.
  -- `select … into` y no `v_ev := …`: es una sentencia SQL de verdad, así que toma una instantánea NUEVA justo aquí (READ
  -- COMMITTED), con los candados ya concedidos, y `evaluar_reserva` (STABLE) lee con esa instantánea: ve lo que la reserva
  -- anterior de esta clase confirmó mientras esperábamos el candado.
  select public.evaluar_reserva(
    p_studio_id, p_sesion_id, p_socio_id,
    jsonb_build_object(
      'permite_lista_espera', p_permite_lista_espera,
      'requiere_aprobacion', p_requiere_aprobacion,
      'spot_id', p_spot_id,
      'saltar_gate_impago', p_saltar_gate_impago,
      'exigir_entitlement', p_exigir_entitlement
    )
  ) into v_ev;
  if (v_ev ->> 'puede')::boolean is not true then
    -- La misma excepción que lanzaba cada comprobación inline: el servidor la traduce a su código por el mensaje.
    raise exception '%', coalesce(v_ev ->> 'detalle', 'NO_AUTORIZADO');
  end if;
  v_estado := v_ev ->> 'estado';
  v_pos := (v_ev ->> 'posicion_espera')::int;

  if p_spot_id is not null then
    -- El sitio ya está validado por `evaluar_reserva`; aquí solo se bloquea su fila hasta el commit.
    perform 1 from spots sp where sp.id = p_spot_id and sp.studio_id = p_studio_id for update;
  end if;

  -- Tope semanal: si `evaluar_reserva` ha dicho que el pago es una RECUPERACIÓN, se consume ahora (la que caduca antes).
  -- Si entre medias otra reserva se llevó la última (no puede pasar con los candados de arriba, pero no se da por hecho),
  -- se rechaza con la excepción del tope que corresponda, igual que antes.
  if v_estado = 'CONFIRMADA' and (v_ev -> 'pagador' ->> 'origen') = 'recuperacion' then
    if not public.intentar_consumir_recuperacion_semanal(p_studio_id, p_socio_id, p_reserva_id) then
      if (v_ev -> 'tope' ->> 'excede_tipo')::boolean then
        raise exception 'LIMITE_SEMANAL_ACTIVIDAD';
      else
        raise exception 'LIMITE_SEMANAL';
      end if;
    end if;
  end if;

  -- D-3: escrito de forma EXPLÍCITA, no por confianza en el default de la columna (que hoy es `true`, pero nada obliga a
  -- que lo siga siendo). `reservar_plaza` es el único camino de creación "normal" (pública, tras-pago, mostrador): nunca
  -- legada, siempre rastreada.
  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en, bono_consumo_rastreado)
    values (
      p_reserva_id, p_studio_id, p_sesion_id, p_socio_id, v_estado,
      case when v_estado = 'CONFIRMADA' then p_spot_id else null end,
      v_pos, null, now(), true
    );

  -- D-1: el descuento del bono se decide AQUI, dentro del mismo candado (pg_advisory_xact_lock por socio) y la misma
  -- transacción que confirma la plaza -- no en una llamada TS posterior tras liberar el candado. Solo para CONFIRMADA
  -- directa: LISTA_ESPERA y PENDIENTE_APROBACION no ocupan plaza todavía y su bono se decide más tarde
  -- (resolver_reserva_pendiente, aceptar_oferta_lista_espera -- fuera del alcance de D-1, ver D-2).
  --
  -- Envuelto en su propio BEGIN/EXCEPTION (crea un SAVEPOINT implícito): los rechazos DEFENSIVOS de consumir_bono_interno
  -- (SESION_REQUERIDA, SUSCRIPCION_NO_ES_DE_LA_SOCIA, BONO_NO_CUBRE_CLASE -- "no deberían pasar nunca" según bonoConsumible
  -- en TS) NO deben tirar abajo una reserva que YA es válida por lo demás.
  --
  -- El bono, elegido bajo el candado: si TS eligió uno (`p_suscripcion_id`), la base de datos lo vuelve a elegir aquí con
  -- la misma regla, porque pudo cambiar entre la elección y el candado. Si TS no eligió ninguno, nada.
  if v_estado = 'CONFIRMADA' then
    begin
      select c.resultado, c.saldo_restante, c.suscripcion_consumida_id
        into v_bono_resultado, v_bono_saldo, v_bono_sus_id
        from public.consumir_bono_interno(
          p_reserva_id,
          case when p_suscripcion_id is null then null
               else public.elegir_bono_consumible(p_studio_id, p_socio_id, v_tipo_clase_id) end,
          p_studio_id) c;
    exception when raise_exception then
      v_bono_resultado := null;
      v_bono_saldo := null;
      v_bono_sus_id := null;
    end;
  end if;

  return query select v_estado, v_pos, v_bono_resultado, v_bono_saldo, v_bono_sus_id;
end;
$function$;

-- Permisos EXPLÍCITOS, aunque `create or replace` con la misma firma conserva el ACL: en producción estas dos sentencias no
-- cambian nada (ya era así), pero una base creada desde cero puede nacer con otros permisos y la guardia de migraciones
-- exige que toda función SECURITY DEFINER decida por escrito sobre anon.
revoke all on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text) to service_role;

-- Verificación: los mismos permisos que tenía (solo el servidor).
do $$
begin
  if has_function_privilege('anon', 'public.reservar_plaza(text,text,text,text,boolean,boolean,text,boolean,boolean,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reservar_plaza(text,text,text,text,boolean,boolean,text,boolean,boolean,text)'::regprocedure, 'EXECUTE')
     or not has_function_privilege('service_role', 'public.reservar_plaza(text,text,text,text,boolean,boolean,text,boolean,boolean,text)'::regprocedure, 'EXECUTE') then
    raise exception 'reservar_plaza ha cambiado de permisos';
  end if;
  if position('public.evaluar_reserva(' in (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'reservar_plaza')) = 0 then
    raise exception 'reservar_plaza no decide con evaluar_reserva';
  end if;
end $$;

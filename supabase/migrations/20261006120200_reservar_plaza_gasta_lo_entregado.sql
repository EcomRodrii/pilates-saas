-- ─────────────────────────────────────────────────────────────────────────────
-- `reservar_plaza` gasta la suscripción que entregó el pago (P06 · Fase A, 6-oct-2026).
--
-- Hasta hoy `p_suscripcion_id` solo decidía SI se cobraba un bono, y CUÁL lo volvía a
-- elegir `elegir_bono_consumible` (el acotado al tipo, luego el que caduca antes). Para
-- una clase pagada desde la app eso podía gastar OTRO bono de la socia y dejar intacto
-- el que acababa de pagar. Nuevo parámetro `p_consumir_suscripcion_id`: con valor, se
-- consume EXACTAMENTE esa (`consumir_bono_interno` ya valida dueña y cobertura); sin él,
-- igual que siempre. Nada más cambia: el cuerpo es el de 20261002145629.
--
-- Firma NUEVA (11 argumentos): se borra la de 10 para no dejar dos sobrecargas (el
-- gotcha 42725 «is not unique» ya tumbó las reservas una vez). Los llamantes usan
-- argumentos con nombre y el nuevo tiene DEFAULT: el código de antes sigue funcionando
-- contra la de 11 sin tocar nada (aplicable ANTES del código).
--
-- Permisos: una firma nueva nace con EXECUTE a PUBLIC y, por pg_default_acl, directo a
-- anon/authenticated: los tres pasos explícitos y la verificación con has_function_privilege.
--
-- Repetible: si ya existe la de 11 (se aplicó antes), se salta la guarda y se recrea igual.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if to_regprocedure('public.reservar_plaza(text,text,text,text,boolean,boolean,text,boolean,boolean,text,text)') is null then
    -- La vigente tiene que ser la que decide con evaluar_reserva (20261002145629): si alguien la cambió, se para.
    if position('public.evaluar_reserva(' in coalesce((select p.prosrc from pg_proc p
         where p.oid = to_regprocedure('public.reservar_plaza(text,text,text,text,boolean,boolean,text,boolean,boolean,text)')), '')) = 0 then
      raise exception 'reservar_plaza(10) no es la que decide con evaluar_reserva: rehaz esta migración sobre la vigente';
    end if;
  end if;
end $$;

drop function if exists public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text);
drop function if exists public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text, text);

create function public.reservar_plaza(
  p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text,
  p_permite_lista_espera boolean default true, p_requiere_aprobacion boolean default false,
  p_spot_id text default null::text, p_saltar_gate_impago boolean default false,
  p_exigir_entitlement boolean default true, p_suscripcion_id text default null::text,
  p_consumir_suscripcion_id text default null::text
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
  -- P06 (6-oct-2026): la reserva PAGADA gasta exactamente lo que entregó ese pago (`p_consumir_suscripcion_id`, la
  -- `sus-web-…` del cobro), no el bono que eligiría la regla general (el acotado o el que caduca antes): si no, el pago
  -- quedaba intacto y se gastaba otro bono suyo. `consumir_bono_interno` ya comprueba que sea de la socia y cubra la clase
  -- (si no, su rechazo defensivo no tumba la reserva, como siempre).
  if v_estado = 'CONFIRMADA' then
    begin
      select c.resultado, c.saldo_restante, c.suscripcion_consumida_id
        into v_bono_resultado, v_bono_saldo, v_bono_sus_id
        from public.consumir_bono_interno(
          p_reserva_id,
          case when p_consumir_suscripcion_id is not null then p_consumir_suscripcion_id
               when p_suscripcion_id is null then null
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

comment on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text, text) is
  'Reserva una plaza (decide con evaluar_reserva). p_consumir_suscripcion_id: la suscripción que entregó el pago de la clase, la que se gasta (P06). Solo service_role.';

revoke all on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text, text) from public;
revoke all on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text, text) from anon;
revoke all on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text, text) from authenticated;
grant execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text, text) to service_role, postgres;

do $$
declare
  v_fn constant text := 'public.reservar_plaza(text,text,text,text,boolean,boolean,text,boolean,boolean,text,text)';
begin
  if has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'reservar_plaza(11) ejecutable desde el cliente';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'service_role no puede ejecutar reservar_plaza(11): no se podría reservar';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'reservar_plaza') <> 1 then
    raise exception 'queda más de una reservar_plaza: los llamantes con argumentos con nombre darían 42725';
  end if;
  if position('public.evaluar_reserva(' in (select p.prosrc from pg_proc p where p.oid = to_regprocedure(v_fn))) = 0 then
    raise exception 'reservar_plaza no decide con evaluar_reserva';
  end if;
end $$;

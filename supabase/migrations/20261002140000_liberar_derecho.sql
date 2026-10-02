-- Motor de derechos, FASE 2: una sola salida de devolución para la cancelación de una
-- clase, y un único pagador por reserva.
--
-- Cierra los defectos de saldo que dejó la auditoría, todos con la misma causa: cada
-- evento decidía por su cuenta qué devolver, sin saber qué había consumido esa reserva.
--
--   · «Eliminar clase» (defecto 1): se devolvía con un +1 ciego DESPUÉS de borrar la clase
--     (el borrado se lleva las reservas por cascada y ya no queda a qué atar la devolución).
--     Lo arregla el código: cancela y libera las reservas ANTES de borrar.
--   · Plazas fijas (defecto 2): las reservas `res-pf-` no consumen bono (las cubre la
--     cuota) pero, al cancelar la clase por sustitución o por mínimo de asistentes, caían a
--     una heurística que sumaba una sesión a cualquier bono con hueco. `liberar_derecho`
--     solo devuelve lo que esa reserva consumió.
--   · Recuperación + bono (defecto 3): una reserva pagada con una recuperación podía
--     consumir además un bono. `consumir_bono_interno` ya no lo hace.
--   · Recuperación al cancelar el estudio (defecto 4): solo la restituía la cancelación de
--     la alumna. `liberar_derecho` la restituye siempre que la reserva la hubiera usado.
--
-- `liberar_derecho(estudio, reserva, motivo)` NO cancela la reserva ni toca su estado: la
-- reserva tiene que estar ya CANCELADA y su clase cancelada. Solo mueve derechos, una vez
-- (idempotente), y dice qué ha hecho. La devolución del bono reutiliza
-- `devolver_sesion_bono_por_reserva`, que ya sella la devolución por reserva y escribe el
-- ledger (migr 20261002130000).
--
-- Una reserva NO rastreada y que no es de plaza fija (la importada de otra plataforma, cuyo
-- saldo ya venía descontado) devuelve LEGADO_SIN_RASTRO: aquí no se adivina a qué bono
-- sumar; el llamador sigue con la heurística de siempre, que queda a la vista y es lo
-- último que falta por retirar cuando las importadas estén clasificadas.
--
-- La política del estudio (`cancelacion_clase_devuelve_bono`) se lee aquí, en SQL: es la
-- misma para cualquier cancelación de clase. La recuperación se restituye aunque la política
-- no devuelva el bono: no es un reembolso, es el derecho a recuperar una clase que ha
-- cancelado el estudio.
--
-- Solo la llama el servidor (service_role). Aditiva: no cambia ningún saldo ni flujo existente
-- salvo el pagador único.

-- ── consumir_bono_interno: una reserva pagada con recuperación no consume bono ──
create or replace function public.consumir_bono_interno(p_reserva_id text, p_suscripcion_id text, p_studio_id text)
returns table(resultado text, saldo_restante integer, suscripcion_consumida_id text)
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado text;
  v_sesion_id text;
  v_socio_id text;
  v_decidido_en timestamptz;
  v_sus_previa text;
  v_sus_socio_id text;
  v_plan_id text;
  v_tipo_clase_id text;
  v_acotado boolean;
  v_saldo integer;
  v_cuota text;
begin
  select r.estado, r.sesion_id, r.socio_id, r.bono_decidido_en, r.bono_suscripcion_id
    into v_estado, v_sesion_id, v_socio_id, v_decidido_en, v_sus_previa
    from public.reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id
   for update;

  if not found then
    return query select 'RESERVA_NO_ENCONTRADA'::text, null::integer, null::text;
    return;
  end if;

  if v_decidido_en is not null then
    if v_sus_previa is null then
      return query select 'YA_DECIDIDA'::text, null::integer, null::text;
      return;
    end if;
    return query
      select 'YA_CONSUMIDA'::text,
             (select s.sesiones_restantes
                from public.suscripciones as s
               where s.id = v_sus_previa and s.studio_id = p_studio_id),
             v_sus_previa;
    return;
  end if;

  if v_estado not in ('CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO') then
    return query select 'NO_OCUPA_PLAZA'::text, null::integer, null::text;
    return;
  end if;

  -- Una reserva pagada con una recuperación no consume ningún bono: un único pagador
  -- por reserva. El movimiento del pago ya lo dejó el ledger (USO_RECUPERACION).
  if exists (
    select 1 from public.recuperaciones as rc
     where rc.usada_en_reserva_id = p_reserva_id
       and rc.studio_id = p_studio_id
       and rc.estado = 'USADA'
  ) then
    update public.reservas as r
       set bono_decidido_en = now(), bono_suscripcion_id = null
     where r.id = p_reserva_id;
    return query select 'SIN_BONO'::text, null::integer, null::text;
    return;
  end if;

  if p_suscripcion_id is null then
    update public.reservas as r
       set bono_decidido_en = now(), bono_suscripcion_id = null
     where r.id = p_reserva_id;

    -- Ledger en sombra: ¿la cubre una cuota o no la cubre nada? No cambia el resultado
    -- y no puede fallar la reserva.
    begin
      select ss.tipo_clase_id into v_tipo_clase_id
        from public.sesiones as ss where ss.id = v_sesion_id and ss.studio_id = p_studio_id;
      select s.id into v_cuota
        from public.suscripciones as s
        join public.planes_tarifa as p on p.id = s.plan_id and p.studio_id = s.studio_id
       where s.studio_id = p_studio_id and s.socio_id = v_socio_id and s.estado = 'ACTIVA'
         and p.tipo = 'MENSUAL'
         and (s.fecha_fin is null or s.fecha_fin >= current_date)
         and public.plan_cubre_tipo_clase(p.id, v_tipo_clase_id)
       order by s.id collate "C"
       limit 1;
      insert into public.movimientos_derecho
        (studio_id, socio_id, derecho_tipo, derecho_id, tipo, delta, saldo_despues, reserva_id, actor_tipo)
      values
        (p_studio_id, v_socio_id, case when v_cuota is null then 'NINGUNO' else 'SUSCRIPCION' end, v_cuota,
         case when v_cuota is null then 'SIN_COBERTURA' else 'USO_CUOTA' end, 0, null, p_reserva_id, 'sistema');
    exception when others then
      raise warning 'consumir_bono_interno (ledger): %', sqlerrm;
    end;

    return query select 'SIN_BONO'::text, null::integer, null::text;
    return;
  end if;

  if v_sesion_id is null then
    raise exception 'SESION_REQUERIDA';
  end if;

  select s.plan_id, s.socio_id into v_plan_id, v_sus_socio_id
    from public.suscripciones as s
   where s.id = p_suscripcion_id and s.studio_id = p_studio_id;

  if v_sus_socio_id is null or v_sus_socio_id is distinct from v_socio_id then
    raise exception 'SUSCRIPCION_NO_ES_DE_LA_SOCIA';
  end if;

  select ss.tipo_clase_id into v_tipo_clase_id
    from public.sesiones as ss
   where ss.id = v_sesion_id and ss.studio_id = p_studio_id;

  select exists (
    select 1 from public.plan_tipos_clase as ptc
     where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
  ) into v_acotado;

  if v_acotado and v_tipo_clase_id is not null and not exists (
    select 1 from public.plan_tipos_clase as ptc
     where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
       and ptc.tipo_clase_id = v_tipo_clase_id
  ) then
    raise exception 'BONO_NO_CUBRE_CLASE';
  end if;

  perform set_config('tentare.ledger',
    jsonb_build_object('tipo', 'CONSUMO_BONO', 'reserva_id', p_reserva_id, 'actor_tipo', 'sistema')::text, true);

  update public.suscripciones as s
     set sesiones_restantes = s.sesiones_restantes - 1
   where s.id = p_suscripcion_id
     and s.studio_id = p_studio_id
     and s.sesiones_restantes > 0
  returning s.sesiones_restantes into v_saldo;

  perform set_config('tentare.ledger', '', true);

  -- ⚠️ `v_saldo is null` y NO `not found`: un PERFORM (el de arriba) también fija FOUND, y
  -- «no se actualizó ninguna fila» dejaría de verse. Con el saldo ya decrementado nunca es
  -- nulo (la condición `sesiones_restantes > 0` deja al menos 0).
  if v_saldo is null then
    update public.reservas as r
       set bono_decidido_en = now(), bono_suscripcion_id = null
     where r.id = p_reserva_id;
    return query select 'SIN_SALDO'::text, null::integer, null::text;
    return;
  end if;

  update public.reservas as r
     set bono_suscripcion_id = p_suscripcion_id,
         bono_decidido_en = now()
   where r.id = p_reserva_id;

  return query select 'CONSUMIDA'::text, v_saldo, p_suscripcion_id;
end;
$function$;

-- ── liberar_derecho ─────────────────────────────────────────────────────────
create or replace function public.liberar_derecho(p_studio_id text, p_reserva_id text, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado text;
  v_socio_id text;
  v_sesion_id text;
  v_rastreado boolean;
  v_bono_suscripcion_id text;
  v_devuelto_en timestamptz;
  v_devuelve boolean;
  v_cancelada boolean;
  v_saldo int;
  v_bono text;
  v_rec_id text;
begin
  if not public.es_llamada_servicio() and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;
  if not public.es_llamada_servicio() and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;
  if p_motivo is null or p_motivo not in (
    'estudio_cancela_clase', 'eliminar_clase', 'instructora_baja_sin_sustituta', 'minimo_asistentes'
  ) then
    raise exception 'MOTIVO_LIBERACION_DESCONOCIDO';
  end if;

  select r.estado, r.socio_id, r.sesion_id, r.bono_consumo_rastreado, r.bono_suscripcion_id, r.bono_devuelto_en
    into v_estado, v_socio_id, v_sesion_id, v_rastreado, v_bono_suscripcion_id, v_devuelto_en
    from public.reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id
   for update;

  if v_estado is null then
    return jsonb_build_object('resultado', 'RESERVA_NO_ENCONTRADA');
  end if;
  if v_estado is distinct from 'CANCELADA' then
    return jsonb_build_object('resultado', 'RESERVA_ACTIVA', 'reserva_id', p_reserva_id);
  end if;

  select ss.cancelada into v_cancelada
    from public.sesiones as ss
   where ss.id = v_sesion_id and ss.studio_id = p_studio_id;
  if v_cancelada is distinct from true then
    return jsonb_build_object('resultado', 'SESION_NO_CANCELADA', 'reserva_id', p_reserva_id);
  end if;

  select coalesce(st.cancelacion_clase_devuelve_bono, true) into v_devuelve
    from public.studios as st where st.id = p_studio_id;
  v_devuelve := coalesce(v_devuelve, true);

  if not v_devuelve then
    v_bono := 'POLITICA_NO_DEVUELVE';
  elsif v_devuelto_en is not null then
    v_bono := 'YA_DEVUELTO';
  elsif v_rastreado is true and v_bono_suscripcion_id is not null then
    v_saldo := public.devolver_sesion_bono_por_reserva(p_studio_id, p_reserva_id);
    v_bono := case when v_saldo is not null then 'DEVUELTO' else 'SIN_HUECO' end;
  elsif v_rastreado is true then
    v_bono := 'SIN_CONSUMO';
  elsif p_reserva_id like 'res-pf-%' then
    v_bono := 'SIN_CONSUMO';
  else
    v_bono := 'LEGADO_SIN_RASTRO';
  end if;

  update public.recuperaciones as rc
     set estado = 'DISPONIBLE', usada_en_reserva_id = null
   where rc.usada_en_reserva_id = p_reserva_id
     and rc.studio_id = p_studio_id
     and rc.estado = 'USADA'
  returning rc.id into v_rec_id;

  return jsonb_build_object(
    'resultado', 'OK',
    'reserva_id', p_reserva_id,
    'socio_id', v_socio_id,
    'motivo', p_motivo,
    'bono', v_bono,
    'saldo', v_saldo,
    'recuperacion_restituida', v_rec_id is not null
  );
end;
$function$;

revoke all on function public.liberar_derecho(text, text, text) from public, anon, authenticated;
grant execute on function public.liberar_derecho(text, text, text) to service_role;

comment on function public.liberar_derecho(text, text, text) is
  'Libera los derechos de una reserva CANCELADA de una clase cancelada: devuelve al bono exacto que la pagó (una vez) y restituye la recuperación que usó. No toca el estado de la reserva. Solo service_role. Ver 20261002140000.';


-- ── Verificación: el estado FINAL, no lo que se escribió ─────────────────────
do $$
begin
  if has_function_privilege('anon', 'public.liberar_derecho(text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.liberar_derecho(text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'liberar_derecho es ejecutable por anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.liberar_derecho(text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'liberar_derecho no es ejecutable por service_role';
  end if;
  if has_function_privilege('anon', 'public.consumir_bono_interno(text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.consumir_bono_interno(text,text,text)'::regprocedure, 'EXECUTE')
     or not has_function_privilege('service_role', 'public.consumir_bono_interno(text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'consumir_bono_interno ha cambiado de permisos';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'consumir_bono_interno'
                    and position('tentare.ledger' in p.prosrc) > 0
                    and position('recuperaciones' in p.prosrc) > 0) then
    raise exception 'consumir_bono_interno perdió el ledger o el pagador único';
  end if;
end $$;

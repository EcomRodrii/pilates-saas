-- ─────────────────────────────────────────────────────────────────────────────
-- API pública para todos los estudios (decisión del fundador, 16-oct-2026).
--
-- Hasta ahora la API solo valía en un estudio con fila en `api_acceso_estudios`
-- (la daba Tentare desde /interno, decisión del 1-oct). Ahora vale en todos, y
-- la fila significa solo lo contrario: `desactivada_en` puesto = interruptor
-- apagado a mano para ese estudio. SIN fila = activa, también en las sedes que
-- se creen mañana: no hace falta backfill ni trigger de alta.
--
-- Lo que cambia en base de datos es una sola cosa: el trigger que registra los
-- eventos (`api_registrar_evento`) exigía fila activa; ahora exige que no esté
-- desactivada y que haya alguien leyendo (webhook activo, token vivo del estudio,
-- o clave viva del estudio o de su cadena). Sin ese segundo filtro, abrir la API a todos
-- escribiría un evento por cada cambio de `reservas`/`recibos` de TODOS los
-- estudios, y el trabajador los procesaría para nadie.
--
-- Las filas que ya existen no se tocan: las activas siguen siendo lo mismo y
-- las desactivadas (interruptor apagado por un abuso o a petición) siguen
-- apagadas. Aditiva: mismo nombre y firma, sin columnas nuevas.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.api_registrar_evento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_studio  text;
  v_id      text;
  v_recurso text;
  v_accion  text;
  v_cols    text[];
  v_nueva   jsonb;
  v_vieja   jsonb;
  v_cambia  boolean;
  v_cadena  text;
begin
  if tg_op = 'DELETE' then
    v_studio := old.studio_id;
    v_id := old.id;
  else
    v_studio := new.studio_id;
    v_id := new.id;
  end if;

  -- La API es de todos: solo la desactivación explícita (/interno) la corta.
  -- Y solo se registra si alguien puede leerlos: un webhook activo, o una clave
  -- o un token vivos (las claves, también las de la cadena). Sin eso nadie vería el evento y
  -- `reservas` pagaría una escritura por nada.
  if v_studio is null or exists (
    select 1 from public.api_acceso_estudios a
     where a.studio_id = v_studio and a.desactivada_en is not null
  ) then
    return null;
  end if;
  select s.cadena_id into v_cadena from public.studios s where s.id = v_studio;
  if not (
    exists (select 1 from public.api_webhooks w where w.studio_id = v_studio and w.desactivado_en is null)
    or exists (select 1 from public.api_claves c
                where c.revocada_en is null and (c.expira_en is null or c.expira_en > now())
                  and (c.studio_id = v_studio or (v_cadena is not null and c.cadena_id = v_cadena)))
    or exists (select 1 from public.oauth_tokens t
                where t.revocado_en is null and t.refresh_token_expira_en > now()
                  and t.studio_id = v_studio)
  ) then
    return null;
  end if;

  v_recurso := case tg_table_name
    when 'recibos' then 'recibo'
    when 'facturas' then 'factura'
    when 'devoluciones' then 'devolucion'
    when 'ventas_pos' then 'venta'
    when 'socios' then 'clienta'
    when 'reservas' then 'reserva'
    when 'suscripciones' then 'suscripcion'
  end;
  if v_recurso is null then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    v_cols := case tg_table_name
      when 'recibos' then array[
        'socio_id', 'suscripcion_id', 'concepto', 'importe', 'importe_devuelto', 'estado',
        'fecha_vencimiento', 'fecha_cobro', 'fecha_devolucion', 'metodo_cobro', 'es_renovacion',
        'stripe_payment_intent_id', 'anulado_en', 'reembolso_stripe_id', 'reembolso_solicitado_en']
      when 'facturas' then array[
        'recibo_id', 'venta_pos_id', 'numero_completo', 'serie', 'tipo', 'tipo_rectificativa',
        'rectifica_a', 'importe_rectificacion', 'fecha_emision', 'receptor_nombre', 'receptor_nif',
        'concepto', 'base_imponible', 'tipo_iva', 'cuota_iva', 'total', 'verifactu_estado',
        'verifactu_csv', 'verifactu_qr_url']
      when 'devoluciones' then array[
        'recibo_id', 'venta_pos_id', 'socio_id', 'origen', 'importe_cobrado', 'importe_devuelto',
        'estado', 'stripe_charge_id', 'detectada_en', 'resuelta_en']
      when 'ventas_pos' then array[
        'numero', 'socio_id', 'recibo_id', 'realizada_en', 'estado', 'metodo_pago', 'subtotal',
        'descuento', 'base_imponible', 'iva_total', 'total', 'importe_devuelto', 'devuelta_en',
        'anulada_en']
      when 'socios' then array[
        'nombre', 'apellidos', 'email', 'telefono', 'activo', 'fecha_alta', 'nif', 'direccion']
      when 'reservas' then array[
        'sesion_id', 'socio_id', 'estado', 'spot_id', 'creado_en', 'check_in_en', 'origen',
        'cancelada_tardia']
      when 'suscripciones' then array[
        'socio_id', 'plan_id', 'estado', 'fecha_inicio', 'fecha_fin', 'sesiones_restantes',
        'baja_al_vencer']
    end;
    v_nueva := to_jsonb(new);
    v_vieja := to_jsonb(old);
    select coalesce(bool_or((v_nueva -> c) is distinct from (v_vieja -> c)), false)
      into v_cambia
      from unnest(v_cols) as c;
    if not v_cambia then
      return null;
    end if;
  end if;

  v_accion := case tg_op when 'INSERT' then 'creado' when 'UPDATE' then 'actualizado' else 'eliminado' end;
  if v_recurso <> 'recibo' then
    v_accion := left(v_accion, -1) || 'a';
  end if;

  begin
    insert into public.api_eventos (studio_id, tipo, recurso, recurso_id)
    values (v_studio, v_recurso || '.' || v_accion, v_recurso, v_id);
  exception when others then
    raise warning 'api_registrar_evento(%, %): % %', tg_table_name, v_id, sqlstate, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.api_registrar_evento() from public, anon, authenticated;
grant execute on function public.api_registrar_evento() to service_role, postgres;

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
begin
  if has_function_privilege('anon', 'public.api_registrar_evento()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.api_registrar_evento()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.api_registrar_evento()', 'EXECUTE') then
    raise exception 'api_registrar_evento: permisos de ejecución incorrectos';
  end if;
  if position('desactivada_en is not null' in pg_get_functiondef('public.api_registrar_evento()'::regprocedure)) = 0 then
    raise exception 'api_registrar_evento no usa la regla nueva (activa salvo desactivación)';
  end if;
  if (select count(*) from pg_trigger
       where tgname = 'trg_api_evento' and not tgisinternal) < 7 then
    raise exception 'faltan triggers de eventos (se esperaban 7 tablas)';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Eventos de la API pública: reservas y suscripciones (cuotas y bonos).
--
-- F2 (20261001162731) registró lo que necesita un programa de contabilidad. Esto
-- añade lo que piden las automatizaciones (Zapier: «nueva reserva», «reserva
-- cancelada») y el BI: `reserva.*` (permiso `reservas:leer`) y `suscripcion.*`
-- (permiso `planes:leer`). Mismo mecanismo, mismas reglas:
--   · solo en estudios con la API activada;
--   · un UPDATE solo es evento si cambia una columna que la API enseña
--     (`COLUMNAS.reserva` / `COLUMNAS.suscripcion` en serializar.ts; lo cruza
--     lib/api-publica/webhooks/catalogo.test.ts). Las marcas internas del motor
--     (recordatorios, confirmación de riesgo, consumo de bono, posición en la
--     lista de espera) no avisan a nadie;
--   · nunca tumba la escritura que lo dispara.
--
-- Los eventos de reserva no llevan datos personales: la clienta va por su id
-- (seudónimo) y el nombre que manda ClassPass/USC no sale. Por eso no hace falta
-- tocar `api_eventos_olvidar_clienta`.
--
-- `reservas` es la tabla con más escrituras del sistema. Para un estudio SIN la
-- API activada, el coste del trigger es la búsqueda por clave primaria en
-- `api_acceso_estudios` de siempre y nada más.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── El catálogo crece: CHECKs de los tipos y recursos ────────────────────────
alter table public.api_eventos drop constraint if exists api_eventos_tipo_check;
alter table public.api_eventos add constraint api_eventos_tipo_check check (
  tipo ~ '^(recibo\.(creado|actualizado|eliminado)|(factura|devolucion|venta|clienta|reserva|suscripcion)\.(creada|actualizada|eliminada))$'
);
alter table public.api_eventos drop constraint if exists api_eventos_recurso_check;
alter table public.api_eventos add constraint api_eventos_recurso_check check (
  recurso in ('recibo', 'factura', 'devolucion', 'venta', 'clienta', 'reserva', 'suscripcion')
);
alter table public.api_webhooks drop constraint if exists api_webhooks_tipos_check;
alter table public.api_webhooks add constraint api_webhooks_tipos_check check (
  cardinality(tipos) between 1 and 30
  and tipos <@ array[
    'recibo.creado', 'recibo.actualizado', 'recibo.eliminado',
    'factura.creada', 'factura.actualizada', 'factura.eliminada',
    'devolucion.creada', 'devolucion.actualizada', 'devolucion.eliminada',
    'venta.creada', 'venta.actualizada', 'venta.eliminada',
    'clienta.creada', 'clienta.actualizada', 'clienta.eliminada',
    'reserva.creada', 'reserva.actualizada', 'reserva.eliminada',
    'suscripcion.creada', 'suscripcion.actualizada', 'suscripcion.eliminada'
  ]::text[]
);

-- ── El trigger: la definición de F2 con las dos tablas nuevas ────────────────
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
begin
  if tg_op = 'DELETE' then
    v_studio := old.studio_id;
    v_id := old.id;
  else
    v_studio := new.studio_id;
    v_id := new.id;
  end if;

  if v_studio is null or not exists (
    select 1 from public.api_acceso_estudios a
     where a.studio_id = v_studio and a.desactivada_en is null
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

drop trigger if exists trg_api_evento on public.reservas;
create trigger trg_api_evento after insert or update or delete on public.reservas
  for each row execute function public.api_registrar_evento();
drop trigger if exists trg_api_evento on public.suscripciones;
create trigger trg_api_evento after insert or update or delete on public.suscripciones
  for each row execute function public.api_registrar_evento();

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
begin
  if has_function_privilege('anon', 'public.api_registrar_evento()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.api_registrar_evento()', 'EXECUTE') then
    raise exception 'api_registrar_evento sigue siendo ejecutable por anon/authenticated';
  end if;
  if (select count(*) from pg_trigger
       where tgname = 'trg_api_evento' and not tgisinternal
         and tgrelid in ('public.reservas'::regclass, 'public.suscripciones'::regclass)) <> 2 then
    raise exception 'faltan los triggers de eventos en reservas/suscripciones';
  end if;
end $$;

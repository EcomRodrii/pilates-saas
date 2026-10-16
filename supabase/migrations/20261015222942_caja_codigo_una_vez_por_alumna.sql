-- Los códigos de descuento «una vez por alumna» también en la Caja (decisión del
-- fundador, 16-oct-2026: «si, aplicalo tambien en la caja»).
--
-- Hasta ahora la regla solo existía en los tres cobros online: `codigos_descuento_consumos`
-- guarda quién ha usado cada código, con un UNIQUE (codigo_id, socio_id), y
-- `codigosYaUsadosPorSocia` lo lee antes de cobrar. La Caja solo sumaba el uso al tope
-- global (`usos`), así que una alumna podía usar en el mostrador el mismo código las
-- veces que quisiera, y uno ya usado en su app.
--
-- No se copia la regla: la Caja escribe en la MISMA tabla y choca con el MISMO índice.
-- Para eso la tabla deja de ser «un consumo por recibo» y pasa a «un consumo por recibo
-- O por venta de la Caja» (una venta de la Caja no es un recibo):
--   · clave propia (`id`); `recibo_id` deja de ser la clave y pasa a nulo, con su UNIQUE
--     de siempre (el reintento de un cobro online sigue chocando por él, 23505);
--   · `venta_pos_id`, con su UNIQUE, y exactamente uno de los dos (CHECK);
--   · el UNIQUE (codigo_id, socio_id) NO cambia: es la regla, y ahora la ven los dos.
-- Con eso `codigosYaUsadosPorSocia` (los cobros online) ve también lo usado en la Caja
-- sin tocar una línea suya.
--
-- `registrar_venta_pos`: con alumna y código, apunta el consumo en la misma transacción
-- que el tope global; si ya lo usó, `CODIGO_YA_USADO_POR_SOCIA` y no queda nada (ni la
-- venta, ni el uso, ni el stock). La vista previa (`p_solo_calcular`) lo ve igual.
-- `fallar_pago_venta_pos`: si el datáfono o el Bizum no salen, la venta se anula y el
-- código vuelve a estar libre para ella, como ya se devuelven el stock y el cupo de
-- matrícula. Una devolución NO lo libera: tampoco lo hace un reembolso online.
--
-- Las dos funciones parten de su definición viva, comprobada por md5.

set lock_timeout = '5s';

do $guardia$
declare
  v_md5 text;
begin
  select md5(p.prosrc) into v_md5
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_venta_pos';
  if v_md5 is distinct from '2e6cc50f1d337e3676bf4c79f1a80a43' then
    raise exception 'registrar_venta_pos ha cambiado desde que se escribió esta migración (md5 %): rehazla partiendo de la definición viva', v_md5;
  end if;
  select md5(p.prosrc) into v_md5
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fallar_pago_venta_pos';
  if v_md5 is distinct from '12503012586f9a5ad6c814c47f8b7e6f' then
    raise exception 'fallar_pago_venta_pos ha cambiado desde que se escribió esta migración (md5 %): rehazla partiendo de la definición viva', v_md5;
  end if;
end
$guardia$;

-- ── La tabla: un consumo por recibo O por venta de la Caja ────────────────────
alter table public.codigos_descuento_consumos
  add column id bigint generated always as identity,
  add column venta_pos_id text references public.ventas_pos(id) on delete cascade;
alter table public.codigos_descuento_consumos drop constraint codigos_descuento_consumos_pkey;
alter table public.codigos_descuento_consumos alter column recibo_id drop not null;
alter table public.codigos_descuento_consumos add constraint codigos_descuento_consumos_pkey primary key (id);
create unique index codigos_descuento_consumos_recibo_unq on public.codigos_descuento_consumos (recibo_id);
create unique index codigos_descuento_consumos_venta_unq on public.codigos_descuento_consumos (venta_pos_id);
-- ⚠️ El de (codigo_id, socio_id) se rehace DESPUÉS del de `recibo_id`, a propósito. Postgres comprueba
-- los índices únicos por orden de creación (OID), y el que salta es el primero que choca. Los cobros
-- online distinguen por el nombre del índice un reintento del webhook (choca por el recibo: silencio)
-- de un doble uso de verdad (choca por la alumna: aviso en Sentry, `consumirCodigoDescuentoSiAplica`).
-- Con el de `recibo_id` creado después, un reintento del mismo recibo chocaba antes por la alumna, y
-- cada reenvío del webhook era un falso «descuento aplicado dos veces». Rehaciéndolo, el orden queda
-- como estaba con la PK. Lo fija `supabase/tests/pos-codigo-una-vez-por-alumna.test.ts`.
drop index public.codigos_descuento_consumos_codigo_socio_unq;
create unique index codigos_descuento_consumos_codigo_socio_unq on public.codigos_descuento_consumos (codigo_id, socio_id);
alter table public.codigos_descuento_consumos
  add constraint codigos_descuento_consumos_un_origen check (num_nonnulls(recibo_id, venta_pos_id) = 1);

comment on table public.codigos_descuento_consumos is 'Consumo de un código de descuento: una fila por recibo (cobros online) o por venta de la Caja, y como mucho una por (codigo_id, socio_id): cada alumna usa cada código una vez, en cualquier canal, además del tope global de usos_max en codigos_descuento. La Caja solo apunta las ventas con alumna.';

-- ── registrar_venta_pos ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_venta_pos(p_venta_id text, p_studio_id text, p_socio_id text, p_lineas jsonb, p_descuento_tipo text, p_descuento_valor numeric, p_codigo_descuento_id text, p_metodo_pago text, p_caja_id text, p_vendido_por uuid, p_vendido_por_nombre text, p_efectivo_recibido numeric, p_idempotencia_clave text, p_estado_inicial text, p_notas text, p_total_esperado numeric DEFAULT NULL::numeric, p_solo_calcular boolean DEFAULT false)
 RETURNS TABLE(r_venta_id text, r_numero bigint, r_subtotal numeric, r_descuento numeric, r_base_imponible numeric, r_iva_total numeric, r_total numeric, r_cambio numeric, r_ya_existia boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_iva_defecto numeric(5,2); v_linea jsonb; v_tipo text; v_ref text; v_cantidad integer;
  v_nombre text; v_precio numeric(10,2); v_iva numeric(5,2); v_stock integer; v_activo boolean;
  v_bruto numeric(10,2); v_subtotal numeric(10,2) := 0; v_subtotal_descontable numeric(10,2) := 0;
  v_desc_manual numeric(10,2) := 0; v_desc_codigo numeric(10,2) := 0; v_descuento numeric(10,2) := 0;
  v_cod_tipo text; v_cod_valor numeric(10,2); v_cod_min numeric(10,2); v_cod_usos integer;
  v_numero bigint; v_total numeric(10,2) := 0; v_base numeric(10,2) := 0; v_iva_total numeric(10,2) := 0;
  v_cambio numeric(10,2); v_orden integer := 0; v_desc_repartido numeric(10,2) := 0;
  v_desc_linea numeric(10,2); v_linea_total numeric(10,2); v_linea_base numeric(10,2);
  v_ultima_id text; v_filas integer; v_controla_stock boolean; v_descontable boolean;
  v_ultimo_descontable integer; v_items jsonb := '[]'::jsonb; v_resueltas jsonb := '[]'::jsonb;
  v_existente record; v_matricula_evaluada boolean := false; v_matricula_catalogo   numeric;
  v_plan_tipo            text;
  v_matricula_a_cobrar numeric; v_matricula_plan_nombre text; v_matricula_gratis_plan_id text;
  v_matricula_cupo_ref text;
BEGIN
  IF p_idempotencia_clave IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_studio_id || ':idem:' || p_idempotencia_clave));
    SELECT v.id, v.numero, v.subtotal, v.descuento, v.base_imponible, v.iva_total, v.total, v.cambio
      INTO v_existente FROM public.ventas_pos v
     WHERE v.studio_id = p_studio_id AND v.idempotencia_clave = p_idempotencia_clave;
    IF FOUND THEN
      RETURN QUERY SELECT v_existente.id, v_existente.numero, v_existente.subtotal, v_existente.descuento,
        v_existente.base_imponible, v_existente.iva_total, v_existente.total, v_existente.cambio, true;
      RETURN;
    END IF;
  END IF;
  IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN RAISE EXCEPTION 'CARRITO_VACIO'; END IF;
  IF p_estado_inicial NOT IN ('PAGADA', 'PENDIENTE_PAGO') THEN RAISE EXCEPTION 'ESTADO_INICIAL_INVALIDO'; END IF;
  SELECT COALESCE(s.iva_por_defecto, 21) INTO v_iva_defecto FROM public.studios s WHERE s.id = p_studio_id;
  IF v_iva_defecto IS NULL THEN RAISE EXCEPTION 'ESTUDIO_NO_ENCONTRADO'; END IF;
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_tipo := v_linea->>'tipo'; v_ref := v_linea->>'referenciaId';
    v_cantidad := COALESCE((v_linea->>'cantidad')::int, 1);
    IF v_cantidad <= 0 OR v_cantidad > 999 THEN RAISE EXCEPTION 'CANTIDAD_INVALIDA:%', v_cantidad; END IF;
    IF v_tipo = 'PRODUCTO' THEN
      SELECT p.nombre, p.precio, COALESCE(p.iva_pct, v_iva_defecto), p.stock, p.activo
        INTO v_nombre, v_precio, v_iva, v_stock, v_activo
        FROM public.productos_pos p WHERE p.id = v_ref AND p.studio_id = p_studio_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ARTICULO_NO_ENCONTRADO:%', v_ref; END IF;
      IF v_activo IS FALSE THEN RAISE EXCEPTION 'ARTICULO_INACTIVO:%', v_nombre; END IF;
      IF v_stock IS NOT NULL AND v_stock < v_cantidad THEN RAISE EXCEPTION 'SIN_STOCK:%:%', v_nombre, v_stock; END IF;
    ELSIF v_tipo = 'PLAN' THEN
      IF v_cantidad <> 1 THEN RAISE EXCEPTION 'PLAN_CANTIDAD_UNICA'; END IF;
      SELECT pt.nombre, pt.precio, v_iva_defecto, NULL::int, pt.activo, pt.matricula, pt.tipo
        INTO v_nombre, v_precio, v_iva, v_stock, v_activo, v_matricula_catalogo, v_plan_tipo
        FROM public.planes_tarifa pt WHERE pt.id = v_ref AND pt.studio_id = p_studio_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NO_ENCONTRADO:%', v_ref; END IF;
      IF v_activo IS FALSE THEN RAISE EXCEPTION 'PLAN_INACTIVO:%', v_nombre; END IF;
      IF p_socio_id IS NULL AND v_plan_tipo = 'MENSUAL' THEN
        RAISE EXCEPTION 'CUOTA_SIN_CLIENTA:%', v_nombre;
      END IF;
      IF NOT v_matricula_evaluada AND p_socio_id IS NOT NULL THEN
        v_matricula_evaluada := true;
        IF COALESCE(v_matricula_catalogo, 0) > 0 AND NOT EXISTS (
          SELECT 1 FROM public.suscripciones s
          LEFT JOIN public.planes_tarifa pt ON pt.id = s.plan_id
          WHERE s.socio_id = p_socio_id AND s.studio_id = p_studio_id
            -- Ni la clase de prueba ni una clase suelta cuentan como «ya tuvo
            -- un plan». Un plan borrado del catálogo, sí (ante la duda, no se
            -- cobra de más): mismo criterio que `primeraVezConPlan`.
            AND (pt.id IS NULL OR (NOT pt.es_prueba AND pt.tipo <> 'PUNTUAL'))
        ) THEN
          v_matricula_a_cobrar := public.reservar_matricula(v_ref, p_studio_id);
          IF v_matricula_a_cobrar > 0 THEN v_matricula_plan_nombre := v_nombre; v_matricula_cupo_ref := v_ref;
          ELSE v_matricula_gratis_plan_id := v_ref; END IF;
        END IF;
      END IF;
    ELSIF v_tipo = 'LIBRE' THEN
      v_nombre := NULLIF(trim(COALESCE(v_linea->>'nombre', '')), '');
      v_precio := ROUND(COALESCE((v_linea->>'precio')::numeric, 0), 2); v_iva := v_iva_defecto; v_stock := NULL;
      IF v_nombre IS NULL THEN RAISE EXCEPTION 'CONCEPTO_LIBRE_SIN_NOMBRE'; END IF;
      IF v_precio < 0 OR v_precio > 10000 THEN RAISE EXCEPTION 'PRECIO_LIBRE_INVALIDO:%', v_precio; END IF;
      v_nombre := left(v_nombre, 120);
    ELSE RAISE EXCEPTION 'TIPO_LINEA_INVALIDO:%', COALESCE(v_tipo, '(null)'); END IF;
    v_bruto := ROUND(v_precio * v_cantidad, 2); v_subtotal := v_subtotal + v_bruto;
    v_subtotal_descontable := v_subtotal_descontable + v_bruto;
    v_resueltas := v_resueltas || jsonb_build_object('tipo', v_tipo, 'referenciaId', v_ref, 'nombre', v_nombre,
      'precio', v_precio, 'cantidad', v_cantidad, 'iva', v_iva, 'bruto', v_bruto,
      'controlaStock', v_stock IS NOT NULL, 'descontable', true);
  END LOOP;
  v_ultimo_descontable := jsonb_array_length(v_resueltas);
  IF v_matricula_a_cobrar > 0 THEN
    v_bruto := v_matricula_a_cobrar; v_subtotal := v_subtotal + v_bruto;
    v_resueltas := v_resueltas || jsonb_build_object('tipo', 'LIBRE', 'referenciaId', NULL,
      'nombre', left('Matrícula — ' || COALESCE(v_matricula_plan_nombre, 'plan'), 120),
      'precio', v_matricula_a_cobrar, 'cantidad', 1, 'iva', v_iva_defecto, 'bruto', v_bruto,
      'controlaStock', false, 'descontable', false);
  END IF;
  IF p_descuento_tipo = 'PORCENTAJE' THEN
    IF p_descuento_valor < 0 OR p_descuento_valor > 100 THEN RAISE EXCEPTION 'DESCUENTO_INVALIDO'; END IF;
    v_desc_manual := ROUND(v_subtotal_descontable * p_descuento_valor / 100, 2);
  ELSIF p_descuento_tipo = 'EUROS' THEN
    IF p_descuento_valor < 0 THEN RAISE EXCEPTION 'DESCUENTO_INVALIDO'; END IF;
    v_desc_manual := ROUND(p_descuento_valor, 2);
  END IF;
  IF p_codigo_descuento_id IS NOT NULL THEN
    UPDATE public.codigos_descuento c SET usos = COALESCE(c.usos, 0) + 1
     WHERE c.id = p_codigo_descuento_id AND c.studio_id = p_studio_id AND c.activo IS NOT FALSE
       AND (c.expira IS NULL OR c.expira >= public.hoy_estudio()) AND (c.usos_max IS NULL OR COALESCE(c.usos, 0) < c.usos_max)
    RETURNING c.tipo, c.valor, c.min_importe, c.usos INTO v_cod_tipo, v_cod_valor, v_cod_min, v_cod_usos;
    IF NOT FOUND THEN RAISE EXCEPTION 'CODIGO_NO_CANJEABLE'; END IF;
    IF v_cod_min IS NOT NULL AND v_subtotal_descontable < v_cod_min THEN
      RAISE EXCEPTION 'CODIGO_MINIMO_NO_ALCANZADO:%', v_cod_min;
    END IF;
    v_desc_codigo := CASE WHEN v_cod_tipo = 'PORCENTAJE' THEN ROUND(v_subtotal_descontable * v_cod_valor / 100, 2)
      ELSE ROUND(v_cod_valor, 2) END;
  END IF;
  v_descuento := LEAST(v_subtotal_descontable, GREATEST(0, v_desc_manual + v_desc_codigo));
  PERFORM pg_advisory_xact_lock(hashtext(p_studio_id || ':venta_pos'));
  SELECT COALESCE(MAX(v.numero), 0) + 1 INTO v_numero FROM public.ventas_pos v WHERE v.studio_id = p_studio_id;
  INSERT INTO public.ventas_pos (id, studio_id, socio_id, items, subtotal, descuento, total, metodo_pago,
    notas, realizada_en, numero, estado, pago_estado, pago_actualizado_en, base_imponible, iva_total,
    efectivo_recibido, cambio, vendido_por, vendido_por_nombre, caja_id, idempotencia_clave, matricula_cupo_plan_id
  ) VALUES (p_venta_id, p_studio_id, p_socio_id, '[]'::jsonb, v_subtotal, v_descuento, 0, p_metodo_pago, p_notas,
    now(), v_numero, p_estado_inicial, CASE WHEN p_estado_inicial = 'PAGADA' THEN 'PAGADO' ELSE 'PENDIENTE' END,
    now(), 0, 0, p_efectivo_recibido, NULL, p_vendido_por, p_vendido_por_nombre, p_caja_id, p_idempotencia_clave,
    v_matricula_gratis_plan_id);
  -- «Una vez por alumna» (fundador, 16-oct-2026): con la venta a nombre de una alumna, su uso
  -- del código queda en `codigos_descuento_consumos`, la MISMA tabla y el MISMO UNIQUE
  -- (codigo_id, socio_id) que los cobros online. Si ya lo usó —en la Caja o en su app—,
  -- choca aquí. Va tras insertar la venta (la fila la referencia) y antes de la vista
  -- previa, así que la pantalla se entera antes de cobrar. Sin alumna no hay a quién
  -- mirar: solo cuenta el tope global, de más arriba.
  IF p_codigo_descuento_id IS NOT NULL AND p_socio_id IS NOT NULL THEN
    INSERT INTO public.codigos_descuento_consumos (venta_pos_id, codigo_id, socio_id)
    VALUES (p_venta_id, p_codigo_descuento_id, p_socio_id)
    ON CONFLICT (codigo_id, socio_id) DO NOTHING;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas = 0 THEN RAISE EXCEPTION 'CODIGO_YA_USADO_POR_SOCIA'; END IF;
  END IF;
  FOR v_linea IN SELECT * FROM jsonb_array_elements(v_resueltas) LOOP
    v_orden := v_orden + 1; v_bruto := (v_linea->>'bruto')::numeric; v_iva := (v_linea->>'iva')::numeric;
    v_controla_stock := COALESCE((v_linea->>'controlaStock')::boolean, false);
    v_descontable := COALESCE((v_linea->>'descontable')::boolean, false);
    IF NOT v_descontable THEN v_desc_linea := 0;
    ELSIF v_orden = v_ultimo_descontable THEN v_desc_linea := ROUND(v_descuento - v_desc_repartido, 2);
    ELSIF v_subtotal_descontable > 0 THEN v_desc_linea := ROUND(v_descuento * v_bruto / v_subtotal_descontable, 2);
    ELSE v_desc_linea := 0; END IF;
    v_desc_repartido := v_desc_repartido + v_desc_linea;
    v_linea_total := ROUND(v_bruto - v_desc_linea, 2); v_linea_base := ROUND(v_linea_total / (1 + v_iva / 100), 2);
    v_ultima_id := p_venta_id || '-l' || v_orden;
    INSERT INTO public.ventas_pos_lineas (id, venta_id, studio_id, tipo, referencia_id, nombre, precio_unitario,
      cantidad, iva_pct, descuento, base_imponible, iva_importe, total, orden
    ) VALUES (v_ultima_id, p_venta_id, p_studio_id, v_linea->>'tipo', v_linea->>'referenciaId', v_linea->>'nombre',
      (v_linea->>'precio')::numeric, (v_linea->>'cantidad')::int, v_iva, v_desc_linea, v_linea_base,
      ROUND(v_linea_total - v_linea_base, 2), v_linea_total, v_orden);
    IF (v_linea->>'tipo') = 'PRODUCTO' AND v_controla_stock THEN
      UPDATE public.productos_pos p SET stock = p.stock - (v_linea->>'cantidad')::int
       WHERE p.id = (v_linea->>'referenciaId') AND p.studio_id = p_studio_id AND p.stock IS NOT NULL
         AND p.stock >= (v_linea->>'cantidad')::int;
      GET DIAGNOSTICS v_filas = ROW_COUNT;
      IF v_filas = 0 THEN RAISE EXCEPTION 'SIN_STOCK:%:%', v_linea->>'nombre', 0; END IF;
    END IF;
    v_total := v_total + v_linea_total; v_base := v_base + v_linea_base;
    v_iva_total := v_iva_total + ROUND(v_linea_total - v_linea_base, 2);
    v_items := v_items || jsonb_build_object('productoId', v_linea->>'referenciaId', 'nombre', v_linea->>'nombre',
      'precio', (v_linea->>'precio')::numeric, 'cantidad', (v_linea->>'cantidad')::int);
  END LOOP;
  -- La vista previa del cobro: el total de verdad, con la matrícula que se añade aquí. La
  -- excepción deshace la venta, sus líneas, el stock, el cupo de matrícula y el uso del código.
  IF p_solo_calcular THEN
    RAISE EXCEPTION 'PRESUPUESTO:%:%:%', v_total, COALESCE(v_matricula_a_cobrar, 0),
      CASE WHEN v_matricula_a_cobrar > 0 THEN v_matricula_cupo_ref ELSE '' END;
  END IF;
  -- Lo que vio quien cobra tiene que ser lo que se registra. Si no, ni PAGADA ni cobro lanzado.
  IF p_total_esperado IS NOT NULL AND ROUND(p_total_esperado, 2) <> v_total THEN
    RAISE EXCEPTION 'IMPORTE_NO_COINCIDE:%:%:%:%', ROUND(p_total_esperado, 2), v_total,
      COALESCE(v_matricula_a_cobrar, 0), CASE WHEN v_matricula_a_cobrar > 0 THEN v_matricula_cupo_ref ELSE '' END;
  END IF;
  IF p_metodo_pago = 'EFECTIVO' AND p_efectivo_recibido IS NOT NULL THEN
    IF p_efectivo_recibido < v_total THEN RAISE EXCEPTION 'EFECTIVO_INSUFICIENTE:%:%', p_efectivo_recibido, v_total; END IF;
    v_cambio := ROUND(p_efectivo_recibido - v_total, 2);
  END IF;
  UPDATE public.ventas_pos v SET total = v_total, base_imponible = v_base, iva_total = v_iva_total,
    cambio = v_cambio, items = v_items WHERE v.id = p_venta_id;
  IF p_caja_id IS NOT NULL THEN
    PERFORM 1 FROM public.cajas c WHERE c.id = p_caja_id AND c.studio_id = p_studio_id AND c.estado = 'ABIERTA';
    IF NOT FOUND THEN p_caja_id := NULL; END IF;
  END IF;
  IF p_caja_id IS NOT NULL AND p_estado_inicial = 'PAGADA' AND v_total > 0 THEN
    INSERT INTO public.movimientos_caja (id, studio_id, caja_id, tipo, importe, metodo_pago, concepto,
      referencia, creado_por, creado_por_nombre
    ) VALUES (p_venta_id || '-mov', p_studio_id, p_caja_id, 'VENTA', v_total, p_metodo_pago,
      'Venta #' || lpad(v_numero::text, 6, '0'), p_venta_id, p_vendido_por, p_vendido_por_nombre);
  END IF;
  RETURN QUERY SELECT p_venta_id, v_numero, v_subtotal, v_descuento, v_base, v_iva_total, v_total, v_cambio, false;
END;
$function$;

revoke all on function public.registrar_venta_pos(text,text,text,jsonb,text,numeric,text,text,text,uuid,text,numeric,text,text,text,numeric,boolean) from public, anon, authenticated;
grant execute on function public.registrar_venta_pos(text,text,text,jsonb,text,numeric,text,text,text,uuid,text,numeric,text,text,text,numeric,boolean) to service_role;

-- ── fallar_pago_venta_pos ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fallar_pago_venta_pos(p_venta_id text, p_studio_id text, p_pago_estado text, p_motivo text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_afectadas integer;
  v_plan_matricula text;
begin
  if p_pago_estado not in ('RECHAZADO','CANCELADO','EXPIRADO','ERROR') then
    raise exception 'PAGO_ESTADO_INVALIDO:%', p_pago_estado;
  end if;

  update public.ventas_pos v
     set estado = 'ANULADA', pago_estado = p_pago_estado,
         pago_actualizado_en = now(), pago_error = left(coalesce(p_motivo, ''), 300),
         anulada_en = now(), anulada_motivo = 'Pago no completado'
   where v.id = p_venta_id
     and v.studio_id = p_studio_id
     and v.estado = 'PENDIENTE_PAGO'
  returning v.matricula_cupo_plan_id into v_plan_matricula;
  get diagnostics v_afectadas = row_count;
  if v_afectadas = 0 then return false; end if;

  update public.productos_pos p
     set stock = p.stock + l.cantidad
    from public.ventas_pos_lineas l
   where l.venta_id = p_venta_id
     and l.tipo = 'PRODUCTO'
     and p.id = l.referencia_id
     and p.studio_id = p_studio_id
     and p.stock is not null;

  if v_plan_matricula is not null then
    perform public.liberar_cupo_matricula(v_plan_matricula, p_studio_id);
  end if;

  -- El código que esta venta apuntó a nombre de la alumna: no se cobró, así que puede
  -- volver a usarlo (16-oct-2026, «una vez por alumna» en la Caja).
  delete from public.codigos_descuento_consumos c where c.venta_pos_id = p_venta_id;

  return true;
end;
$function$;

revoke all on function public.fallar_pago_venta_pos(text,text,text,text) from public, anon, authenticated;
grant execute on function public.fallar_pago_venta_pos(text,text,text,text) to service_role;

do $permisos$
declare
  r constant regprocedure := 'public.registrar_venta_pos(text,text,text,jsonb,text,numeric,text,text,text,uuid,text,numeric,text,text,text,numeric,boolean)'::regprocedure;
  f constant regprocedure := 'public.fallar_pago_venta_pos(text,text,text,text)'::regprocedure;
begin
  if has_function_privilege('anon', r, 'EXECUTE') or has_function_privilege('authenticated', r, 'EXECUTE')
     or has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
    raise exception 'registrar_venta_pos o fallar_pago_venta_pos ejecutable desde el navegador';
  end if;
  if not has_function_privilege('service_role', r, 'EXECUTE') or not has_function_privilege('service_role', f, 'EXECUTE') then
    raise exception 'registrar_venta_pos o fallar_pago_venta_pos sin EXECUTE para service_role: la Caja no podría vender';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('registrar_venta_pos', 'fallar_pago_venta_pos')) <> 2 then
    raise exception 'registrar_venta_pos o fallar_pago_venta_pos tiene más de una firma';
  end if;
  if position('current_date' in lower(pg_get_functiondef(r))) > 0 then
    raise exception 'registrar_venta_pos vuelve a medir la caducidad del código con el día de UTC';
  end if;
end
$permisos$;

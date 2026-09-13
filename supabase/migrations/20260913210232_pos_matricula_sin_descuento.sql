-- ─────────────────────────────────────────────────────────────────────────────
-- I-8 (59ª auditoría, 13-sep-2026): el TPV aplicaba el descuento del ticket
-- también a la línea de matrícula; los otros cuatro caminos que cobran
-- matrícula NO lo hacen — decisión ya cerrada en la 26ª pasada (P-1): "el
-- código de descuento es del PLAN, no de esta venta aparte". Los dos
-- checkouts online suman `matriculaCentimos` DESPUÉS de aplicar el descuento
-- al importe del plan; los dos de mostrador emiten el recibo de matrícula con
-- el importe de catálogo intacto. El TPV era el único que, al meter la línea
-- de matrícula en el mismo `v_subtotal` que reparte el descuento, dejaba que
-- un código del 100% o un descuento manual se llevara también la matrícula.
--
-- Efecto secundario del mismo bug: el `min_importe` de un código se
-- comprobaba contra el subtotal YA INFLADO con la matrícula, así que un
-- código "mínimo 50€" se volvía canjeable gracias a ella sin que el CARRITO
-- llegase a esos 50€.
--
-- Arreglo: cada línea se marca `descontable` (todo lo que viene de
-- `p_lineas`) o no (la línea sintética de matrícula). El descuento —manual y
-- de código, incluido el `min_importe`— se calcula y se reparte SOLO sobre el
-- subtotal descontable; la línea de matrícula sale siempre con descuento 0.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_venta_pos(
  p_venta_id            text,
  p_studio_id           text,
  p_socio_id            text,
  p_lineas              jsonb,
  p_descuento_tipo      text,
  p_descuento_valor     numeric,
  p_codigo_descuento_id text,
  p_metodo_pago         text,
  p_caja_id             text,
  p_vendido_por         uuid,
  p_vendido_por_nombre  text,
  p_efectivo_recibido   numeric,
  p_idempotencia_clave  text,
  p_estado_inicial      text,
  p_notas               text
)
RETURNS TABLE (
  r_venta_id       text,
  r_numero         bigint,
  r_subtotal       numeric,
  r_descuento      numeric,
  r_base_imponible numeric,
  r_iva_total      numeric,
  r_total          numeric,
  r_cambio         numeric,
  r_ya_existia     boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_iva_defecto   numeric(5,2);
  v_linea         jsonb;
  v_tipo          text;
  v_ref           text;
  v_cantidad      integer;
  v_nombre        text;
  v_precio        numeric(10,2);
  v_iva           numeric(5,2);
  v_stock         integer;
  v_activo        boolean;
  v_bruto         numeric(10,2);
  v_subtotal      numeric(10,2) := 0;
  -- I-8: subtotal SOLO de lo que puede llevar descuento (nunca la matrícula).
  v_subtotal_descontable numeric(10,2) := 0;
  v_desc_manual   numeric(10,2) := 0;
  v_desc_codigo   numeric(10,2) := 0;
  v_descuento     numeric(10,2) := 0;
  v_cod_tipo      text;
  v_cod_valor     numeric(10,2);
  v_cod_min       numeric(10,2);
  v_cod_usos      integer;
  v_numero        bigint;
  v_total         numeric(10,2) := 0;
  v_base          numeric(10,2) := 0;
  v_iva_total     numeric(10,2) := 0;
  v_cambio        numeric(10,2);
  v_orden         integer := 0;
  v_desc_repartido numeric(10,2) := 0;
  v_desc_linea    numeric(10,2);
  v_linea_total   numeric(10,2);
  v_linea_base    numeric(10,2);
  v_ultima_id     text;
  v_filas         integer;
  v_controla_stock boolean;
  v_descontable   boolean;
  -- I-8: orden de la última línea descontable (la matrícula, si existe,
  -- siempre se añade al final y nunca lo es) — es la que se lleva el
  -- redondeo sobrante del reparto.
  v_ultimo_descontable integer;
  v_items         jsonb := '[]'::jsonb;
  v_resueltas     jsonb := '[]'::jsonb;
  v_existente     record;
  v_matricula_evaluada   boolean := false;
  v_matricula_catalogo   numeric;
  v_matricula_a_cobrar   numeric;
  v_matricula_plan_nombre text;
  v_matricula_gratis_plan_id text;
BEGIN
  IF p_idempotencia_clave IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_studio_id || ':idem:' || p_idempotencia_clave));
    SELECT v.id, v.numero, v.subtotal, v.descuento, v.base_imponible,
           v.iva_total, v.total, v.cambio
      INTO v_existente
      FROM public.ventas_pos v
     WHERE v.studio_id = p_studio_id
       AND v.idempotencia_clave = p_idempotencia_clave;
    IF FOUND THEN
      RETURN QUERY SELECT v_existente.id, v_existente.numero, v_existente.subtotal,
                          v_existente.descuento, v_existente.base_imponible,
                          v_existente.iva_total, v_existente.total,
                          v_existente.cambio, true;
      RETURN;
    END IF;
  END IF;

  IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'CARRITO_VACIO';
  END IF;
  IF p_estado_inicial NOT IN ('PAGADA', 'PENDIENTE_PAGO') THEN
    RAISE EXCEPTION 'ESTADO_INICIAL_INVALIDO';
  END IF;

  SELECT COALESCE(s.iva_por_defecto, 21) INTO v_iva_defecto
    FROM public.studios s WHERE s.id = p_studio_id;
  IF v_iva_defecto IS NULL THEN
    RAISE EXCEPTION 'ESTUDIO_NO_ENCONTRADO';
  END IF;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    v_tipo     := v_linea->>'tipo';
    v_ref      := v_linea->>'referenciaId';
    v_cantidad := COALESCE((v_linea->>'cantidad')::int, 1);

    IF v_cantidad <= 0 OR v_cantidad > 999 THEN
      RAISE EXCEPTION 'CANTIDAD_INVALIDA:%', v_cantidad;
    END IF;

    IF v_tipo = 'PRODUCTO' THEN
      SELECT p.nombre, p.precio, COALESCE(p.iva_pct, v_iva_defecto), p.stock, p.activo
        INTO v_nombre, v_precio, v_iva, v_stock, v_activo
        FROM public.productos_pos p
       WHERE p.id = v_ref AND p.studio_id = p_studio_id
       FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ARTICULO_NO_ENCONTRADO:%', v_ref; END IF;
      IF v_activo IS FALSE THEN RAISE EXCEPTION 'ARTICULO_INACTIVO:%', v_nombre; END IF;
      IF v_stock IS NOT NULL AND v_stock < v_cantidad THEN
        RAISE EXCEPTION 'SIN_STOCK:%:%', v_nombre, v_stock;
      END IF;

    ELSIF v_tipo = 'PLAN' THEN
      IF v_cantidad <> 1 THEN RAISE EXCEPTION 'PLAN_CANTIDAD_UNICA'; END IF;
      SELECT pt.nombre, pt.precio, v_iva_defecto, NULL::int, pt.activo, pt.matricula
        INTO v_nombre, v_precio, v_iva, v_stock, v_activo, v_matricula_catalogo
        FROM public.planes_tarifa pt
       WHERE pt.id = v_ref AND pt.studio_id = p_studio_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NO_ENCONTRADO:%', v_ref; END IF;
      IF v_activo IS FALSE THEN RAISE EXCEPTION 'PLAN_INACTIVO:%', v_nombre; END IF;
      IF p_socio_id IS NULL THEN RAISE EXCEPTION 'PLAN_SIN_CLIENTA:%', v_nombre; END IF;

      IF NOT v_matricula_evaluada THEN
        v_matricula_evaluada := true;
        IF COALESCE(v_matricula_catalogo, 0) > 0
           AND NOT EXISTS (
             SELECT 1 FROM public.suscripciones s
              WHERE s.socio_id = p_socio_id AND s.studio_id = p_studio_id
           )
        THEN
          v_matricula_a_cobrar := public.reservar_matricula(v_ref, p_studio_id);
          IF v_matricula_a_cobrar > 0 THEN
            v_matricula_plan_nombre := v_nombre;
          ELSE
            v_matricula_gratis_plan_id := v_ref;
          END IF;
        END IF;
      END IF;

    ELSIF v_tipo = 'LIBRE' THEN
      v_nombre := NULLIF(trim(COALESCE(v_linea->>'nombre', '')), '');
      v_precio := ROUND(COALESCE((v_linea->>'precio')::numeric, 0), 2);
      v_iva    := v_iva_defecto;
      v_stock  := NULL;
      IF v_nombre IS NULL THEN RAISE EXCEPTION 'CONCEPTO_LIBRE_SIN_NOMBRE'; END IF;
      IF v_precio < 0 OR v_precio > 10000 THEN RAISE EXCEPTION 'PRECIO_LIBRE_INVALIDO:%', v_precio; END IF;
      v_nombre := left(v_nombre, 120);
    ELSE
      RAISE EXCEPTION 'TIPO_LINEA_INVALIDO:%', COALESCE(v_tipo, '(null)');
    END IF;

    v_bruto    := ROUND(v_precio * v_cantidad, 2);
    v_subtotal := v_subtotal + v_bruto;
    v_subtotal_descontable := v_subtotal_descontable + v_bruto;

    v_resueltas := v_resueltas || jsonb_build_object(
      'tipo', v_tipo, 'referenciaId', v_ref, 'nombre', v_nombre,
      'precio', v_precio, 'cantidad', v_cantidad, 'iva', v_iva, 'bruto', v_bruto,
      'controlaStock', v_stock IS NOT NULL, 'descontable', true
    );
  END LOOP;

  -- Última línea descontable hasta ahora: es la del carrito real, antes de
  -- añadir (si toca) la línea de matrícula justo debajo.
  v_ultimo_descontable := jsonb_array_length(v_resueltas);

  -- Línea de matrícula, si toca cobrarla: SIEMPRE aparte del plan y NUNCA
  -- descontable (I-8) — ni el descuento del ticket ni el `min_importe` de un
  -- código la ven, mismo criterio que los otros cuatro caminos de venta.
  IF v_matricula_a_cobrar > 0 THEN
    v_bruto    := v_matricula_a_cobrar;
    v_subtotal := v_subtotal + v_bruto;
    v_resueltas := v_resueltas || jsonb_build_object(
      'tipo', 'LIBRE', 'referenciaId', NULL,
      'nombre', left('Matrícula — ' || COALESCE(v_matricula_plan_nombre, 'plan'), 120),
      'precio', v_matricula_a_cobrar, 'cantidad', 1, 'iva', v_iva_defecto, 'bruto', v_bruto,
      'controlaStock', false, 'descontable', false
    );
  END IF;

  IF p_descuento_tipo = 'PORCENTAJE' THEN
    IF p_descuento_valor < 0 OR p_descuento_valor > 100 THEN
      RAISE EXCEPTION 'DESCUENTO_INVALIDO';
    END IF;
    v_desc_manual := ROUND(v_subtotal_descontable * p_descuento_valor / 100, 2);
  ELSIF p_descuento_tipo = 'EUROS' THEN
    IF p_descuento_valor < 0 THEN RAISE EXCEPTION 'DESCUENTO_INVALIDO'; END IF;
    v_desc_manual := ROUND(p_descuento_valor, 2);
  END IF;

  IF p_codigo_descuento_id IS NOT NULL THEN
    UPDATE public.codigos_descuento c
       SET usos = COALESCE(c.usos, 0) + 1
     WHERE c.id = p_codigo_descuento_id
       AND c.studio_id = p_studio_id
       AND c.activo IS NOT FALSE
       AND (c.expira IS NULL OR c.expira >= CURRENT_DATE)
       AND (c.usos_max IS NULL OR COALESCE(c.usos, 0) < c.usos_max)
    RETURNING c.tipo, c.valor, c.min_importe, c.usos
         INTO v_cod_tipo, v_cod_valor, v_cod_min, v_cod_usos;
    IF NOT FOUND THEN RAISE EXCEPTION 'CODIGO_NO_CANJEABLE'; END IF;
    -- I-8: el mínimo del código se mide contra el CARRITO, no contra un
    -- subtotal inflado con la matrícula.
    IF v_cod_min IS NOT NULL AND v_subtotal_descontable < v_cod_min THEN
      RAISE EXCEPTION 'CODIGO_MINIMO_NO_ALCANZADO:%', v_cod_min;
    END IF;
    v_desc_codigo := CASE
      WHEN v_cod_tipo = 'PORCENTAJE' THEN ROUND(v_subtotal_descontable * v_cod_valor / 100, 2)
      ELSE ROUND(v_cod_valor, 2)
    END;
  END IF;

  v_descuento := LEAST(v_subtotal_descontable, GREATEST(0, v_desc_manual + v_desc_codigo));

  PERFORM pg_advisory_xact_lock(hashtext(p_studio_id || ':venta_pos'));
  SELECT COALESCE(MAX(v.numero), 0) + 1 INTO v_numero
    FROM public.ventas_pos v WHERE v.studio_id = p_studio_id;

  INSERT INTO public.ventas_pos (
    id, studio_id, socio_id, items, subtotal, descuento, total, metodo_pago,
    notas, realizada_en, numero, estado, pago_estado, pago_actualizado_en,
    base_imponible, iva_total, efectivo_recibido, cambio,
    vendido_por, vendido_por_nombre, caja_id, idempotencia_clave,
    matricula_cupo_plan_id
  ) VALUES (
    p_venta_id, p_studio_id, p_socio_id, '[]'::jsonb, v_subtotal, v_descuento, 0,
    p_metodo_pago, p_notas, now(), v_numero, p_estado_inicial,
    CASE WHEN p_estado_inicial = 'PAGADA' THEN 'PAGADO' ELSE 'PENDIENTE' END,
    now(), 0, 0, p_efectivo_recibido, NULL,
    p_vendido_por, p_vendido_por_nombre, p_caja_id, p_idempotencia_clave,
    v_matricula_gratis_plan_id
  );

  FOR v_linea IN SELECT * FROM jsonb_array_elements(v_resueltas)
  LOOP
    v_orden    := v_orden + 1;
    v_bruto    := (v_linea->>'bruto')::numeric;
    v_iva      := (v_linea->>'iva')::numeric;
    v_controla_stock := COALESCE((v_linea->>'controlaStock')::boolean, false);
    v_descontable := COALESCE((v_linea->>'descontable')::boolean, false);

    IF NOT v_descontable THEN
      v_desc_linea := 0;
    ELSIF v_orden = v_ultimo_descontable THEN
      v_desc_linea := ROUND(v_descuento - v_desc_repartido, 2);
    ELSIF v_subtotal_descontable > 0 THEN
      v_desc_linea := ROUND(v_descuento * v_bruto / v_subtotal_descontable, 2);
    ELSE
      v_desc_linea := 0;
    END IF;
    v_desc_repartido := v_desc_repartido + v_desc_linea;

    v_linea_total := ROUND(v_bruto - v_desc_linea, 2);
    v_linea_base  := ROUND(v_linea_total / (1 + v_iva / 100), 2);

    v_ultima_id := p_venta_id || '-l' || v_orden;

    INSERT INTO public.ventas_pos_lineas (
      id, venta_id, studio_id, tipo, referencia_id, nombre, precio_unitario,
      cantidad, iva_pct, descuento, base_imponible, iva_importe, total, orden
    ) VALUES (
      v_ultima_id, p_venta_id, p_studio_id,
      v_linea->>'tipo', v_linea->>'referenciaId', v_linea->>'nombre',
      (v_linea->>'precio')::numeric, (v_linea->>'cantidad')::int, v_iva,
      v_desc_linea, v_linea_base, ROUND(v_linea_total - v_linea_base, 2),
      v_linea_total, v_orden
    );

    IF (v_linea->>'tipo') = 'PRODUCTO' AND v_controla_stock THEN
      UPDATE public.productos_pos p
         SET stock = p.stock - (v_linea->>'cantidad')::int
       WHERE p.id = (v_linea->>'referenciaId')
         AND p.studio_id = p_studio_id
         AND p.stock IS NOT NULL
         AND p.stock >= (v_linea->>'cantidad')::int;
      GET DIAGNOSTICS v_filas = ROW_COUNT;
      IF v_filas = 0 THEN
        RAISE EXCEPTION 'SIN_STOCK:%:%', v_linea->>'nombre', 0;
      END IF;
    END IF;

    v_total     := v_total + v_linea_total;
    v_base      := v_base + v_linea_base;
    v_iva_total := v_iva_total + ROUND(v_linea_total - v_linea_base, 2);

    v_items := v_items || jsonb_build_object(
      'productoId', v_linea->>'referenciaId',
      'nombre',     v_linea->>'nombre',
      'precio',     (v_linea->>'precio')::numeric,
      'cantidad',   (v_linea->>'cantidad')::int
    );
  END LOOP;

  IF p_metodo_pago = 'EFECTIVO' AND p_efectivo_recibido IS NOT NULL THEN
    IF p_efectivo_recibido < v_total THEN
      RAISE EXCEPTION 'EFECTIVO_INSUFICIENTE:%:%', p_efectivo_recibido, v_total;
    END IF;
    v_cambio := ROUND(p_efectivo_recibido - v_total, 2);
  END IF;

  UPDATE public.ventas_pos v
     SET total = v_total, base_imponible = v_base, iva_total = v_iva_total,
         cambio = v_cambio, items = v_items
   WHERE v.id = p_venta_id;

  IF p_caja_id IS NOT NULL THEN
    PERFORM 1 FROM public.cajas c
     WHERE c.id = p_caja_id AND c.studio_id = p_studio_id AND c.estado = 'ABIERTA';
    IF NOT FOUND THEN p_caja_id := NULL; END IF;
  END IF;

  IF p_caja_id IS NOT NULL AND p_estado_inicial = 'PAGADA' AND v_total > 0 THEN
    INSERT INTO public.movimientos_caja (
      id, studio_id, caja_id, tipo, importe, metodo_pago, concepto,
      referencia, creado_por, creado_por_nombre
    ) VALUES (
      p_venta_id || '-mov', p_studio_id, p_caja_id, 'VENTA', v_total,
      p_metodo_pago, 'Venta #' || lpad(v_numero::text, 6, '0'),
      p_venta_id, p_vendido_por, p_vendido_por_nombre
    );
  END IF;

  RETURN QUERY SELECT p_venta_id, v_numero, v_subtotal, v_descuento,
                      v_base, v_iva_total, v_total, v_cambio, false;
END;
$$;

COMMENT ON FUNCTION public.registrar_venta_pos(text,text,text,jsonb,text,numeric,text,text,text,uuid,text,numeric,text,text,text) IS
  'POS: única puerta de registro de venta. Recibe ids y cantidades; relee precio/IVA del catálogo, reserva stock con FOR UPDATE, cobra matrícula aparte en la primera línea PLAN si toca (nunca descontable, I-8), valida y consume el código de descuento (contra el subtotal SIN matrícula), numera y escribe cabecera + líneas + movimiento de caja. Idempotente por (studio_id, idempotencia_clave). Solo service_role: la autorización de rol vive en /api/pos/venta.';

-- Sin GRANT nuevo: misma firma exacta que la versión anterior.

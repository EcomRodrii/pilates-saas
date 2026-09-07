-- ─────────────────────────────────────────────────────────────────────────────
-- TPV — cobrar sin ficha de clienta (fase 2)
--
-- Petición explícita: «el punto de venta debe ser también libre, cobrar algo
-- sin tener que poner una alumna o clienta; puede ser alguien que viene a
-- comprar algo o una clase de prueba sin necesidad de tener ficha».
--
-- Productos e importe libre YA se podían cobrar sin ficha desde el rediseño.
-- Lo que no se podía era vender un BONO o una CLASE SUELTA: `registrar_venta_pos`
-- lanzaba `PLAN_SIN_CLIENTA`. El resultado real en producción (venta #20) fue
-- que la clase de prueba se cobró como importe libre con el concepto escrito a
-- mano: 20 € que entraron bien, con recibo y factura correctos, pero que no
-- constan como clase en ninguna parte.
--
-- Esta migración hace dos cosas:
--
--   1. Quita el veto. Un plan sin clienta se vende, y su línea queda con
--      `suscripcion_id` a NULL — «cobrado, sin entregar».
--   2. Añade `asignar_venta_pos_a_socia`, para cuando esa persona sí abre
--      ficha (ese mismo día o tres semanas después): la venta se le engancha y
--      el bono se le entrega entonces, con la lógica de entrega de siempre.
--
-- ⚠️ La FACTURA no se toca al asignar, a propósito. Se emitió como F2
-- (simplificada, sin receptor identificado), que es exactamente lo que la
-- norma prevé para un ticket de mostrador. Reescribir el receptor de un
-- documento ya sellado y encadenado en Veri*Factu sería falsear un documento
-- fiscal emitido. Si la clienta quiere factura completa a su nombre, el camino
-- es el que ya existe: una rectificativa desde /facturas, con criterio de
-- gestoría.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_venta_pos(
  p_venta_id            text,
  p_studio_id           text,
  p_socio_id            text,
  -- [{ tipo: 'PRODUCTO'|'PLAN'|'LIBRE', referenciaId: text, cantidad: int,
  --    nombre?: text, precio?: numeric }]  (nombre/precio SOLO para LIBRE)
  p_lineas              jsonb,
  p_descuento_tipo      text,               -- 'EUROS' | 'PORCENTAJE' | NULL
  p_descuento_valor     numeric,
  p_codigo_descuento_id text,
  p_metodo_pago         text,
  p_caja_id             text,
  p_vendido_por         uuid,
  p_vendido_por_nombre  text,
  p_efectivo_recibido   numeric,
  p_idempotencia_clave  text,
  p_estado_inicial      text,               -- 'PAGADA' | 'PENDIENTE_PAGO'
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
  v_items         jsonb := '[]'::jsonb;
  -- Cada línea se guarda dos veces en memoria: una para insertar y otra para
  -- poder repartir el descuento con el subtotal ya conocido (hace falta el
  -- total antes de poder prorratear). Un array temporal evita releer el
  -- catálogo dos veces y, sobre todo, evita que el precio pueda CAMBIAR entre
  -- la primera pasada y la segunda.
  v_resueltas     jsonb := '[]'::jsonb;
  v_existente     record;
BEGIN
  -- ── 0. Idempotencia ───────────────────────────────────────────────────────
  -- Un doble toque en «Cobrar», o un reintento de red del TPV, devuelven la
  -- MISMA venta. Se comprueba ANTES de tocar nada: si se hiciera al final, el
  -- stock ya se habría descontado dos veces.
  IF p_idempotencia_clave IS NOT NULL THEN
    -- Lock por CLAVE antes de mirar. Sin él, dos peticiones simultáneas con la
    -- misma clave (el doble toque, que es justo el caso para el que esto
    -- existe) pasan las dos el SELECT y la perdedora choca con el índice único:
    -- su transacción entera se deshace —así que no hay doble cobro— pero quien
    -- reintenta recibe un 23505 crudo en vez de su venta.
    --
    -- ⚠️ Y NO se acota por tiempo. Se intentó con una ventana de 15 minutos y
    -- se contradice con el índice, que es permanente: pasada la ventana el
    -- SELECT ignora la clave, el INSERT choca igual, y la venta muere con un
    -- error de restricción. O manda el índice o manda la ventana; manda el
    -- índice. Que la clave no se repita es trabajo del nonce por intento que
    -- genera el TPV, no de un plazo aquí.
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

  -- ── 1. Resolver el catálogo y bloquear el stock ───────────────────────────
  -- El `FOR UPDATE` es lo que hace imposible vender dos veces la última
  -- unidad: dos ventas simultáneas del mismo artículo se serializan aquí, y
  -- la segunda ve el stock que dejó la primera. Se coge el bloqueo ANTES de
  -- validar para que la comprobación y el descuento no puedan separarse.
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
      -- Un plan por línea. Vender dos bonos iguales son DOS líneas, porque
      -- cada bono es una suscripción independiente con su propio saldo y su
      -- propia caducidad — una línea con cantidad 2 no sabría a cuál apunta
      -- su `suscripcion_id`.
      IF v_cantidad <> 1 THEN RAISE EXCEPTION 'PLAN_CANTIDAD_UNICA'; END IF;
      SELECT pt.nombre, pt.precio, v_iva_defecto, NULL::int, pt.activo
        INTO v_nombre, v_precio, v_iva, v_stock, v_activo
        FROM public.planes_tarifa pt
       WHERE pt.id = v_ref AND pt.studio_id = p_studio_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NO_ENCONTRADO:%', v_ref; END IF;
      IF v_activo IS FALSE THEN RAISE EXCEPTION 'PLAN_INACTIVO:%', v_nombre; END IF;
      -- Un plan SIN clienta AHORA SE PUEDE VENDER. Antes se negaba aquí
      -- (`PLAN_SIN_CLIENTA`), y el mostrador acababa cobrando la clase de
      -- prueba como importe libre con el concepto tecleado a mano: el dinero
      -- entraba igual, pero la clase no quedaba registrada como clase en
      -- ningún sitio, ni descontaba de nada, ni podía asignarse después.
      --
      -- El bono NO se entrega a nadie todavía: la línea nace con
      -- `suscripcion_id` a NULL y la venta queda «por asignar» hasta que
      -- alguien le ponga ficha (`asignar_venta_pos_a_socia`). Esto no reabre
      -- el bug que arregló `entregarPlanComprado` —cobrar y perder el rastro—
      -- porque aquí el rastro es una fila visible con su botón, no un aviso
      -- enterrado en un log.

    ELSIF v_tipo = 'LIBRE' THEN
      -- Concepto escrito a mano en el mostrador. El precio SÍ viene del
      -- cliente aquí, y es correcto que así sea: no hay catálogo que releer,
      -- es una decisión deliberada de quien cobra (con `puedeMoverDinero` ya
      -- comprobado en la ruta) y queda firmada con su `vendido_por`. Se acota
      -- igualmente para que un typo no se convierta en un cargo absurdo.
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

    v_resueltas := v_resueltas || jsonb_build_object(
      'tipo', v_tipo, 'referenciaId', v_ref, 'nombre', v_nombre,
      'precio', v_precio, 'cantidad', v_cantidad, 'iva', v_iva, 'bruto', v_bruto,
      -- Si el artículo lleva control de existencias. Se decide AQUÍ, con la
      -- fila ya bloqueada, para que la segunda pasada no tenga que releerla.
      'controlaStock', v_stock IS NOT NULL
    );
  END LOOP;

  -- ── 2. Descuentos, SIEMPRE recalculados aquí ──────────────────────────────
  IF p_descuento_tipo = 'PORCENTAJE' THEN
    IF p_descuento_valor < 0 OR p_descuento_valor > 100 THEN
      RAISE EXCEPTION 'DESCUENTO_INVALIDO';
    END IF;
    v_desc_manual := ROUND(v_subtotal * p_descuento_valor / 100, 2);
  ELSIF p_descuento_tipo = 'EUROS' THEN
    IF p_descuento_valor < 0 THEN RAISE EXCEPTION 'DESCUENTO_INVALIDO'; END IF;
    v_desc_manual := ROUND(p_descuento_valor, 2);
  END IF;

  -- El código se valida Y se consume aquí dentro, en el mismo UPDATE atómico
  -- que comprueba su límite. Antes el TPV lo validaba en memoria y sumaba el
  -- uso después, en una escritura aparte: dos mostradores canjeando a la vez
  -- un código de un solo uso lo gastaban los dos.
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
    IF v_cod_min IS NOT NULL AND v_subtotal < v_cod_min THEN
      RAISE EXCEPTION 'CODIGO_MINIMO_NO_ALCANZADO:%', v_cod_min;
    END IF;
    v_desc_codigo := CASE
      WHEN v_cod_tipo = 'PORCENTAJE' THEN ROUND(v_subtotal * v_cod_valor / 100, 2)
      ELSE ROUND(v_cod_valor, 2)
    END;
  END IF;

  -- Tope duro: el descuento no puede superar el subtotal. Sin esto un
  -- "descuento" mayor que el importe se convertiría en un total negativo, o
  -- —peor— en un recargo si alguien invirtiera el signo por el camino.
  v_descuento := LEAST(v_subtotal, GREATEST(0, v_desc_manual + v_desc_codigo));

  -- ── 3. Numerar (correlativo por estudio) ──────────────────────────────────
  -- Mismo patrón que `reservar_numero_factura`: lock de transacción por
  -- estudio, para que dos mostradores no saquen el mismo número.
  PERFORM pg_advisory_xact_lock(hashtext(p_studio_id || ':venta_pos'));
  SELECT COALESCE(MAX(v.numero), 0) + 1 INTO v_numero
    FROM public.ventas_pos v WHERE v.studio_id = p_studio_id;

  -- ── 4. Cabecera (con totales provisionales; se cierran tras las líneas) ───
  INSERT INTO public.ventas_pos (
    id, studio_id, socio_id, items, subtotal, descuento, total, metodo_pago,
    notas, realizada_en, numero, estado, pago_estado, pago_actualizado_en,
    base_imponible, iva_total, efectivo_recibido, cambio,
    vendido_por, vendido_por_nombre, caja_id, idempotencia_clave
  ) VALUES (
    p_venta_id, p_studio_id, p_socio_id, '[]'::jsonb, v_subtotal, v_descuento, 0,
    p_metodo_pago, p_notas, now(), v_numero, p_estado_inicial,
    CASE WHEN p_estado_inicial = 'PAGADA' THEN 'PAGADO' ELSE 'PENDIENTE' END,
    now(), 0, 0, p_efectivo_recibido, NULL,
    p_vendido_por, p_vendido_por_nombre, p_caja_id, p_idempotencia_clave
  );

  -- ── 5. Líneas, con el descuento prorrateado ───────────────────────────────
  -- El prorrateo redondea, y redondear seis líneas puede dejar un céntimo
  -- suelto. Ese céntimo se le da a la ÚLTIMA línea (`v_desc_repartido`), para
  -- que Σ líneas == cabecera EXACTAMENTE. Un ticket cuyas líneas no suman el
  -- total es la clase de detalle que hace desconfiar de todo lo demás.
  FOR v_linea IN SELECT * FROM jsonb_array_elements(v_resueltas)
  LOOP
    v_orden    := v_orden + 1;
    v_bruto    := (v_linea->>'bruto')::numeric;
    v_iva      := (v_linea->>'iva')::numeric;
    -- Resuelto en la primera pasada, con la fila ya bloqueada. Si esto se
    -- quedara sin asignar sería NULL, el `IF ... AND v_controla_stock` daría
    -- falso y el stock NO se descontaría nunca — mudo, y en el sitio exacto
    -- donde más caro sale.
    v_controla_stock := COALESCE((v_linea->>'controlaStock')::boolean, false);

    IF v_orden = jsonb_array_length(v_resueltas) THEN
      v_desc_linea := ROUND(v_descuento - v_desc_repartido, 2);
    ELSIF v_subtotal > 0 THEN
      v_desc_linea := ROUND(v_descuento * v_bruto / v_subtotal, 2);
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

    -- Descuento de stock. El `stock IS NOT NULL` deja fuera a los artículos
    -- que no lo controlan; el `>= cantidad` es la red de seguridad por si
    -- algo se colara entre la validación y aquí (no puede, con el FOR UPDATE
    -- cogido, pero un decremento de stock no es sitio para confiar).
    IF (v_linea->>'tipo') = 'PRODUCTO' AND v_controla_stock THEN
      UPDATE public.productos_pos p
         SET stock = p.stock - (v_linea->>'cantidad')::int
       WHERE p.id = (v_linea->>'referenciaId')
         AND p.studio_id = p_studio_id
         AND p.stock IS NOT NULL
         AND p.stock >= (v_linea->>'cantidad')::int;
      -- ⚠️ Sin este GET DIAGNOSTICS el UPDATE fallaba MUDO. La validación de
      -- la primera pasada mira línea a línea, así que dos líneas del MISMO
      -- artículo leen el mismo stock y las dos pasan: con 6 unidades y dos
      -- líneas de 5, la segunda no afectaba a ninguna fila, nadie se enteraba,
      -- y se vendían 10 dejando el stock en 1. La UI fusiona las líneas
      -- iguales, pero la API acepta ambas — y el comentario de aquí prometía
      -- una red de seguridad que no existía.
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

  -- ── 6. Efectivo y vuelta ──────────────────────────────────────────────────
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

  -- ── 7. Caja ───────────────────────────────────────────────────────────────
  -- Solo si la venta ya está cobrada. Una venta PENDIENTE_PAGO todavía no ha
  -- movido dinero: apuntarla ahora inflaría el arqueo con un cobro que aún
  -- puede fallar. La apunta `confirmar_pago_venta_pos` al confirmarse.
  -- La caja tiene que ser de ESTE estudio y estar abierta. La ruta ya la
  -- resuelve así y nunca la toma del body, pero era el único parámetro sin
  -- cotejar y un movimiento en una caja cerrada ensucia un arqueo ya firmado.
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

-- ─── Asignar una venta de mostrador a una ficha, después ─────────────────────
--
-- Alguien pagó una clase de prueba sin ficha. Al rato (o tres semanas después)
-- se apunta. Esto engancha aquella venta a su ficha y deja que la entrega de
-- siempre le cree el bono; los créditos de gamificación también salen de ahí.
--
-- Compare-and-set sobre `socio_id IS NULL`: dos personas del mostrador
-- asignando la misma venta a dos clientas distintas a la vez no pueden ganar
-- las dos. La que llega segunda recibe VENTA_YA_ASIGNADA en vez de pisar a la
-- primera en silencio.
CREATE OR REPLACE FUNCTION public.asignar_venta_pos_a_socia(
  p_studio_id text,
  p_venta_id  text,
  p_socio_id  text
)
RETURNS TABLE (r_aplicado boolean, r_recibo_id text, r_numero int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recibo_id     text;
  v_numero        int;
  v_estado        text;
  v_socio_actual  text;
BEGIN
  -- Alias de tabla en TODAS las columnas: `RETURNS TABLE` expone r_recibo_id y
  -- r_numero como VARIABLES dentro del cuerpo, y sin calificar Postgres las
  -- confunde con las columnas homónimas (42702). Ya pasó tres veces en la fase
  -- de lista de espera.
  SELECT v.recibo_id, v.numero, v.estado, v.socio_id
    INTO v_recibo_id, v_numero, v_estado, v_socio_actual
    FROM public.ventas_pos v
   WHERE v.id = p_venta_id AND v.studio_id = p_studio_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENTA_NO_ENCONTRADA'; END IF;
  IF v_estado <> 'PAGADA' THEN RAISE EXCEPTION 'VENTA_NO_PAGADA'; END IF;
  IF v_socio_actual IS NOT NULL THEN RAISE EXCEPTION 'VENTA_YA_ASIGNADA'; END IF;

  PERFORM 1 FROM public.socios s
   WHERE s.id = p_socio_id AND s.studio_id = p_studio_id AND s.borrado_en IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLIENTA_NO_ENCONTRADA'; END IF;

  UPDATE public.ventas_pos v
     SET socio_id = p_socio_id
   WHERE v.id = p_venta_id AND v.studio_id = p_studio_id AND v.socio_id IS NULL;

  -- El RECIBO también cambia de dueña: si no, el cobro no aparecería nunca en
  -- su ficha ni en su historial de pagos, que es medio motivo de asignarla.
  -- La FACTURA no se toca (ver la cabecera de esta migración): está sellada y
  -- encadenada como simplificada, y reescribir su receptor sería falsear un
  -- documento fiscal ya emitido.
  IF v_recibo_id IS NOT NULL THEN
    UPDATE public.recibos r
       SET socio_id = p_socio_id
     WHERE r.id = v_recibo_id AND r.studio_id = p_studio_id AND r.socio_id IS NULL;
  END IF;

  RETURN QUERY SELECT true, v_recibo_id, v_numero;
  -- `RETURN QUERY` NO termina la función: sin este RETURN seguiría ejecutando.
  RETURN;
END;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- `registrar_venta_pos` conserva su firma, así que sus grants siguen en pie;
-- se reafirman igualmente porque en este repo el pg_default_acl ya ha colado
-- EXECUTE a anon/authenticated tres veces por confiarse (PR #769 y las dos
-- fases de reserva). Y `asignar_venta_pos_a_socia` es NUEVA: nace con EXECUTE
-- concedido DIRECTO a anon y authenticated, que `REVOKE ... FROM PUBLIC` no
-- retira porque no lo heredan de ahí.
REVOKE ALL ON FUNCTION public.registrar_venta_pos(text,text,text,jsonb,text,numeric,text,text,text,uuid,text,numeric,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_venta_pos(text,text,text,jsonb,text,numeric,text,text,text,uuid,text,numeric,text,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.asignar_venta_pos_a_socia(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_venta_pos_a_socia(text,text,text) TO service_role;

COMMENT ON FUNCTION public.asignar_venta_pos_a_socia(text,text,text) IS
  'POS: engancha a una ficha una venta cobrada sin clienta (clase de prueba, compra de mostrador). Compare-and-set sobre socio_id IS NULL. Mueve también el recibo; NUNCA la factura, que ya está sellada como simplificada. Solo service_role: el rol se comprueba en /api/pos/venta/asignar.';


-- ─── Corrección de fidelidad: un acento que se perdió al aplicar a mano ──────
--
-- `retirar_creditos_compra` quedó en producción con 'Devolucion de una compra'
-- mientras el fichero dice 'Devolución'. NO es un comentario interno: es la
-- descripción de la transacción de créditos, la línea que la socia lee en su
-- monedero cuando se le retiran créditos por una devolución.
--
-- Es el TERCER literal ASCII-ificado de esta tanda; la migración
-- `20260907151014` cazó los dos del libro de caja y este se le escapó. Se
-- detectó comparando el md5 de cada `prosrc` (normalizado sin comentarios)
-- contra el de su fichero — nueve de diez coincidían y esta no. Esa
-- comparación debería ser el cierre de cualquier tanda aplicada a mano.

CREATE OR REPLACE FUNCTION public.retirar_creditos_compra(
  p_studio_id text,
  p_socio_id  text,
  p_venta_id  text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_creditos int;
  v_saldo    int;
  v_retirar  int;
BEGIN
  IF p_socio_id IS NULL OR p_venta_id IS NULL THEN RETURN 0; END IF;

  SELECT ct.creditos INTO v_creditos
    FROM public.credit_transactions ct
   WHERE ct.studio_id = p_studio_id AND ct.ref_id = p_venta_id AND ct.tipo = 'GANANCIA'
   LIMIT 1;
  IF v_creditos IS NULL OR v_creditos <= 0 THEN RETURN 0; END IF;

  SELECT mc.saldo INTO v_saldo FROM public.member_credits mc
   WHERE mc.socio_id = p_socio_id AND mc.studio_id = p_studio_id
   FOR UPDATE;
  IF v_saldo IS NULL THEN RETURN 0; END IF;

  v_retirar := LEAST(v_creditos, v_saldo);
  IF v_retirar <= 0 THEN RETURN 0; END IF;

  UPDATE public.member_credits mc
     SET saldo = mc.saldo - v_retirar,
         total_ganado = GREATEST(0, mc.total_ganado - v_retirar),
         actualizado_en = now()
   WHERE mc.socio_id = p_socio_id AND mc.studio_id = p_studio_id;

  INSERT INTO public.credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
  VALUES (
    'ct-posdev-' || substr(md5(p_studio_id || '|' || p_venta_id), 1, 20),
    p_studio_id, p_socio_id, 'CANJE', v_retirar,
    'Devolución de una compra', p_venta_id, now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Se borra la marca de idempotencia para que una compra futura de la misma
  -- venta (no puede pasar hoy) no quede bloqueada, y sobre todo para que el
  -- estado quede coherente: sin créditos otorgados, sin acción registrada.
  DELETE FROM public.reward_actions ra
   WHERE ra.studio_id = p_studio_id AND ra.trigger = 'COMPRA' AND ra.ref_id = p_venta_id;

  RETURN v_retirar;
END;
$$;

REVOKE ALL ON FUNCTION public.retirar_creditos_compra(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retirar_creditos_compra(text,text,text) TO service_role;

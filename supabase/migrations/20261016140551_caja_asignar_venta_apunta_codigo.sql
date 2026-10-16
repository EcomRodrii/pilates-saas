-- Asignar a una alumna una venta de la Caja cobrada sin ficha apunta su uso del código de
-- descuento (16-oct-2026, decisión del fundador).
--
-- «Una vez por alumna» (#2749) vive en `codigos_descuento_consumos`, con su UNIQUE
-- (codigo_id, socio_id): lo apuntan la venta de la Caja a nombre de una alumna
-- (`registrar_venta_pos`) y los cobros online. Pero una venta cobrada SIN alumna no apunta
-- nada (no hay a quién), y al asignársela después (`asignar_venta_pos_a_socia`) tampoco:
-- esa alumna podía volver a usar el mismo código, en la Caja o en su app.
--
-- Lo que decidió el fundador:
--   · La venta y su importe quedan INTACTOS: está cobrada. No se revierte ni se bloquea nada.
--   · Si ella no lo había usado, se apunta su consumo con la venta, con el MISMO índice
--     único y el mismo ON CONFLICT que `registrar_venta_pos`.
--   · Si ya lo había usado, no se aplica otro descuento ni se toca un importe: queda una
--     línea en Actividad (`CODIGO_REPETIDO_AL_ASIGNAR`, origen TENTARE) con la venta, el
--     código, la alumna, el uso anterior (venta de la Caja o pago online) y cuándo fue.
--     Es una INCIDENCIA HISTÓRICA (una venta ya cobrada que se asigna después), no una
--     venta nueva: una venta nueva con un código que ya no vale para ella se sigue
--     rechazando como hoy (CODIGO_YA_USADO_POR_SOCIA), sin cobrar ni apuntar nada.
--
-- Dos a la vez (asignar esta venta y registrar otra con el mismo código para la misma
-- alumna) los ordena el propio UNIQUE: gana quien inserta primero y el otro lo ve. Si gana
-- la venta nueva, la asignación deja su línea; si gana la asignación, la venta nueva se
-- rechaza. Nunca dos consumos. Asignar dos veces la misma venta no deja nada más: la
-- segunda choca con VENTA_YA_ASIGNADA, y la línea de Actividad lleva un id por venta.
--
-- Solo sabe qué código usó una venta desde `ventas_pos.codigo_descuento_id` (migr
-- 20261016115731). Las de antes llevan NULL y no apuntan nada; el 16-oct no había ninguna
-- venta por asignar con descuento. Si la dueña borró el código después de la venta, no
-- hay nada que apuntar y la venta se asigna igual (la columna no lleva FK a propósito y el
-- consumo sí: insertarlo rompería la asignación). El código se lee con FOR KEY SHARE, que
-- frena un borrado simultáneo y no choca con el `UPDATE usos` de la venta o del pago fallido.
--
-- Límite conocido: si el uso anterior es una venta de la Caja aún pendiente de cobro que
-- luego falla, `fallar_pago_venta_pos` suelta ese consumo y la línea de Actividad queda
-- describiendo una repetición que al final no se cobró. Caso raro (dos ventas con el mismo
-- código para la misma alumna en el mismo rato); se deja a la vista en vez de complicarlo.
--
-- La función parte de su definición viva, comprobada por md5 normalizado (espacios en
-- blanco colapsados), y conserva su firma, lo que devuelve y sus permisos.

set lock_timeout = '5s';

do $guardia$
declare
  v_md5 text;
begin
  select md5(regexp_replace(btrim(p.prosrc), '\s+', ' ', 'g')) into v_md5
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'asignar_venta_pos_a_socia';
  -- Dos huellas válidas de la MISMA definición (20260908191048_asignar_venta_pos_bloquea_devuelta):
  --   · 000047d3…, la de producción, que se aplicó sin las líneas de comentario de dentro del
  --     cuerpo (comprobado el 16-oct-2026: quitándoselas al fichero sale exactamente esta);
  --   · 206e60bc…, la del fichero tal cual, que es la que construye una base desde el repo (CI).
  -- La lógica es idéntica; cualquier otra huella es que alguien la ha cambiado.
  if v_md5 is null or v_md5 not in ('000047d30053dfffa93f20490cabd826', '206e60bc46e68d24fa2bf76684588025') then
    raise exception 'asignar_venta_pos_a_socia ha cambiado desde que se escribió esta migración (md5 normalizado %): rehazla partiendo de la definición viva', v_md5;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'ventas_pos' and column_name = 'codigo_descuento_id') then
    raise exception 'falta ventas_pos.codigo_descuento_id (migración 20261016115731): aplícala antes';
  end if;
end
$guardia$;

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
  v_recibo_id       text;
  v_numero          int;
  v_estado          text;
  v_socio_actual    text;
  v_importe_devuelto numeric;
  v_codigo_id       text;
  v_filas           integer;
  v_codigo          text;
  v_nombre          text;
  v_prev_venta      text;
  v_prev_recibo     text;
  v_prev_en         timestamptz;
  v_prev_numero     int;
  v_anterior        text;
  v_hay_prev        boolean := false;
BEGIN
  -- Alias de tabla en TODAS las columnas: `RETURNS TABLE` expone r_recibo_id y
  -- r_numero como VARIABLES dentro del cuerpo, y sin calificar Postgres las
  -- confunde con las columnas homónimas (42702). Ya pasó tres veces en la fase
  -- de lista de espera.
  SELECT v.recibo_id, v.numero, v.estado, v.socio_id, COALESCE(v.importe_devuelto, 0), v.codigo_descuento_id
    INTO v_recibo_id, v_numero, v_estado, v_socio_actual, v_importe_devuelto, v_codigo_id
    FROM public.ventas_pos v
   WHERE v.id = p_venta_id AND v.studio_id = p_studio_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENTA_NO_ENCONTRADA'; END IF;
  IF v_estado <> 'PAGADA' THEN RAISE EXCEPTION 'VENTA_NO_PAGADA'; END IF;
  IF v_socio_actual IS NOT NULL THEN RAISE EXCEPTION 'VENTA_YA_ASIGNADA'; END IF;
  -- 31ª pasada de auditoría: una venta devuelta (entera o en parte) ya
  -- "cerró" su entrega. Asignarla reejecutaría `entregarVentaPOS` y crearía
  -- un bono/créditos reales por dinero que el estudio ya no tiene.
  IF v_importe_devuelto > 0 THEN RAISE EXCEPTION 'VENTA_YA_DEVUELTA'; END IF;

  SELECT s.nombre INTO v_nombre FROM public.socios s
   WHERE s.id = p_socio_id AND s.studio_id = p_studio_id AND s.borrado_en IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLIENTA_NO_ENCONTRADA'; END IF;

  UPDATE public.ventas_pos v
     SET socio_id = p_socio_id
   WHERE v.id = p_venta_id AND v.studio_id = p_studio_id AND v.socio_id IS NULL;

  -- El RECIBO también cambia de dueña: si no, el cobro no aparecería nunca en
  -- su ficha ni en su historial de pagos, que es medio motivo de asignarla.
  -- La FACTURA no se toca (ver la cabecera de la migración original): está
  -- sellada y encadenada como simplificada, y reescribir su receptor sería
  -- falsear un documento fiscal ya emitido.
  IF v_recibo_id IS NOT NULL THEN
    UPDATE public.recibos r
       SET socio_id = p_socio_id
     WHERE r.id = v_recibo_id AND r.studio_id = p_studio_id AND r.socio_id IS NULL;
  END IF;

  -- «Una vez por alumna» (16-oct-2026): la venta usó un código, y ahora tiene dueña. Su uso
  -- se apunta como el de `registrar_venta_pos`: el mismo UNIQUE (codigo_id, socio_id).
  -- Si ya lo había usado, la venta se queda como se cobró (ni se revierte ni se bloquea) y
  -- queda constancia en Actividad, con el uso anterior y cuándo fue.
  IF v_codigo_id IS NOT NULL THEN
    SELECT cd.codigo INTO v_codigo FROM public.codigos_descuento cd
     WHERE cd.id = v_codigo_id AND cd.studio_id = p_studio_id
     FOR KEY SHARE;
    -- Sin código (lo borró la dueña) no hay uso que apuntar: la venta se asigna igual.
    IF FOUND THEN
      -- Dos vueltas como mucho: si el uso que causó el conflicto desaparece antes de
      -- leerlo (un pago de la Caja que falla justo entonces), se vuelve a intentar apuntar.
      FOR i IN 1..2 LOOP
        INSERT INTO public.codigos_descuento_consumos (venta_pos_id, codigo_id, socio_id)
        VALUES (p_venta_id, v_codigo_id, p_socio_id)
        ON CONFLICT (codigo_id, socio_id) DO NOTHING;
        GET DIAGNOSTICS v_filas = ROW_COUNT;
        EXIT WHEN v_filas > 0;
        SELECT c.venta_pos_id, c.recibo_id, c.consumido_en
          INTO v_prev_venta, v_prev_recibo, v_prev_en
          FROM public.codigos_descuento_consumos c
         WHERE c.codigo_id = v_codigo_id AND c.socio_id = p_socio_id;
        IF FOUND THEN v_hay_prev := true; EXIT; END IF;
      END LOOP;
    END IF;

    IF v_hay_prev THEN
      IF v_prev_venta IS NOT NULL THEN
        SELECT v2.numero INTO v_prev_numero FROM public.ventas_pos v2
         WHERE v2.id = v_prev_venta AND v2.studio_id = p_studio_id;
        v_anterior := 'la venta #' || COALESCE(lpad(v_prev_numero::text, 6, '0'), '?') || ' de la Caja';
      ELSIF v_prev_recibo IS NOT NULL THEN
        v_anterior := 'un pago online';
      ELSE
        v_anterior := 'otra compra';
      END IF;

      INSERT INTO public.actividad_reciente (id, studio_id, tipo, texto, socio_id, enlace, origen)
      VALUES (
        'act-codigo-repetido-' || p_venta_id, p_studio_id, 'CODIGO_REPETIDO_AL_ASIGNAR',
        left(
          'Código ' || COALESCE(v_codigo, 'de descuento') || ' repetido: ' || COALESCE(NULLIF(trim(v_nombre), ''), 'la clienta')
          || ' ya lo había usado en ' || v_anterior
          || COALESCE(' el ' || to_char(v_prev_en AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY'), '')
          || '. La venta #' || COALESCE(lpad(v_numero::text, 6, '0'), '?')
          || ', cobrada antes sin ficha, se le ha asignado igual: queda como se cobró, sin otro descuento.',
          500),
        p_socio_id, '/clientas/' || p_socio_id, 'TENTARE'
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END IF;

  RETURN QUERY SELECT true, v_recibo_id, v_numero;
  -- `RETURN QUERY` NO termina la función: sin este RETURN seguiría ejecutando.
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_venta_pos_a_socia(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_venta_pos_a_socia(text,text,text) TO service_role;

COMMENT ON FUNCTION public.asignar_venta_pos_a_socia(text,text,text) IS
  'POS: engancha a una ficha una venta cobrada sin clienta. Compare-and-set sobre socio_id IS NULL. Rechaza VENTA_YA_DEVUELTA si tiene cualquier importe devuelto (31ª pasada de auditoría) — evita reentregar bono/créditos por dinero ya devuelto. Mueve también el recibo; NUNCA la factura. Apunta el uso del código de la venta en codigos_descuento_consumos y, si la clienta ya lo había usado, deja la incidencia en actividad_reciente (CODIGO_REPETIDO_AL_ASIGNAR) sin tocar la venta (16-oct-2026). Solo service_role: el rol se comprueba en /api/pos/venta/asignar.';

-- `origen` TENTARE ya no es solo el piloto automático: también lo que la base de datos
-- apunta sola al detectar una incidencia.
comment on column public.actividad_reciente.origen is
  'EQUIPO: lo hizo una persona del estudio (incluido lo que la propietaria aprobó y Tentare ejecutó). TENTARE: lo hizo o lo apuntó Tentare solo: el piloto automático y las incidencias que detecta la base de datos (CODIGO_REPETIDO_AL_ASIGNAR, de asignar_venta_pos_a_socia). Solo el servidor escribe TENTARE.';

do $permisos$
declare
  f constant regprocedure := 'public.asignar_venta_pos_a_socia(text,text,text)'::regprocedure;
begin
  if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
    raise exception 'asignar_venta_pos_a_socia ejecutable desde el navegador';
  end if;
  if not has_function_privilege('service_role', f, 'EXECUTE') then
    raise exception 'asignar_venta_pos_a_socia sin EXECUTE para service_role: la Caja no podría asignar ventas';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'asignar_venta_pos_a_socia') <> 1 then
    raise exception 'asignar_venta_pos_a_socia tiene más de una firma';
  end if;
end
$permisos$;

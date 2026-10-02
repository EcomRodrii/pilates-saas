-- ─────────────────────────────────────────────────────────────────────────────
-- `recibos`: el navegador escribe SOLO las columnas que necesita, y no toca un
-- recibo devuelto. Segunda mitad de «COBRADO lo escribe el servidor» (PR4,
-- 20261001131500).
--
-- Aquella migración cerró un VALOR (`estado = 'COBRADO'`) con un trigger, porque
-- `estado` sí lo escribe el navegador. Lo dejó dicho: no cerraba las demás columnas
-- de un recibo ni lo que se hiciera sobre uno DEVUELTO. Hasta hoy `authenticated`
-- tenía INSERT y UPDATE de TABLA entera sobre `recibos` (todas sus columnas), así que
-- cualquiera con acceso al panel podía escribir directo, saltándose la pantalla:
--   · la entrega del plan (`entrega_*`) y la conciliación (`conciliado_*`),
--   · la marca de factura pendiente de sellar,
--   · el cargo y la sesión de Stripe (`stripe_payment_intent_id`,
--     `checkout_session_id`, `cobro_mostrador_*`),
--   · lo devuelto, el reembolso y la disputa (`importe_devuelto`, `reembolso_*`,
--     `disputa_*`, `fecha_devolucion`),
--   · y, sobre un recibo devuelto, reabrirlo a pendiente para que el dunning volviera
--     a cobrarlo (un reembolso del estudio que acaba en un segundo cargo).
--
-- Qué hace:
--   1. REVOKE de tabla (INSERT y UPDATE) a `authenticated` + GRANT por columnas. Es
--      el orden que funciona: un REVOKE de columna NO resta de un grant de tabla, y
--      una columna nueva de `recibos` nace NO escribible desde el navegador (no hay
--      grant de tabla que la cubra), que es lo que se quiere por defecto.
--        · INSERT: lo que fija una pantalla al crear un recibo.
--        · UPDATE: `estado` e `intentos_reintento` (remesa SEPA y «Reintentar»).
--      `service_role` conserva sus privilegios de tabla: el servidor no cambia.
--   2. `aplicar_politica_recibos_al_cancelar_cuota` pasa a SECURITY DEFINER. Era el
--      único código que escribía `recibos` «por debajo» con el rol de quien cancela
--      una cuota (INVOKER), y escribe `anulado_en`, `tras_cancelar_cuota` y
--      `proximo_reintento`, que ya no son del navegador. Sigue acotada igual: solo
--      toca los pendientes de LA suscripción que se está cancelando (`new.id`,
--      `new.studio_id`), valores de una fila que la RLS ya dejó actualizar.
--   3. El trigger `trg_recibos_cobrado_solo_servidor` cierra también DEVUELTO:
--        · nacer o pasar a devuelto es del servidor (`marcar-devuelto`, los
--          reembolsos y el webhook de disputas);
--        · y de un devuelto solo se sale con «Reintentar», que es la única vía de
--          pantalla, y solo si lo devolvió el BANCO (nunca se llegó a cobrar): uno
--          reembolsado por el estudio por Stripe o por la caja ya es dinero que va de
--          vuelta a la socia, y abrirlo la volvería a cobrar. «Devuelto por el banco» es el mismo criterio
--          que `esReciboCobrable` (lib/billing/deuda-recibo.ts) y
--          `socio_tiene_impago`: sin reembolso pedido ni importe devuelto.
--        · el dinero de un recibo cobrado o devuelto (importe, método, fechas, lo
--          devuelto, el cargo de Stripe) no cambia desde el navegador. Con los GRANT
--          de arriba el navegador ya no puede tocar esas columnas; esto es la
--          segunda cerradura por si un GRANT futuro las reabre.
--        · un recibo nace PENDIENTE desde el navegador (todas las pantallas lo crean
--          así): FALLIDO alimenta el bloqueo por impago y EN_CURSO simula «enviado al
--          banco», y ninguno de los dos lo pone nadie desde una pantalla;
--        · un recibo EN_CURSO con un cobro en vuelo (cargo o sesión de Stripe, o un
--          reintento programado) no vuelve a PENDIENTE/FALLIDO desde el navegador. Esa
--          guarda ya existía en la pantalla (`sinCobroEnMarcha`, la remesa SEPA), pero
--          la cerradura era solo de pantalla: pasar a PENDIENTE y cambiar
--          `intentos_reintento` cambia la clave de idempotencia del siguiente cobro
--          (`stripe-cobros.ts`) y abre la puerta a un segundo adeudo con el primero
--          todavía en curso.
--
-- Límite conocido, no nuevo: «devuelto por el banco» se reconoce por lo que se ve en
-- el recibo (sin reembolso pedido ni hecho, sin importe devuelto), igual que en
-- `esReciboCobrable`. Una devolución MANUAL de un cobro en efectivo o transferencia
-- (`marcar-devuelto`) deja esos mismos campos, así que no se distingue de un retorno
-- bancario y sigue pudiendo reintentarse como antes. Cerrarlo es decidir qué escribe
-- `marcar-devuelto` para una devolución manual: otra decisión, no un efecto de esta.
--
-- ⚠️ Orden de despliegue: el código que deja de mandar columnas de más (mapeadores
-- estrechos en `lib/supabase-data.ts`) va en el mismo PR y se despliega ANTES de
-- aplicar esto. Aplicarla antes haría que cada alta de recibo del panel mandara
-- columnas sin GRANT (42501) hasta el despliegue.
--
-- Quién sigue pasando, verificado en el catálogo de producción: todo lo que escribe
-- un recibo fuera del navegador usa service-role (`confirmarCobro`, el POS, el
-- webhook, el dunning, las renovaciones, `entregar-plan-comprado`) o una función
-- SECURITY DEFINER (`asignar_venta_pos_a_socia`, `reflejar_devolucion_venta_pos_en_recibo`,
-- `renovar_bono_idempotente`, `eliminar_recibo`). El único código que corría con el
-- rol del usuario era la política de cancelar una cuota (punto 2).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Columnas escribibles desde el navegador. Misma lista que
--    `lib/cobros/recibo-escritura-navegador.ts` (un test las cruza).
revoke insert, update on public.recibos from authenticated;

grant insert (id, studio_id, socio_id, suscripcion_id, concepto, importe, estado, fecha_vencimiento, es_renovacion)
  on public.recibos to authenticated;

grant update (estado, intentos_reintento)
  on public.recibos to authenticated;

-- 2. La política de cancelar una cuota ya no puede correr con el rol del usuario.
--    `search_path` ya está fijado (`public, pg_temp`); SECURITY DEFINER no cambia sus
--    permisos de EXECUTE (es una función de trigger: nadie la llama por RPC).
alter function public.aplicar_politica_recibos_al_cancelar_cuota() security definer;

-- 3. DEVUELTO, en el trigger. SECURITY INVOKER con `search_path` vacío, como antes: no
--    lee ninguna tabla, solo la fila que llega y el rol de la petición. Los mensajes
--    llevan el nombre del trigger delante: `lib/errores.ts` los reconoce por él.
create or replace function public.recibos_cobrado_solo_servidor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  -- El servidor (service-role, o una sesión de mantenimiento de la propia base de
  -- datos) pasa. «Sin sesión» NO es «servidor»: ver `es_llamada_servicio()`.
  if public.es_llamada_servicio() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.estado = 'COBRADO' then
      raise exception 'recibos_cobrado_solo_servidor: un recibo no puede crearse ya cobrado desde el navegador, el cobro lo registra el servidor'
        using errcode = '42501';
    end if;
    if new.estado = 'DEVUELTO' then
      raise exception 'recibos_cobrado_solo_servidor: un recibo no puede crearse ya devuelto desde el navegador, la devolución la registra el servidor'
        using errcode = '42501';
    end if;
    if new.estado is distinct from 'PENDIENTE' then
      raise exception 'recibos_cobrado_solo_servidor: un recibo nace pendiente desde el navegador, el resto de estados los pone el servidor'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.estado is distinct from old.estado then
    if new.estado = 'COBRADO' or old.estado = 'COBRADO' then
      raise exception 'recibos_cobrado_solo_servidor: el estado cobrado de un recibo lo cambia el servidor, no el navegador'
        using errcode = '42501';
    end if;
    if new.estado = 'DEVUELTO' then
      raise exception 'recibos_cobrado_solo_servidor: el estado devuelto de un recibo lo pone el servidor, no el navegador'
        using errcode = '42501';
    end if;
    -- Salir de un devuelto: solo «Reintentar» (→ EN_CURSO) y solo si lo devolvió el
    -- banco. Mismo criterio que `esReciboCobrable`: sin reembolso pedido a Stripe ni
    -- importe devuelto.
    if old.estado = 'DEVUELTO'
       and not (new.estado = 'EN_CURSO'
                and old.reembolso_stripe_id is null
                and old.reembolso_solicitado_en is null
                and coalesce(old.importe_devuelto, 0) < old.importe) then
      raise exception 'recibos_cobrado_solo_servidor: un recibo devuelto solo se reintenta si lo devolvió el banco; uno reembolsado no se reabre desde el navegador'
        using errcode = '42501';
    end if;
    -- Un EN_CURSO con un cobro en vuelo lo cierra el servidor, no se devuelve a pendiente a mano:
    -- las mismas columnas que filtra la remesa SEPA en la pantalla (`COLUMNAS_COBRO_EN_MARCHA`).
    if old.estado = 'EN_CURSO'
       and new.estado in ('PENDIENTE', 'FALLIDO')
       and (old.stripe_payment_intent_id is not null
            or old.checkout_session_id is not null
            or old.cobro_mostrador_pi is not null
            or old.proximo_reintento is not null) then
      raise exception 'recibos_cobrado_solo_servidor: un recibo con un cobro en curso no vuelve a pendiente desde el navegador'
        using errcode = '42501';
    end if;
  end if;

  if old.estado in ('COBRADO', 'DEVUELTO')
     and (new.importe is distinct from old.importe
          or new.metodo_cobro is distinct from old.metodo_cobro
          or new.fecha_cobro is distinct from old.fecha_cobro
          or new.fecha_devolucion is distinct from old.fecha_devolucion
          or new.importe_devuelto is distinct from old.importe_devuelto
          or new.reembolso_stripe_id is distinct from old.reembolso_stripe_id
          or new.reembolso_solicitado_en is distinct from old.reembolso_solicitado_en
          or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id) then
    raise exception 'recibos_cobrado_solo_servidor: el dinero de un recibo cobrado o devuelto (importe, método, fechas, lo devuelto) no cambia desde el navegador'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

-- `create or replace` conserva el ACL de la función, pero se repite a propósito: es una
-- función de TRIGGER (nadie la llama por RPC y disparar un trigger no comprueba EXECUTE),
-- y `pg_default_acl` da EXECUTE directo a authenticated en toda función nueva.
revoke all on function public.recibos_cobrado_solo_servidor() from public, anon, authenticated;

-- 4. Verificación. Un GRANT que no quedó como se escribió, una columna de más (o de
--    menos) o un rol con un privilegio heredado de otro sitio pasarían «en verde» sin
--    proteger nada: se comprueba el estado FINAL de los privilegios, columna a columna.
do $$
declare
  v_ins text[];
  v_upd text[];
  v_ins_esperadas constant text[] := array[
    'concepto', 'es_renovacion', 'estado', 'fecha_vencimiento', 'id', 'importe',
    'socio_id', 'studio_id', 'suscripcion_id'];
  v_upd_esperadas constant text[] := array['estado', 'intentos_reintento'];
begin
  -- `authenticated`: ningún privilegio de tabla de escritura.
  if has_table_privilege('authenticated', 'public.recibos', 'INSERT')
     or has_table_privilege('authenticated', 'public.recibos', 'UPDATE') then
    raise exception 'authenticated sigue con INSERT/UPDATE de tabla sobre recibos';
  end if;

  -- … y exactamente estas columnas (has_column_privilege suma lo de tabla y lo de columna).
  select coalesce(array_agg(a.attname::text order by a.attname), '{}') into v_ins
    from pg_attribute a
   where a.attrelid = 'public.recibos'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', 'public.recibos', a.attname, 'INSERT');
  select coalesce(array_agg(a.attname::text order by a.attname), '{}') into v_upd
    from pg_attribute a
   where a.attrelid = 'public.recibos'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', 'public.recibos', a.attname, 'UPDATE');
  -- Como CONJUNTOS: el orden de un array_agg no es una propiedad de los privilegios.
  if not (v_ins @> v_ins_esperadas and v_ins <@ v_ins_esperadas) then
    raise exception 'columnas INSERT de authenticated en recibos: % (esperadas %)', v_ins, v_ins_esperadas;
  end if;
  if not (v_upd @> v_upd_esperadas and v_upd <@ v_upd_esperadas) then
    raise exception 'columnas UPDATE de authenticated en recibos: % (esperadas %)', v_upd, v_upd_esperadas;
  end if;

  -- `anon` no escribe nada, ni de tabla ni de columna.
  if has_any_column_privilege('anon', 'public.recibos', 'INSERT')
     or has_any_column_privilege('anon', 'public.recibos', 'UPDATE') then
    raise exception 'anon tiene INSERT/UPDATE sobre alguna columna de recibos';
  end if;

  -- El servidor sigue igual.
  if not (has_table_privilege('service_role', 'public.recibos', 'INSERT')
          and has_table_privilege('service_role', 'public.recibos', 'UPDATE')) then
    raise exception 'service_role perdió INSERT/UPDATE sobre recibos';
  end if;

  -- La política de cancelar una cuota corre como su dueño, con `search_path` fijo y sin
  -- EXECUTE para nadie del cliente.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'aplicar_politica_recibos_al_cancelar_cuota'
                    and p.prosecdef
                    and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) then
    raise exception 'aplicar_politica_recibos_al_cancelar_cuota no es SECURITY DEFINER con search_path fijo';
  end if;
  if has_function_privilege('anon', 'public.aplicar_politica_recibos_al_cancelar_cuota()'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.aplicar_politica_recibos_al_cancelar_cuota()'::regprocedure, 'EXECUTE') then
    raise exception 'aplicar_politica_recibos_al_cancelar_cuota es ejecutable por anon/authenticated';
  end if;

  -- El trigger sigue enganchado y su función lleva la guardia de servidor y DEVUELTO.
  -- Frases que SOLO están en las reglas (no en un comentario): la guardia de servidor, y cada
  -- una de las cuatro reglas nuevas.
  if exists (
       select 1 from unnest(array[
         'if public.es_llamada_servicio() then',
         'solo se reintenta si lo devolvió el banco',
         'un recibo nace pendiente desde el navegador',
         'un recibo con un cobro en curso no vuelve a pendiente',
         'el estado devuelto de un recibo lo pone el servidor'
       ]) as frase
       where position(frase in (
         select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'recibos_cobrado_solo_servidor')) = 0) then
    raise exception 'la función de recibos no lleva la guardia de servidor y las reglas de DEVUELTO / EN_CURSO / INSERT';
  end if;
  -- `authenticated` conserva lo que necesita para leer y filtrar (los `.is(col, null)` y el RETURNING
  -- piden SELECT) y no gana DELETE ni TRUNCATE.
  if not has_table_privilege('authenticated', 'public.recibos', 'SELECT')
     or has_table_privilege('authenticated', 'public.recibos', 'DELETE')
     or has_table_privilege('authenticated', 'public.recibos', 'TRUNCATE') then
    raise exception 'authenticated debe tener SELECT y no DELETE ni TRUNCATE sobre recibos';
  end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'recibos' and not t.tgisinternal
                    and t.tgname = 'trg_recibos_cobrado_solo_servidor'
                    and pg_get_triggerdef(t.oid) like '%BEFORE INSERT OR UPDATE%') then
    raise exception 'el trigger de recibos no está enganchado antes de INSERT/UPDATE';
  end if;
  if has_function_privilege('anon', 'public.recibos_cobrado_solo_servidor()'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.recibos_cobrado_solo_servidor()'::regprocedure, 'EXECUTE') then
    raise exception 'la función de trigger de recibos es ejecutable por anon/authenticated';
  end if;
end $$;

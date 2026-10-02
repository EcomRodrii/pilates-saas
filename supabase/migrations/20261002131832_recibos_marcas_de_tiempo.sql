-- La hora de cada cobro, cuándo se envió un recibo al banco y qué día de cargo se le
-- pidió (2-oct-2026, decisión del fundador en el rediseño de Cobros: «guardarlos»).
--
-- Hasta hoy no se sabía ninguna de las tres cosas: `fecha_cobro` es solo un día, y
-- de una remesa no quedaba ni cuándo se preparó ni qué día de cargo llevaba el
-- fichero. La pantalla nueva las enseña («Fichero preparado el 29 sep · cargo
-- pedido para el 4 oct», la hora de cada cobro en «Lo que he cobrado»), así que
-- tienen que ser ciertas:
--
--   · `cobrado_en`: la hora del cobro SOLO cuando el registro ocurre en el momento
--     del pago (mostrador, TPV, tarjeta guardada, webhook). Un cobro conciliado
--     tarde, una domiciliación o una transferencia (se marca cuando se ve, no
--     cuando llega) no la tienen: NULL, y la pantalla no inventa nada.
--   · `enviado_al_banco_en`: cuándo entró en EN_CURSO (remesa preparada o adeudo
--     de Stripe enviado). Se conserva como historia al salir a COBRADO, DEVUELTO o
--     FALLIDO; si vuelve a PENDIENTE («No llegó a ir al banco», deshacer la
--     remesa, un adeudo que falló), se vacía.
--   · `cargo_pedido_para`: el día de cargo que se pide en la remesa (el que va en
--     el fichero XML): hoy en Madrid + 5. Lo fija la BASE DE DATOS y el navegador
--     lo lee del propio UPDATE para ponerlo en el fichero: así no dependen del
--     reloj del dispositivo, y pantalla y fichero dicen el mismo día. NULL en un
--     adeudo de Stripe (lo decide Stripe).
--
-- Las escribe UN trigger y nadie más: ningún GRANT, así que nacen no escribibles
-- desde el navegador (GRANT por columnas de `recibos`, migr 20261002094636). Un
-- trigger puede escribirlas igual: Postgres solo comprueba las columnas del SET.
-- `OF estado`: todas las transiciones llevan `estado` en el SET, y el relleno de
-- abajo no lo dispara.

alter table public.recibos
  add column if not exists cobrado_en timestamptz,
  add column if not exists enviado_al_banco_en timestamptz,
  add column if not exists cargo_pedido_para date;

comment on column public.recibos.cobrado_en is
  'Hora del cobro, solo si se registró en el momento del pago (mostrador, TPV, tarjeta guardada, webhook). NULL = no se sabe. La escribe trg_recibos_marcas_de_tiempo.';
comment on column public.recibos.enviado_al_banco_en is
  'Cuándo entró en EN_CURSO (remesa preparada o adeudo de Stripe). Se vacía si vuelve a PENDIENTE. La escribe trg_recibos_marcas_de_tiempo.';
comment on column public.recibos.cargo_pedido_para is
  'Día de cargo pedido al banco en la remesa (el del fichero XML): hoy en Madrid + 5. NULL en adeudos de Stripe. La escribe trg_recibos_marcas_de_tiempo.';

-- SECURITY INVOKER con `search_path` vacío: no lee ninguna tabla, solo la fila que
-- llega, `now()` y la zona del estudio ('Europe/Madrid', la de `TZ_ESTUDIO`).
create or replace function public.recibos_marcas_de_tiempo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_hora timestamptz;
begin
  -- 1. La hora del cobro. Solo si el registro es del momento del pago: hoy en Madrid,
  --    ni domiciliación ni transferencia, y no el conciliador (que llega tarde).
  if new.estado = 'COBRADO' then
    v_hora := case
      when new.fecha_cobro = v_hoy
       and coalesce(new.metodo_cobro, '') not in ('SEPA', 'TRANSFERENCIA')
       and new.conciliado_por is distinct from 'conciliador'
      then now()
    end;
    if tg_op = 'INSERT' then
      -- Ya cobrado al nacer (TPV, plan comprado): la hora, salvo que el servidor la traiga
      -- (una restauración conserva la suya).
      if new.cobrado_en is null then
        new.cobrado_en := v_hora;
      end if;
    elsif old.estado is distinct from 'COBRADO' then
      -- Entra en COBRADO. Si quien escribe trae la hora (solo puede el servidor), manda la
      -- suya. Si es un cobro NUEVO (sin hora, o con otro día, otra conciliación u otro
      -- cargo), la regla. Si no —el mismo cargo que vuelve, p. ej. un reembolso que
      -- falló—, se conserva la que tenía.
      if new.cobrado_en is not distinct from old.cobrado_en
         and (old.cobrado_en is null
              or new.fecha_cobro is distinct from old.fecha_cobro
              or new.conciliado_en is distinct from old.conciliado_en
              or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id) then
        new.cobrado_en := v_hora;
      end if;
    end if;
  end if;

  -- 2. El envío al banco y el día de cargo pedido.
  if new.estado = 'EN_CURSO' and (tg_op = 'INSERT' or old.estado is distinct from 'EN_CURSO') then
    new.enviado_al_banco_en := now();
    -- Un adeudo de Stripe lleva su cargo en la misma fila: el día lo decide Stripe.
    new.cargo_pedido_para := case
      when new.stripe_payment_intent_id is null
       and new.checkout_session_id is null
       and new.cobro_mostrador_pi is null
      then v_hoy + 5
    end;
  elsif tg_op = 'UPDATE' and old.estado = 'EN_CURSO' and new.estado = 'PENDIENTE' then
    -- No llegó a ir al banco (o se deshizo la remesa, o falló el adeudo): no hubo envío.
    new.enviado_al_banco_en := null;
    new.cargo_pedido_para := null;
  end if;

  return new;
end;
$fn$;

-- `pg_default_acl` da EXECUTE directo a anon y authenticated en toda función nueva:
-- revocar PUBLIC no basta. Es una función de TRIGGER (nadie la llama por RPC).
revoke all on function public.recibos_marcas_de_tiempo() from public, anon, authenticated;

drop trigger if exists trg_recibos_marcas_de_tiempo on public.recibos;
-- Después de `trg_recibos_cobrado_solo_servidor` (los BEFORE disparan por orden
-- alfabético): lo que la guardia rechaza no llega a calcularse.
create trigger trg_recibos_marcas_de_tiempo
  before insert or update of estado on public.recibos
  for each row execute function public.recibos_marcas_de_tiempo();

-- Relleno de la hora de lo ya cobrado: `conciliado_en` (desde el 2-sep) es el instante
-- que el trigger habría guardado, con la misma regla. No dispara el trigger nuevo (no
-- toca `estado`) y se puede repetir sin efecto. Lo de antes de `conciliado_en`, y las
-- ventas del TPV y compras web sin él, se quedan sin hora.
update public.recibos r
   set cobrado_en = r.conciliado_en
 where r.cobrado_en is null
   and r.conciliado_en is not null
   and r.estado in ('COBRADO', 'DEVUELTO')
   and r.conciliado_por in ('manual', 'webhook', 'tpv')
   and coalesce(r.metodo_cobro, '') not in ('SEPA', 'TRANSFERENCIA')
   and (r.conciliado_en at time zone 'Europe/Madrid')::date = r.fecha_cobro;

-- Verificación: si algo no quedó como se espera, la migración entera se deshace.
do $$
declare
  v_ins text[];
  v_upd text[];
  v_ins_esperadas constant text[] := array[
    'concepto', 'es_renovacion', 'estado', 'fecha_vencimiento', 'id', 'importe',
    'socio_id', 'studio_id', 'suscripcion_id'];
  v_upd_esperadas constant text[] := array['estado', 'intentos_reintento'];
  v_col text;
  v_triggers text[];
begin
  -- Las tres columnas, con su tipo.
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'recibos'
         and ((column_name = 'cobrado_en' and data_type = 'timestamp with time zone')
           or (column_name = 'enviado_al_banco_en' and data_type = 'timestamp with time zone')
           or (column_name = 'cargo_pedido_para' and data_type = 'date'))) <> 3 then
    raise exception 'faltan las columnas nuevas de recibos, o no tienen su tipo';
  end if;

  -- El navegador no las escribe…
  foreach v_col in array array['cobrado_en', 'enviado_al_banco_en', 'cargo_pedido_para'] loop
    if has_column_privilege('authenticated', 'public.recibos', v_col, 'INSERT')
       or has_column_privilege('authenticated', 'public.recibos', v_col, 'UPDATE')
       or has_column_privilege('anon', 'public.recibos', v_col, 'INSERT')
       or has_column_privilege('anon', 'public.recibos', v_col, 'UPDATE') then
      raise exception 'el navegador puede escribir recibos.%', v_col;
    end if;
  end loop;
  -- … y lo que sí escribe sigue siendo exactamente lo de antes (como CONJUNTOS).
  select coalesce(array_agg(a.attname::text order by a.attname), '{}') into v_ins
    from pg_attribute a
   where a.attrelid = 'public.recibos'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', 'public.recibos', a.attname, 'INSERT');
  select coalesce(array_agg(a.attname::text order by a.attname), '{}') into v_upd
    from pg_attribute a
   where a.attrelid = 'public.recibos'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', 'public.recibos', a.attname, 'UPDATE');
  if not (v_ins @> v_ins_esperadas and v_ins <@ v_ins_esperadas) then
    raise exception 'columnas INSERT de authenticated en recibos: % (esperadas %)', v_ins, v_ins_esperadas;
  end if;
  if not (v_upd @> v_upd_esperadas and v_upd <@ v_upd_esperadas) then
    raise exception 'columnas UPDATE de authenticated en recibos: % (esperadas %)', v_upd, v_upd_esperadas;
  end if;

  -- La función: INVOKER, `search_path` vacío y sin EXECUTE para nadie del cliente.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'recibos_marcas_de_tiempo'
                    and not p.prosecdef and p.proconfig = array['search_path=""']) then
    raise exception 'recibos_marcas_de_tiempo no es SECURITY INVOKER con search_path vacío';
  end if;
  if has_function_privilege('anon', 'public.recibos_marcas_de_tiempo()'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.recibos_marcas_de_tiempo()'::regprocedure, 'EXECUTE') then
    raise exception 'recibos_marcas_de_tiempo es ejecutable por anon/authenticated';
  end if;

  -- El trigger, enganchado a `estado` y DESPUÉS de la guardia de servidor.
  select array_agg(t.tgname::text order by t.tgname) into v_triggers
    from pg_trigger t
   where t.tgrelid = 'public.recibos'::regclass and not t.tgisinternal
     and t.tgname in ('trg_recibos_cobrado_solo_servidor', 'trg_recibos_marcas_de_tiempo');
  if v_triggers is distinct from array['trg_recibos_cobrado_solo_servidor', 'trg_recibos_marcas_de_tiempo'] then
    raise exception 'los triggers de recibos no están los dos, o no en este orden: %', v_triggers;
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.recibos'::regclass and t.tgname = 'trg_recibos_marcas_de_tiempo'
                    and pg_get_triggerdef(t.oid) like '%BEFORE INSERT OR UPDATE OF estado ON public.recibos FOR EACH ROW%') then
    raise exception 'trg_recibos_marcas_de_tiempo no es BEFORE INSERT OR UPDATE OF estado, por fila';
  end if;
end $$;

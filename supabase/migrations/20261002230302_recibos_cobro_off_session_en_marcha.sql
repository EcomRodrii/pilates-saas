-- Cobro con tarjeta o domiciliación guardada EN MARCHA (2-oct-2026).
--
-- `cobrarReciboOffSession` crea y confirma el cargo en la MISMA llamada a Stripe
-- (`confirm: true`), sin reservar nada antes. Si entre leer el recibo y cobrarlo
-- alguien lo daba por cobrado por otra puerta (el cobro a mano, «el banco lo ha
-- cobrado», un movimiento del fichero del banco), entraban dos cobros reales, y
-- solo se veía después.
--
-- Ahora el servidor RESERVA el recibo con compare-and-set justo antes de llamar a
-- Stripe (estas dos columnas, con la Idempotency-Key del intento como valor). Con
-- la marca puesta, ni el cobro a mano, ni el banco, ni un movimiento externo, ni
-- la remesa, ni el datáfono, ni un enlace de pago nuevo cobran el recibo. La quita
-- quien resuelve el cargo (COBRADO, EN_CURSO con su adeudo, o soltarla tras un
-- rechazo); las que se quedan colgadas las resuelve el conciliador preguntando a
-- Stripe. Nunca caduca a ciegas. Ver lib/billing/cobro-off-session-marca.ts.
--
-- Solo la escribe el servidor: la columna nace sin GRANT de escritura para
-- authenticated (lib/cobros/recibo-escritura-navegador.ts), y el trigger del
-- navegador impide además cambiar el estado de un recibo con la marca puesta (una
-- pestaña con el panel anterior no conoce la columna y podría mandarlo a la remesa).
--
-- `recibos_cobrado_solo_servidor`: mismo cuerpo que la función VIVA
-- (`pg_get_functiondef`, comprobado el 2-oct, igual que la de
-- 20261002105604_recibos_devuelto_no_sale_del_navegador.sql) salvo la regla nueva
-- y la columna nueva en la guarda de EN_CURSO, que lista las mismas columnas que
-- `COLUMNAS_COBRO_EN_MARCHA`.

alter table public.recibos
  add column if not exists cobro_off_session_clave text,
  add column if not exists cobro_off_session_desde timestamptz;

alter table public.recibos drop constraint if exists recibos_cobro_off_session_coherente;
alter table public.recibos add constraint recibos_cobro_off_session_coherente
  check ((cobro_off_session_clave is null) = (cobro_off_session_desde is null));

comment on column public.recibos.cobro_off_session_clave is
  'Idempotency-Key del cobro con tarjeta o domiciliación guardada EN MARCHA (offsession-cobro-<recibo>-i<n>). La pone cobrarReciboOffSession con compare-and-set antes de llamar a Stripe y se quita al resolverse. Con ella puesta ninguna puerta a mano cobra el recibo.';
comment on column public.recibos.cobro_off_session_desde is
  'Cuándo se reservó (primer uso de la clave). El mismo intento solo vuelve a entrar los primeros minutos; después decide el conciliador consultando a Stripe.';

-- El conciliador busca las colgadas. Parcial: casi todas las filas la tienen a null.
create index if not exists recibos_cobro_off_session_desde_idx
  on public.recibos (cobro_off_session_desde)
  where cobro_off_session_clave is not null;

-- La marca solo vive en un recibo que se puede cobrar: al salir de PENDIENTE/FALLIDO
-- se quita sola, la quite o no quien cambia el estado (anular, cancelar la cuota…).
create or replace function public.recibos_soltar_cobro_off_session()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  if new.estado not in ('PENDIENTE', 'FALLIDO') then
    new.cobro_off_session_clave := null;
    new.cobro_off_session_desde := null;
  end if;
  return new;
end;
$fn$;

revoke all on function public.recibos_soltar_cobro_off_session() from public, anon, authenticated;

drop trigger if exists trg_recibos_soltar_cobro_off_session on public.recibos;
create trigger trg_recibos_soltar_cobro_off_session
  before update of estado on public.recibos
  for each row
  when (old.estado is distinct from new.estado)
  execute function public.recibos_soltar_cobro_off_session();

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
    -- Un devuelto no cambia de estado desde el navegador: volver a pasarlo por el banco
    -- (`reintentarPorElBanco`), cobrarlo o reembolsarlo lo hace el servidor.
    if old.estado = 'DEVUELTO' then
      raise exception 'recibos_cobrado_solo_servidor: un recibo devuelto no cambia de estado desde el navegador; volver a pasarlo por el banco lo hace el servidor'
        using errcode = '42501';
    end if;
    -- Se está cobrando ahora con su tarjeta o domiciliación guardada: lo resuelve el
    -- servidor (una pestaña con el panel anterior no conoce la marca y podría
    -- mandarlo a la remesa encima del cargo).
    if old.cobro_off_session_clave is not null then
      raise exception 'recibos_cobrado_solo_servidor: un recibo que se está cobrando con su tarjeta o domiciliación guardada no cambia de estado desde el navegador'
        using errcode = '42501';
    end if;
    -- Un EN_CURSO con un cobro en vuelo lo cierra el servidor, no se devuelve a pendiente a mano:
    -- las mismas columnas que filtra la remesa SEPA en la pantalla (`COLUMNAS_COBRO_EN_MARCHA`).
    if old.estado = 'EN_CURSO'
       and new.estado in ('PENDIENTE', 'FALLIDO')
       and (old.stripe_payment_intent_id is not null
            or old.checkout_session_id is not null
            or old.cobro_mostrador_pi is not null
            or old.proximo_reintento is not null
            or old.cobro_off_session_clave is not null) then
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

revoke all on function public.recibos_cobrado_solo_servidor() from public, anon, authenticated;

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
declare
  v_src text;
begin
  -- Las dos columnas, con su tipo.
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'recibos'
         and ((column_name = 'cobro_off_session_clave' and data_type = 'text')
           or (column_name = 'cobro_off_session_desde' and data_type = 'timestamp with time zone'))) <> 2 then
    raise exception 'faltan las columnas de la marca de cobro en marcha, o no tienen su tipo';
  end if;
  -- Solo las escribe el servidor.
  if has_column_privilege('authenticated', 'public.recibos', 'cobro_off_session_clave', 'UPDATE')
     or has_column_privilege('authenticated', 'public.recibos', 'cobro_off_session_clave', 'INSERT')
     or has_column_privilege('authenticated', 'public.recibos', 'cobro_off_session_desde', 'UPDATE')
     or has_column_privilege('authenticated', 'public.recibos', 'cobro_off_session_desde', 'INSERT')
     or has_column_privilege('anon', 'public.recibos', 'cobro_off_session_clave', 'UPDATE')
     or has_column_privilege('anon', 'public.recibos', 'cobro_off_session_desde', 'UPDATE') then
    raise exception 'el navegador puede escribir la marca de cobro en marcha';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recibos_cobro_off_session_coherente'
                  and conrelid = 'public.recibos'::regclass) then
    raise exception 'falta el CHECK de coherencia de la marca';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'recibos_cobro_off_session_desde_idx') then
    raise exception 'falta el índice parcial de la marca';
  end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'recibos' and not t.tgisinternal
                    and t.tgname = 'trg_recibos_soltar_cobro_off_session'
                    and pg_get_triggerdef(t.oid) like '%BEFORE UPDATE OF estado%') then
    raise exception 'el trigger que suelta la marca no está enganchado antes de UPDATE OF estado';
  end if;

  -- El trigger del navegador: la regla nueva, y las de siempre.
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'recibos_cobrado_solo_servidor';
  if exists (
       select 1 from unnest(array[
         'if public.es_llamada_servicio() then',
         'un recibo no puede crearse ya cobrado desde el navegador',
         'un recibo no puede crearse ya devuelto desde el navegador',
         'un recibo nace pendiente desde el navegador',
         'el estado cobrado de un recibo lo cambia el servidor',
         'el estado devuelto de un recibo lo pone el servidor',
         'un recibo devuelto no cambia de estado desde el navegador',
         'un recibo que se está cobrando con su tarjeta o domiciliación guardada no cambia de estado',
         'or old.cobro_off_session_clave is not null',
         'un recibo con un cobro en curso no vuelve a pendiente',
         'el dinero de un recibo cobrado o devuelto'
       ]) as frase
       where position(frase in v_src) = 0) then
    raise exception 'a la función de recibos le falta alguna de sus reglas';
  end if;

  -- Las dos funciones: INVOKER, `search_path` vacío y sin EXECUTE para el cliente.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('recibos_cobrado_solo_servidor', 'recibos_soltar_cobro_off_session')
                and (p.prosecdef or p.proconfig is distinct from array['search_path=""'])) then
    raise exception 'una función de trigger de recibos cambió de SECURITY INVOKER o de search_path';
  end if;
  if has_function_privilege('anon', 'public.recibos_cobrado_solo_servidor()'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.recibos_cobrado_solo_servidor()'::regprocedure, 'EXECUTE')
     or has_function_privilege('anon', 'public.recibos_soltar_cobro_off_session()'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.recibos_soltar_cobro_off_session()'::regprocedure, 'EXECUTE') then
    raise exception 'una función de trigger de recibos es ejecutable por anon/authenticated';
  end if;
end $$;

-- Un recibo DEVUELTO ya no sale de ese estado desde el navegador (2-oct-2026).
--
-- Hasta hoy el trigger dejaba una salida: «Reintentar» lo ponía EN_CURSO («Enviado
-- al banco») desde el navegador si lo había devuelto el banco. No mandaba nada a
-- ningún banco, y de ahí salían los recibos «en el banco» que no fueron a ninguna
-- remesa (darlos por cobrados inventaba un ingreso y una factura). Desde #2468
-- «Reintentar por el banco» lo hace el servidor (`reintentarPorElBanco`: vuelve a
-- PENDIENTE para la próxima remesa), así que la pantalla ya no usa esa salida: solo
-- una pestaña abierta con el panel anterior.
--
-- Ningún otro camino del navegador sale de un DEVUELTO:
--   · la remesa SEPA solo pasa PENDIENTE → EN_CURSO, y lo deshace EN_CURSO → PENDIENTE;
--   · la política al cancelar una cuota solo toca PENDIENTE (y es SECURITY DEFINER);
--   · cobrarlo, reembolsarlo o volver a pasarlo por el banco va por el servidor.
--
-- Mismo cuerpo que la función VIVA (`pg_get_functiondef`, comprobado el 2-oct) salvo
-- el bloque de salida de DEVUELTO. El resto de reglas no cambia.

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
-- función de TRIGGER (nadie la llama por RPC) y `pg_default_acl` da EXECUTE directo a
-- authenticated en toda función nueva.
revoke all on function public.recibos_cobrado_solo_servidor() from public, anon, authenticated;

-- Verificación: si algo no quedó como se espera, la migración entera se deshace.
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'recibos_cobrado_solo_servidor';

  -- La regla nueva está, y la salida vieja ya no.
  if position('un recibo devuelto no cambia de estado desde el navegador' in v_src) = 0 then
    raise exception 'la función de recibos no lleva la regla nueva de DEVUELTO';
  end if;
  if position('solo se reintenta si lo devolvió el banco' in v_src) > 0 then
    raise exception 'la función de recibos todavía deja reintentar un devuelto desde el navegador';
  end if;
  -- Y las demás reglas siguen (frases que solo están en las reglas, no en un comentario).
  if exists (
       select 1 from unnest(array[
         'if public.es_llamada_servicio() then',
         'un recibo no puede crearse ya cobrado desde el navegador',
         'un recibo no puede crearse ya devuelto desde el navegador',
         'un recibo nace pendiente desde el navegador',
         'el estado cobrado de un recibo lo cambia el servidor',
         'el estado devuelto de un recibo lo pone el servidor',
         'un recibo con un cobro en curso no vuelve a pendiente',
         'el dinero de un recibo cobrado o devuelto'
       ]) as frase
       where position(frase in v_src) = 0) then
    raise exception 'a la función de recibos le falta alguna de sus reglas';
  end if;
  -- Sigue siendo INVOKER con `search_path` vacío.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'recibos_cobrado_solo_servidor'
                and (p.prosecdef or p.proconfig is distinct from array['search_path=""'])) then
    raise exception 'la función de recibos cambió de SECURITY INVOKER o de search_path';
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

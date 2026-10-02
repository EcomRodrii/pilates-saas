-- Motor de derechos: anular una recuperación por el servidor, no por el navegador (fase A de dos).
--
-- Hoy el personal puede escribir en `recuperaciones` DIRECTAMENTE (RLS de INSERT, UPDATE y DELETE con `puede_gestionar_clientas()`):
-- el panel anula una recuperación con un UPDATE suelto, y quien llamara a la API con esa sesión podría crear una saltándose el
-- tope y la política de caducidad del estudio (`crear_recuperacion`), o reabrir una ya usada. Todas las escrituras legítimas ya
-- pasan por funciones `SECURITY DEFINER` (`crear_recuperacion`, `ampliar_caducidades`, `cancelar_reserva_plaza`, `liberar_derecho`)
-- y por el servidor; la única que no era una RPC era ANULAR.
--
--  · `anular_recuperacion(id, estudio)` anula una recuperación DISPONIBLE (no una ya usada: rompería el vínculo con su reserva)
--    comprobando el estudio y `puede_gestionar_clientas()`, el mismo predicado de la política de hoy. Devuelve si la anuló.
--  · El ledger distingue ANULACION_RECUPERACION de CADUCIDAD_RECUPERACION (antes una anulación a mano se anotaba como caducidad).
--
-- Fase B, DESPUÉS de desplegar el código que ya usa la RPC: retirar INSERT/UPDATE/DELETE de `authenticated` sobre `recuperaciones`.
-- No va en esta migración a propósito: con el código viejo en producción, retirarlos rompería «Anular» hasta que se despliegue.

-- ── Ledger: la anulación tiene nombre propio ─────────────────────────────────
alter table public.movimientos_derecho drop constraint if exists movimientos_derecho_tipo_check;
alter table public.movimientos_derecho add constraint movimientos_derecho_tipo_check check (tipo in (
  'APERTURA', 'COMPRA', 'RENOVACION', 'CONSUMO_BONO', 'DEVOLUCION_BONO', 'REVERSION_VENTA',
  'AJUSTE_SIN_CONTEXTO', 'USO_CUOTA', 'SIN_COBERTURA',
  'CONCESION_RECUPERACION', 'USO_RECUPERACION', 'RESTITUCION_RECUPERACION', 'CADUCIDAD_RECUPERACION', 'ANULACION_RECUPERACION'
));

-- (Mismo trigger que en 20261002133851 con una rama más: ANULADA → ANULACION_RECUPERACION.)
create or replace function public.ledger_recuperacion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viejo int;
  v_nuevo int;
  v_tipo text;
begin
  begin
    if tg_op = 'INSERT' then
      insert into public.movimientos_derecho
        (studio_id, socio_id, derecho_tipo, derecho_id, tipo, delta, saldo_despues, reserva_id, actor_tipo, actor_id, motivo)
      values
        (new.studio_id, new.socio_id, 'RECUPERACION', new.id, 'CONCESION_RECUPERACION', 1, 1, new.origen_reserva_id,
         case when public.es_llamada_servicio() then 'sistema' else 'staff' end, auth.uid()::text, new.motivo);
      if new.estado is distinct from 'DISPONIBLE' then
        insert into public.movimientos_derecho
          (studio_id, socio_id, derecho_tipo, derecho_id, tipo, delta, saldo_despues, reserva_id, actor_tipo, actor_id)
        values
          (new.studio_id, new.socio_id, 'RECUPERACION', new.id,
           case when new.estado = 'USADA' then 'USO_RECUPERACION' else 'CADUCIDAD_RECUPERACION' end,
           -1, 0, new.usada_en_reserva_id,
           case when public.es_llamada_servicio() then 'sistema' else 'staff' end, auth.uid()::text);
      end if;
      return new;
    end if;

    if new.estado is not distinct from old.estado then return new; end if;
    v_viejo := case when old.estado = 'DISPONIBLE' then 1 else 0 end;
    v_nuevo := case when new.estado = 'DISPONIBLE' then 1 else 0 end;
    if v_viejo = v_nuevo then return new; end if;

    v_tipo := case
      when v_nuevo < v_viejo and new.estado = 'USADA' then 'USO_RECUPERACION'
      when v_nuevo < v_viejo and new.estado = 'ANULADA' then 'ANULACION_RECUPERACION'
      when v_nuevo < v_viejo then 'CADUCIDAD_RECUPERACION'
      when old.estado = 'USADA' then 'RESTITUCION_RECUPERACION'
      else 'AJUSTE_SIN_CONTEXTO'
    end;

    insert into public.movimientos_derecho
      (studio_id, socio_id, derecho_tipo, derecho_id, tipo, delta, saldo_despues, reserva_id, actor_tipo, actor_id)
    values
      (new.studio_id, new.socio_id, 'RECUPERACION', new.id, v_tipo, v_nuevo - v_viejo, v_nuevo,
       case when v_tipo = 'RESTITUCION_RECUPERACION' then old.usada_en_reserva_id else new.usada_en_reserva_id end,
       case when public.es_llamada_servicio() then 'sistema' else 'staff' end, auth.uid()::text);
  exception when others then
    raise warning 'ledger_recuperacion: % (recuperacion %)', sqlerrm, new.id;
  end;
  return new;
end;
$fn$;

revoke all on function public.ledger_recuperacion() from public, anon, authenticated;

-- ── anular_recuperacion ──────────────────────────────────────────────────────
create or replace function public.anular_recuperacion(p_id text, p_studio_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id text;
begin
  if not public.es_llamada_servicio() and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;
  if not public.es_llamada_servicio() and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  update public.recuperaciones as rc
     set estado = 'ANULADA'
   where rc.id = p_id and rc.studio_id = p_studio_id and rc.estado = 'DISPONIBLE'
  returning rc.id into v_id;

  return v_id is not null;
end;
$function$;

revoke all on function public.anular_recuperacion(text, text) from public, anon;
grant execute on function public.anular_recuperacion(text, text) to authenticated, service_role;

comment on function public.anular_recuperacion(text, text) is
  'Anula una recuperación DISPONIBLE del estudio (no una ya usada). Comprueba estudio y puede_gestionar_clientas(). Devuelve si la anuló. Ver 20261002144936.';

do $$
begin
  if has_function_privilege('anon', 'public.anular_recuperacion(text,text)'::regprocedure, 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.anular_recuperacion(text,text)'::regprocedure, 'EXECUTE')
     or not has_function_privilege('service_role', 'public.anular_recuperacion(text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'anular_recuperacion: permisos inesperados (anon no; el panel y el servidor sí)';
  end if;
  if has_function_privilege('anon', 'public.ledger_recuperacion()'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ledger_recuperacion()'::regprocedure, 'EXECUTE') then
    raise exception 'la función de trigger del ledger es ejecutable por anon/authenticated';
  end if;
  if position('ANULACION_RECUPERACION' in (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ledger_recuperacion')) = 0 then
    raise exception 'ledger_recuperacion no distingue la anulación';
  end if;
end $$;

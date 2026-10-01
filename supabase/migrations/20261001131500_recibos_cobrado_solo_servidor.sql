-- ─────────────────────────────────────────────────────────────────────────────
-- PR4 del dueño único de «recibo cobrado»: COBRADO lo escribe el SERVIDOR.
--
-- `confirmarCobro` (lib/billing/confirmar-cobro.ts) es el único sitio que sabe
-- cerrar un cobro bien: compare-and-set sobre el estado, la guardia de las
-- penalizaciones anuladas, la renovación del plan, la factura sellada, el apunte
-- de caja y los créditos. Desde el PR3 (#2399) el «marcar cobrado» del panel pasa
-- por él, y el navegador ya no escribe `COBRADO`.
--
-- Aquí se cierra lo mismo en la base de datos, que es la cerradura real: a quien
-- no es el servidor (`es_llamada_servicio()` falso) el estado COBRADO le queda
-- vedado. Es un trigger y no un REVOKE de columna porque `estado` SÍ lo escribe el
-- navegador (PENDIENTE ↔ EN_CURSO al preparar una remesa SEPA, y al reintentar):
-- lo que hay que prohibir es un VALOR, no una columna. Y un REVOKE de columna no
-- resta de un grant de tabla.
--
-- Qué prohíbe, para quien NO es el servidor:
--   1. Crear un recibo ya cobrado.
--   2. Pasar un recibo a COBRADO.
--   3. Sacar un recibo de COBRADO (devolverlo, reabrirlo): `marcar-devuelto`,
--      los reembolsos y el webhook de disputas lo hacen por el servidor.
--   4. Cambiar lo que hace «verdadero» un recibo ya cobrado: importe, método,
--      fecha del cobro y el cargo de Stripe.
-- Lo que sigue pudiendo hacer el navegador: crear recibos PENDIENTE y editarlos
-- mientras no son dinero cobrado.
--
-- Alcance, dicho a las claras: NO cierra las demás columnas de un recibo (las de la
-- entrega, la conciliación, la factura pendiente…) ni lo que se haga sobre un
-- recibo DEVUELTO. Eso es un REVOKE de tabla con GRANT por columnas, y es otro cambio.
--
-- ⚠️ Orden de despliegue: el código que deja de escribir COBRADO desde el
-- navegador (alta de socia con cobro, «Nueva factura», cobro de una cita) va en el
-- mismo PR y se despliega ANTES que esta migración. Aplicarla antes dejaría esos
-- tres flujos con un error (honesto, no una pérdida de datos) hasta el despliegue.
--
-- Quién sigue pasando, verificado en el catálogo de producción: todo lo que escribe
-- un recibo cobrado lo hace con service-role (confirmarCobro, el POS, el webhook,
-- `entregar-plan-comprado`) o con una función solo-servicio (`restaurar_backup`,
-- `anonimizar_socio`, `purgar_estudio_vencido`…). La única RPC de recibos que puede
-- ejecutar `authenticated` es `eliminar_recibo`, que BORRA (esto es INSERT/UPDATE)
-- y ya rechaza lo cobrado. Y la política de cancelar una cuota
-- (`aplicar_politica_recibos_al_cancelar_cuota`, que corre como el usuario) solo
-- toca recibos PENDIENTE.
-- ─────────────────────────────────────────────────────────────────────────────

-- SECURITY INVOKER con `search_path` vacío, como los otros triggers de guardia
-- «solo servidor» (`socios_auth_user_id_solo_servidor`, `studios_cuenta_cobro_solo_servidor`,
-- `tipos_clase_dinero_solo_propietaria`): no lee ninguna tabla, solo la fila que llega y el
-- rol de la petición, así que no necesita privilegios de su dueño. Los mensajes llevan el
-- nombre del trigger delante: `lib/errores.ts` los reconoce por él (un 42501 a secas se
-- traduce a «no tienes permiso, vuelve a entrar», que aquí sería un mal consejo).
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
    return new;
  end if;

  -- UPDATE
  if new.estado is distinct from old.estado
     and (new.estado = 'COBRADO' or old.estado = 'COBRADO') then
    raise exception 'recibos_cobrado_solo_servidor: el estado cobrado de un recibo lo cambia el servidor, no el navegador'
      using errcode = '42501';
  end if;

  if old.estado = 'COBRADO'
     and (new.importe is distinct from old.importe
          or new.metodo_cobro is distinct from old.metodo_cobro
          or new.fecha_cobro is distinct from old.fecha_cobro
          or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id) then
    raise exception 'recibos_cobrado_solo_servidor: un recibo ya cobrado no cambia su importe, su método ni su fecha de cobro desde el navegador'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

-- Es una función de TRIGGER: nadie la llama por RPC, y disparar un trigger no
-- comprueba EXECUTE. `pg_default_acl` da EXECUTE directo a authenticated en toda
-- función nueva, y revocar solo PUBLIC no quita nada de eso.
revoke all on function public.recibos_cobrado_solo_servidor() from public, anon, authenticated;

drop trigger if exists trg_recibos_cobrado_solo_servidor on public.recibos;
create trigger trg_recibos_cobrado_solo_servidor
  before insert or update on public.recibos
  for each row execute function public.recibos_cobrado_solo_servidor();

-- Verificación: la guardia de servidor está dentro de la función y el trigger
-- está enganchado. Un trigger que se creó pero no se enganchó, o una función sin
-- la guardia, pasarían «en verde» sin proteger nada.
do $$
begin
  if position('es_llamada_servicio' in (
        select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'recibos_cobrado_solo_servidor')) = 0 then
    raise exception 'la función de recibos no lleva la guardia de servidor';
  end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'recibos' and not t.tgisinternal
                    and t.tgname = 'trg_recibos_cobrado_solo_servidor'
                    and pg_get_triggerdef(t.oid) like '%BEFORE INSERT OR UPDATE%') then
    raise exception 'el trigger de recibos no está enganchado antes de INSERT/UPDATE';
  end if;
  if has_function_privilege('anon', 'public.recibos_cobrado_solo_servidor()'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.recibos_cobrado_solo_servidor()'::regprocedure, 'EXECUTE') then
    raise exception 'la función de trigger de recibos sigue ejecutable por anon/authenticated';
  end if;
end $$;

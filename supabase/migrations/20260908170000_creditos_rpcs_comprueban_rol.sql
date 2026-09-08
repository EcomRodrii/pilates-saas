-- ─────────────────────────────────────────────────────────────────────────────
-- 🟠 Auditoría 27ª pasada (8 sep 2026) — S-1.
--
-- Tres RPC de la familia de créditos/recompensas comprueban el ESTUDIO pero no
-- el ROL, mientras sus hermanas de la misma familia sí lo hacen:
--
--   · ampliar_caducidades   → exige puede_mover_dinero()          ✅
--   · consumir_sesion_bono  → exige puede_gestionar_calendario()  ✅
--   · devolver_sesion_bono  → exige puede_gestionar_calendario()  ✅
--   · ajustar_creditos      → solo validar_studio_mismatch()      ❌
--   · ajustar_stock         → solo el check de studio_id          ❌
--   · cancelar_canje        → solo validar_studio_mismatch()      ❌
--
-- Las tres son SECURITY DEFINER y `authenticated` tiene EXECUTE, así que son
-- invocables directamente por REST (`/rest/v1/rpc/ajustar_creditos`). Una
-- alumna NO llega: `current_studio_id()` solo resuelve para propietarias e
-- instructoras, y para ella devuelve null → STUDIO_MISMATCH. Pero una
-- INSTRUCTORA de ese estudio sí, y con eso puede, sin tocar el panel:
--
--   · restar créditos a CUALQUIER socia del estudio (p_delta_saldo < 0 pasa el
--     único guard, que solo prohíbe ganancias);
--   · inflar total_ganado / total_canjeado, que es lo que pintan los rankings;
--   · alterar el stock del catálogo de recompensas;
--   · cancelar el canje de otra socia y devolverle los créditos.
--
-- Por qué se puede cerrar sin riesgo: el ÚNICO camino vivo que usa estas RPC es
-- el portal de la alumna (`/api/public/canje` → canjearRecompensaPublica), y va
-- por service-role, donde `auth.uid()` es null y estos checks no se aplican —
-- igual que ya ocurre con los de sus hermanas. Los llamantes del panel
-- (dbAjustarCreditos / dbAjustarStock / dbCancelarCanje en lib/supabase-data.ts)
-- solo los invoca `studio-context.tsx`, y ninguna pantalla llama hoy a esos
-- métodos del contexto. Si se revivieran, PROPIETARIO/RECEPCION/MANAGER siguen
-- pasando; solo INSTRUCTOR pierde el acceso, que es justo lo que se cierra.
--
-- Se elige `puede_gestionar_clientas()` (PROPIETARIO/RECEPCION/MANAGER) y no
-- `puede_mover_dinero()` (que excluye a MANAGER) porque entregar y cancelar
-- recompensas es trabajo de mostrador, no de caja: los créditos no son euros.
--
-- Reversible con: quitar los dos `if` añadidos en cada función.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ajustar_creditos(p_socio_id text, p_studio_id text, p_delta_saldo integer, p_delta_ganado integer, p_delta_canjeado integer)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_saldo int; v_vivo int;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  -- Mover los créditos de otra persona es trabajo de mostrador.
  if auth.uid() is not null and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if auth.uid() is not null and p_delta_saldo > 0 then
    raise exception 'GANANCIA_NO_PERMITIDA_AQUI';
  end if;

  -- `total_ganado` es lo que pintan los rankings y los logros: se gana por
  -- `otorgar_credito_disparador`, que exige que la condición se cumpla de
  -- verdad. Subirlo desde aquí sería la misma ganancia por la puerta de atrás
  -- que la línea anterior ya prohíbe para el saldo.
  if auth.uid() is not null and (coalesce(p_delta_ganado, 0) > 0 or coalesce(p_delta_canjeado, 0) < 0) then
    raise exception 'GANANCIA_NO_PERMITIDA_AQUI';
  end if;

  if p_delta_saldo < 0 then
    select public.saldo_vivo(mc.saldo, mc.caduca_el) into v_vivo
      from member_credits mc where mc.socio_id = p_socio_id and mc.studio_id = p_studio_id;
    if coalesce(v_vivo, 0) + p_delta_saldo < 0 then
      raise exception 'SALDO_INSUFICIENTE';
    end if;
  end if;

  insert into member_credits (socio_id, studio_id, saldo, total_ganado, total_canjeado, actualizado_en)
    values (p_socio_id, p_studio_id, p_delta_saldo, p_delta_ganado, p_delta_canjeado, now())
  on conflict (socio_id) do update set
    saldo = member_credits.saldo + p_delta_saldo,
    total_ganado = member_credits.total_ganado + p_delta_ganado,
    total_canjeado = member_credits.total_canjeado + p_delta_canjeado,
    actualizado_en = now()
  returning saldo into v_saldo;

  if v_saldo < 0 then
    raise exception 'SALDO_INSUFICIENTE';
  end if;

  return v_saldo;
end;
$function$;

create or replace function public.ajustar_stock(p_item_id text, p_studio_id text, p_delta integer)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_stock int;
begin
  -- Aislamiento por estudio en llamadas autenticadas (panel); la service-role
  -- (endpoints públicos) no tiene auth.uid() y se salta el check.
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if auth.uid() is not null and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  update reward_catalog
    set stock = stock + p_delta
    where id = p_item_id
      and studio_id = p_studio_id
      and stock is not null
      and (p_delta >= 0 or stock + p_delta >= 0)  -- no bajar de 0 al restar
    returning stock into v_stock;

  if not found then
    raise exception 'SIN_STOCK';
  end if;
  return v_stock;
end;
$function$;

create or replace function public.cancelar_canje(p_redemption_id text, p_studio_id text)
 returns table(estado text, saldo integer)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_socio text;
  v_item text;
  v_coste int;
  v_estado text;
  v_saldo int;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if auth.uid() is not null and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select r.socio_id, r.catalog_item_id, r.creditos_gastados, r.estado
    into v_socio, v_item, v_coste, v_estado
  from reward_redemptions r
  where r.id = p_redemption_id and r.studio_id = p_studio_id
  for update;

  if not found then
    raise exception 'CANJE_NO_ENCONTRADO';
  end if;

  if v_estado is distinct from 'PENDIENTE' then
    select mc.saldo into v_saldo from member_credits mc
      where mc.socio_id = v_socio and mc.studio_id = p_studio_id;
    return query select v_estado, coalesce(v_saldo, 0);
    return;
  end if;

  update reward_redemptions set estado = 'CANCELADO' where id = p_redemption_id;

  insert into member_credits (socio_id, studio_id, saldo, total_ganado, total_canjeado, actualizado_en)
    values (v_socio, p_studio_id, v_coste, 0, 0, now())
  on conflict (socio_id) do update set
    saldo = member_credits.saldo + v_coste,
    total_canjeado = greatest(0, member_credits.total_canjeado - v_coste),
    actualizado_en = now()
  returning member_credits.saldo into v_saldo;

  update reward_catalog set stock = stock + 1
    where id = v_item and studio_id = p_studio_id and stock is not null;

  insert into credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
    values (
      'ctx-dev-' || substr(md5(p_redemption_id || '|' || clock_timestamp()::text || '|' || random()::text), 1, 18),
      p_studio_id, v_socio, 'CANJE', v_coste, 'Canje cancelado: créditos devueltos', p_redemption_id, now()
    );

  return query select 'CANCELADO'::text, v_saldo;
end;
$function$;

comment on function public.ajustar_creditos(text, text, integer, integer, integer) is
  'Ajuste atómico de créditos por deltas. Desde una sesión autenticada exige mostrador (puede_gestionar_clientas) y NUNCA permite ganar: las ganancias van por otorgar_credito_disparador, que comprueba la condición.';
comment on function public.ajustar_stock(text, text, integer) is
  'Ajuste atómico del stock del catálogo de recompensas. Desde una sesión autenticada exige mostrador (puede_gestionar_clientas).';
comment on function public.cancelar_canje(text, text) is
  'Cancela un canje PENDIENTE y devuelve créditos y stock, idempotente. Desde una sesión autenticada exige mostrador (puede_gestionar_clientas).';

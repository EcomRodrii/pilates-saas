-- ═══════════════════════════════════════════════════════════════════════════
-- Créditos: devoluciones de compra, cancelación de canjes y borrado de recompensas.
--
-- Migración ADITIVA y prospectiva: no toca ni reescribe ninguna fila existente
-- (ni saldos, ni libro, ni canjes). Todo lo que cambia vale desde que se aplica.
--
-- ── Qué cierra ──────────────────────────────────────────────────────────────
--  1. Devolver una compra retiraba los créditos DOS veces si se llamaba dos
--     veces, y apuntaba el movimiento con el signo y el tipo equivocados.
--     `retirar_creditos_compra` pasa a ser idempotente por compra, escribe una
--     REVERSION en negativo y nunca baja el saldo de cero.
--  2. Solo la pantalla de devolución del TPV retiraba créditos de COMPRA. Un
--     reembolso hecho en Stripe, un contracargo o «marcar devuelto» no. Nace
--     `sincronizar_creditos_compra(estudio, recibo)`, que cuelga del mismo dueño
--     que ya existe para «el recibo cambió de estado» (seguirCreditosAlRecibo).
--  3. Eliminar una recompensa borraba EN CASCADA todos sus canjes, también los
--     pendientes: la alumna ya había pagado con sus créditos. La FK pasa a
--     SET NULL y el nombre de la recompensa se conserva en el canje.
--  4. Cancelar un canje con el saldo ya caducado devolvía créditos que nacían
--     muertos: el siguiente abono los destruía. Ahora la devolución nace viva.
--  5. La caducidad era invisible: ni apunte ni contador. Ahora cada vez que se
--     descarta saldo caducado queda un apunte CADUCIDAD y suma en un contador.
--  6. Cancelar un canje no guardaba quién, cuándo ni por qué.
--  7. Un canje de clase gratis se hacía en tres llamadas desde TypeScript, con
--     el deshacer sin comprobar. Pasa a una sola transacción.
--
-- ── Qué NO hace (decisiones del fundador, ver el PR) ────────────────────────
--  · Si un reembolso falla y la venta vuelve a estar cobrada, los créditos
--    retirados vuelven (`restituir_creditos_compra`, apunte GANANCIA).
--  · No crea deuda de la compra devuelta cuyos créditos ya se gastaron (el
--    saldo no queda negativo y no se inventa «por compensar»). Lo no retirado
--    queda escrito en el apunte. Activarlo es una línea: ver `v_sin_retirar`.
--  · No hace retroactivo cambiar la caducidad del estudio, ni recupera saldo
--    ya caducado si se quita. Ese comportamiento no cambia.
--  · No arregla el descuadre histórico de saldo frente a libro de 3 alumnas.
--
-- ── Orden de despliegue ─────────────────────────────────────────────────────
-- MIGRACIÓN PRIMERO, CÓDIGO DESPUÉS. El código nuevo llama a RPC que solo
-- existen con esta migración (`cancelar_canje_con_motivo`,
-- `entregar_canje_clase_gratis`, `sincronizar_creditos_compra`). El código
-- viejo, en cambio, sigue funcionando con la migración ya aplicada:
-- `cancelar_canje(2 args)` sigue existiendo con las mismas columnas y
-- `retirar_creditos_compra` mantiene firma y grants.
--
-- ── Interacción con la otra tanda (cierre de escrituras al libro) ───────────
-- No se tocan políticas ni grants de tablas, ni `ajustar_stock`,
-- `ajustar_creditos`, `canjear_recompensa`, `entregar_canje`,
-- `generar_codigo_canje`. Sí se toca `cancelar_canje`: queda como envoltorio
-- de `cancelar_canje_con_motivo`. Si la otra migración redefine
-- `cancelar_canje(text, text)` DESPUÉS, el envoltorio se pisa (la 2-args deja
-- de pasar por aquí) pero nada se rompe: el código nuevo llama directamente a
-- `cancelar_canje_con_motivo`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Columnas nuevas (todas nullable o con valor por defecto) ─────────────
alter table public.reward_redemptions
  add column if not exists recompensa_nombre text,
  add column if not exists cancelado_en timestamptz,
  add column if not exists cancelado_por text,
  add column if not exists cancelado_motivo text;

comment on column public.reward_redemptions.recompensa_nombre is
  'Nombre de la recompensa al ELIMINARLA del catálogo (el canje sobrevive con catalog_item_id NULL). NULL mientras el ítem existe.';
comment on column public.reward_redemptions.cancelado_en is
  'Cuándo se canceló el canje. NULL si no está cancelado y en los cancelados anteriores a esta migración.';
comment on column public.reward_redemptions.cancelado_por is
  'auth.uid() de quien lo canceló, o «servicio» si lo hizo el servidor (portal, deshacer automático).';
comment on column public.reward_redemptions.cancelado_motivo is
  'Motivo libre (máx. 200) o código del sistema (clase_gratis_sin_cupo, clase_gratis_error).';

alter table public.member_credits
  add column if not exists total_caducado integer not null default 0;

comment on column public.member_credits.total_caducado is
  'Créditos descartados por caducidad DESDE esta migración (prospectivo). Antes no se contaban: saldo + canjeado puede no cuadrar con ganado en lo anterior.';

-- Tipo de apunte nuevo: la caducidad deja de ser silenciosa.
alter table public.credit_transactions drop constraint if exists credit_transactions_tipo_check;
alter table public.credit_transactions
  add constraint credit_transactions_tipo_check
  check (tipo in ('GANANCIA', 'CANJE', 'REVERSION', 'COMPENSACION', 'CADUCIDAD'));

-- ── 1. F2 · Eliminar una recompensa NO borra canjes ─────────────────────────
alter table public.reward_redemptions drop constraint if exists reward_redemptions_catalog_item_id_fkey;
alter table public.reward_redemptions
  add constraint reward_redemptions_catalog_item_id_fkey
  foreign key (catalog_item_id) references public.reward_catalog(id) on delete set null;

-- El nombre se guarda ANTES de que la FK ponga el id a NULL. Sin backfill: solo
-- para lo que se elimine a partir de ahora, y solo si el nombre no estaba ya.
create or replace function public.reward_catalog_conserva_canjes()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.reward_redemptions r
     set recompensa_nombre = coalesce(r.recompensa_nombre, old.nombre)
   where r.catalog_item_id = old.id and r.studio_id = old.studio_id;
  return old;
end;
$function$;

drop trigger if exists reward_catalog_conserva_canjes on public.reward_catalog;
create trigger reward_catalog_conserva_canjes
  before delete on public.reward_catalog
  for each row execute function public.reward_catalog_conserva_canjes();

revoke all on function public.reward_catalog_conserva_canjes() from public, anon, authenticated;

-- ── 2. F7 · La caducidad deja apunte y contador ─────────────────────────────
-- Misma lógica que antes; lo único nuevo es que, si descarta saldo, lo cuenta
-- y lo apunta. Solo mira hacia delante: ningún saldo ya descartado se toca.
create or replace function public.member_credits_caducidad()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE' then
    if new.total_ganado > old.total_ganado then
      if old.caduca_el is not null and old.caduca_el < public.hoy_estudio() then
        if old.saldo > 0 then
          new.total_caducado := coalesce(old.total_caducado, 0) + old.saldo;
          insert into public.credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
          values (
            'ctx-cad-' || substr(md5(new.socio_id || '|' || clock_timestamp()::text || '|' || random()::text), 1, 20),
            new.studio_id, new.socio_id, 'CADUCIDAD', -old.saldo,
            format('Caducan %s créditos sin usar', old.saldo), null, now()
          );
        end if;
        new.saldo := new.saldo - old.saldo;
      end if;
      new.caduca_el := public.caduca_creditos(new.studio_id);
    end if;
  else
    if new.total_ganado > 0 then
      new.caduca_el := public.caduca_creditos(new.studio_id);
    end if;
  end if;
  return new;
end;
$function$;

-- ── 3. F3/F4 · Retirar los créditos de una compra devuelta ──────────────────
-- Misma firma: conserva sus grants (se reafirman abajo igualmente).
--
-- · Idempotente por compra: la clave es el apunte `ct-posdev-…` (determinista),
--   bajo un bloqueo por compra. Dos llamadas = una retirada. El apunte se
--   escribe SIEMPRE (también cuando no queda nada que retirar): sin él, una
--   segunda llamada, con la alumna ya con saldo nuevo, retiraría créditos que
--   no son de esta compra.
-- · Tipo REVERSION y creditos NEGATIVO (antes CANJE y positivo).
-- · Saldo nunca por debajo de cero. Si ya los gastó, `v_sin_retirar` queda en
--   el texto del apunte y NO se convierte en deuda (decisión del fundador:
--   para crearla bastaría sumar `v_sin_retirar` a `creditos_por_compensar` en
--   el UPDATE de abajo, como hace `sincronizar_creditos_renovacion`).
-- · `total_ganado` baja solo lo retirado: así `saldo = ganado - canjeado -
--   caducado` se sigue cumpliendo.
-- · NO borra `reward_actions`: la marca de «esta venta ya dio créditos» se
--   queda, así un reintento de la concesión de la misma venta no los regala
--   otra vez después de devolverla.
create or replace function public.retirar_creditos_compra(
  p_studio_id text, p_socio_id text, p_venta_id text
) returns integer
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
declare
  v_creditos int;
  v_saldo int;
  v_retirar int;
  v_sin_retirar int;
  v_marca text;
  v_h text;
  v_ciclo int;
begin
  if p_socio_id is null or p_venta_id is null then return 0; end if;
  if not public.es_llamada_servicio() then
    raise exception 'NO_AUTORIZADO';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('creditos-compra|' || p_studio_id || '|' || p_venta_id, 0));

  -- Una devolución puede anularse (un reembolso que falla y la venta vuelve a
  -- estar cobrada) y volver a darse: cada ciclo tiene su marca. El primero usa el
  -- id de siempre; tras cada restitución (`ct-posrest-…`) el siguiente lleva `-N`.
  v_h := substr(md5(p_studio_id || '|' || p_venta_id), 1, 20);
  select count(*) into v_ciclo from public.credit_transactions ct where ct.id like 'ct-posrest-' || v_h || '%';
  v_marca := 'ct-posdev-' || v_h || case when v_ciclo > 0 then '-' || v_ciclo else '' end;
  if exists (select 1 from public.credit_transactions ct where ct.id = v_marca) then
    return 0;
  end if;

  -- La ganancia de ESTA compra, por su id determinista (el de
  -- `otorgar_creditos_compra`), no por `ref_id`: el id de una venta no puede
  -- coincidir con el de un recibo, pero la clave exacta no depende de eso.
  select ct.creditos into v_creditos
    from public.credit_transactions ct
   where ct.id = 'ct-pos-' || substr(md5(p_studio_id || '|' || p_venta_id), 1, 20)
     and ct.studio_id = p_studio_id and ct.socio_id = p_socio_id and ct.tipo = 'GANANCIA';
  if v_creditos is null or v_creditos <= 0 then return 0; end if;

  select mc.saldo into v_saldo from public.member_credits mc
   where mc.socio_id = p_socio_id and mc.studio_id = p_studio_id
   for update;

  v_retirar := least(v_creditos, greatest(coalesce(v_saldo, 0), 0));
  v_sin_retirar := v_creditos - v_retirar;

  if v_retirar > 0 then
    update public.member_credits mc
       set saldo = mc.saldo - v_retirar,
           total_ganado = greatest(0, mc.total_ganado - v_retirar),
           actualizado_en = now()
     where mc.socio_id = p_socio_id and mc.studio_id = p_studio_id;
  end if;

  insert into public.credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
  values (
    v_marca, p_studio_id, p_socio_id, 'REVERSION', -v_retirar,
    case when v_sin_retirar > 0
      then format('Devolución de una compra: se retiran %s créditos (%s ya estaban gastados y no se descuentan)', v_retirar, v_sin_retirar)
      else format('Devolución de una compra: se retiran %s créditos', v_retirar)
    end,
    p_venta_id, now()
  )
  on conflict (id) do nothing;

  return v_retirar;
end;
$function$;

-- ── 4. F4 · Restituir si el dinero «vuelve» (reembolso que falla) ───────────
-- Simétrica de `retirar_creditos_compra`: si la venta vuelve a estar cobrada
-- (el webhook restaura `devuelta_en`), los créditos que SE RETIRARON vuelven,
-- con su apunte GANANCIA, y el ciclo siguiente de devolución tiene marca propia.
-- Solo restituye lo realmente retirado (`-creditos` de la marca vigente).
create or replace function public.restituir_creditos_compra(
  p_studio_id text, p_socio_id text, p_venta_id text
) returns integer
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
declare
  v_h text;
  v_ciclo int;
  v_marca text;
  v_ret int;
begin
  if p_socio_id is null or p_venta_id is null then return 0; end if;
  if not public.es_llamada_servicio() then
    raise exception 'NO_AUTORIZADO';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('creditos-compra|' || p_studio_id || '|' || p_venta_id, 0));

  v_h := substr(md5(p_studio_id || '|' || p_venta_id), 1, 20);
  select count(*) into v_ciclo from public.credit_transactions ct where ct.id like 'ct-posrest-' || v_h || '%';
  v_marca := 'ct-posdev-' || v_h || case when v_ciclo > 0 then '-' || v_ciclo else '' end;

  select -ct.creditos into v_ret
    from public.credit_transactions ct
   where ct.id = v_marca and ct.studio_id = p_studio_id and ct.socio_id = p_socio_id and ct.tipo = 'REVERSION';
  if not found then return 0; end if;
  v_ret := greatest(coalesce(v_ret, 0), 0);

  if v_ret > 0 then
    update public.member_credits mc
       set saldo = mc.saldo + v_ret,
           total_ganado = mc.total_ganado + v_ret,
           actualizado_en = now()
     where mc.socio_id = p_socio_id and mc.studio_id = p_studio_id;
  end if;

  insert into public.credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
  values (
    'ct-posrest-' || v_h || '-' || (v_ciclo + 1), p_studio_id, p_socio_id, 'GANANCIA', v_ret,
    format('Devolución anulada: vuelven %s créditos de la compra', v_ret), p_venta_id, now()
  )
  on conflict (id) do nothing;

  return v_ret;
end;
$function$;

-- ── 4b. F4 · «El dinero de la venta ha vuelto» → créditos de COMPRA fuera ───
-- Se llama desde `seguirCreditosAlRecibo`, el dueño de «el recibo cambió de
-- estado». Aquí no se decide si hubo devolución a mano: se mira el ESTADO real
-- de la venta del TPV (devuelta entera o anulada) o del recibo (DEVUELTO).
-- Devuelta → retira (idempotente por ciclo). No devuelta → restituye si había
-- retirado (no-op en el resto de cobros). `r_retirados` es negativo cuando lo
-- que se hizo fue restituir.
create or replace function public.sincronizar_creditos_compra(p_studio_id text, p_recibo_id text)
  returns table(r_venta_id text, r_retirados integer)
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
declare
  v record;
  v_recibo_devuelto boolean;
  v_n int;
begin
  if not public.es_llamada_servicio() then
    raise exception 'NO_AUTORIZADO';
  end if;
  if p_studio_id is null or p_recibo_id is null then return; end if;

  select exists (
    select 1 from public.recibos rc
     where rc.id = p_recibo_id and rc.studio_id = p_studio_id and rc.estado = 'DEVUELTO'
  ) into v_recibo_devuelto;

  for v in
    select vp.id, vp.socio_id, vp.devuelta_en, vp.anulada_en, vp.estado
      from public.ventas_pos vp
     where vp.studio_id = p_studio_id and vp.recibo_id = p_recibo_id and vp.socio_id is not null
  loop
    if v_recibo_devuelto or v.devuelta_en is not null or v.anulada_en is not null or v.estado = 'ANULADA' then
      r_venta_id := v.id;
      r_retirados := public.retirar_creditos_compra(p_studio_id, v.socio_id, v.id);
      return next;
    else
      v_n := public.restituir_creditos_compra(p_studio_id, v.socio_id, v.id);
      if v_n > 0 then
        r_venta_id := v.id;
        r_retirados := -v_n;
        return next;
      end if;
    end if;
  end loop;
end;
$function$;

-- ── 5. F5/F13 · Cancelar un canje ───────────────────────────────────────────
-- La lógica pasa a `cancelar_canje_con_motivo`. `cancelar_canje(2 args)` queda
-- de envoltorio para el código desplegado antes que este (mismas columnas).
--
-- · Con el saldo ya caducado, el saldo viejo se descarta AHORA (igual que haría
--   el trigger al siguiente abono, pero apuntándolo) y la devolución nace con
--   la fecha de caducidad de hoy: sale viva y el siguiente abono no se la come.
--   Con el saldo vivo no se toca `caduca_el`: la devolución caduca con el resto.
-- · Deja quién, cuándo y por qué.
-- · El apunte de devolución tiene id determinista: idempotente por construcción.
create or replace function public.cancelar_canje_con_motivo(
  p_redemption_id text, p_studio_id text, p_motivo text default null
) returns table(estado text, saldo integer)
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
declare
  v_socio text; v_item text; v_coste int; v_estado text; v_saldo int;
  v_saldo_antes int; v_caduca date;
  v_hoy date := public.hoy_estudio();
  v_caducado boolean := false;
  v_muerto int := 0;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if not public.es_llamada_servicio() and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select r.socio_id, r.catalog_item_id, r.creditos_gastados, r.estado
    into v_socio, v_item, v_coste, v_estado
  from public.reward_redemptions r
  where r.id = p_redemption_id and r.studio_id = p_studio_id
  for update;

  if not found then
    raise exception 'CANJE_NO_ENCONTRADO';
  end if;

  if v_estado is distinct from 'PENDIENTE' then
    select mc.saldo into v_saldo from public.member_credits mc
      where mc.socio_id = v_socio and mc.studio_id = p_studio_id;
    return query select v_estado, coalesce(v_saldo, 0);
    return;
  end if;

  update public.reward_redemptions r
     set estado = 'CANCELADO',
         cancelado_en = now(),
         cancelado_por = coalesce(auth.uid()::text, 'servicio'),
         cancelado_motivo = left(nullif(trim(p_motivo), ''), 200)
   where r.id = p_redemption_id;

  select mc.saldo, mc.caduca_el into v_saldo_antes, v_caduca
    from public.member_credits mc
   where mc.socio_id = v_socio and mc.studio_id = p_studio_id
   for update;
  if found and v_caduca is not null and v_caduca < v_hoy then
    v_caducado := true;
    v_muerto := greatest(coalesce(v_saldo_antes, 0), 0);
  end if;

  insert into public.member_credits as mc (socio_id, studio_id, saldo, total_ganado, total_canjeado, caduca_el, actualizado_en)
    values (v_socio, p_studio_id, v_coste, 0, 0, public.caduca_creditos(p_studio_id), now())
  on conflict (socio_id) do update set
    saldo = (case when v_caducado then 0 else mc.saldo end) + v_coste,
    total_canjeado = greatest(0, mc.total_canjeado - v_coste),
    total_caducado = mc.total_caducado + v_muerto,
    caduca_el = case when v_caducado then public.caduca_creditos(p_studio_id) else mc.caduca_el end,
    actualizado_en = now()
  returning mc.saldo into v_saldo;

  if v_muerto > 0 then
    insert into public.credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
    values (
      'ctx-cad-' || substr(md5(p_redemption_id || '|cad'), 1, 20),
      p_studio_id, v_socio, 'CADUCIDAD', -v_muerto,
      format('Caducan %s créditos sin usar', v_muerto), p_redemption_id, now()
    )
    on conflict (id) do nothing;
  end if;

  update public.reward_catalog c set stock = c.stock + 1
    where c.id = v_item and c.studio_id = p_studio_id and c.stock is not null;

  insert into public.credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
    values (
      'ctx-dev-' || p_redemption_id,
      p_studio_id, v_socio, 'CANJE', v_coste, 'Canje cancelado: créditos devueltos', p_redemption_id, now()
    )
  on conflict (id) do nothing;

  return query select 'CANCELADO'::text, v_saldo;
end;
$function$;

create or replace function public.cancelar_canje(p_redemption_id text, p_studio_id text)
  returns table(estado text, saldo integer)
  language sql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
  select * from public.cancelar_canje_con_motivo(p_redemption_id, p_studio_id, null);
$function$;

-- ── 6. F8 · Canje de clase gratis en UNA transacción ────────────────────────
-- Bloquea el canje, comprueba que sigue PENDIENTE, concede la recuperación y
-- lo marca ENTREGADO. Si no hay cupo, cancela el canje dentro de la misma
-- transacción. Si algo falla, nada queda a medias. Cancelar desde el panel en
-- paralelo se serializa por la fila: gana uno, y el otro ve el estado final.
-- Devuelve: ENTREGADO | TOPE (cancelado) | NO_PENDIENTE (no se concedió nada).
create or replace function public.entregar_canje_clase_gratis(
  p_studio_id text, p_redemption_id text, p_recuperacion_id text, p_motivo text
) returns text
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
declare
  v_socio text;
  v_estado text;
  v_res text;
begin
  if not public.es_llamada_servicio() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select r.socio_id, r.estado into v_socio, v_estado
    from public.reward_redemptions r
   where r.id = p_redemption_id and r.studio_id = p_studio_id
   for update;
  if not found then
    raise exception 'CANJE_NO_ENCONTRADO';
  end if;
  if v_estado is distinct from 'PENDIENTE' then
    return 'NO_PENDIENTE';
  end if;

  v_res := public.crear_recuperacion(p_recuperacion_id, p_studio_id, v_socio, null, p_motivo, null);
  if v_res = 'TOPE' then
    perform public.cancelar_canje_con_motivo(p_redemption_id, p_studio_id, 'clase_gratis_sin_cupo');
    return 'TOPE';
  end if;

  update public.reward_redemptions r
     set estado = 'ENTREGADO', entregado_en = now(), recuperacion_id = p_recuperacion_id
   where r.id = p_redemption_id;
  return 'ENTREGADO';
end;
$function$;

-- ── 7. Permisos ─────────────────────────────────────────────────────────────
-- `pg_default_acl` da EXECUTE directo a anon/authenticated: revocar PUBLIC no
-- basta. Las funciones NUEVAS y las redefinidas se reafirman explícitamente.
-- Función de trigger: Postgres solo comprueba EXECUTE al CREAR el trigger, no al
-- dispararse, así que revocarlo no afecta a quien escribe en `member_credits`
-- (mismo criterio que `member_credits_deuda`, que ya está revocada así).
revoke all on function public.member_credits_caducidad() from public, anon, authenticated;

revoke all on function public.retirar_creditos_compra(text, text, text) from public, anon, authenticated;
grant execute on function public.retirar_creditos_compra(text, text, text) to service_role;

revoke all on function public.restituir_creditos_compra(text, text, text) from public, anon, authenticated;
grant execute on function public.restituir_creditos_compra(text, text, text) to service_role;

revoke all on function public.sincronizar_creditos_compra(text, text) from public, anon, authenticated;
grant execute on function public.sincronizar_creditos_compra(text, text) to service_role;

revoke all on function public.entregar_canje_clase_gratis(text, text, text, text) from public, anon, authenticated;
grant execute on function public.entregar_canje_clase_gratis(text, text, text, text) to service_role;

-- El panel (authenticated) cancela canjes: mismo reparto que tenía `cancelar_canje`.
revoke all on function public.cancelar_canje_con_motivo(text, text, text) from public, anon;
grant execute on function public.cancelar_canje_con_motivo(text, text, text) to authenticated, service_role;

revoke all on function public.cancelar_canje(text, text) from public, anon;
grant execute on function public.cancelar_canje(text, text) to authenticated, service_role;

-- ── 8. Verificación (ejecutar tras aplicar; todo debe dar lo esperado) ──────
--   select p.proname, pg_get_function_identity_arguments(p.oid) args,
--          has_function_privilege('anon', p.oid, 'execute') anon,
--          has_function_privilege('authenticated', p.oid, 'execute') authenticated,
--          has_function_privilege('service_role', p.oid, 'execute') service_role
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and p.proname in ('retirar_creditos_compra','restituir_creditos_compra','sincronizar_creditos_compra',
--                        'entregar_canje_clase_gratis','cancelar_canje_con_motivo',
--                        'cancelar_canje','reward_catalog_conserva_canjes');
--   -- esperado: anon = false en todas; authenticated = true SOLO en
--   --   cancelar_canje_con_motivo y cancelar_canje; service_role = true salvo
--   --   reward_catalog_conserva_canjes (función de trigger, nadie la llama).
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'reward_redemptions_catalog_item_id_fkey';  -- ... ON DELETE SET NULL
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'credit_transactions_tipo_check';           -- incluye 'CADUCIDAD'

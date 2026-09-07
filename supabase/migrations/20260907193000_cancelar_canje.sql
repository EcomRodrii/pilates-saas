-- ═══════════════════════════════════════════════════════════════════════════
-- Cancelar un canje: devolver créditos y stock, en UNA transacción.
--
-- Hasta ahora el canje era un viaje de ida. `canjearRecompensaPublica` cobra
-- los créditos y reserva el stock de forma atómica, y deja la fila en
-- PENDIENTE… y ahí se acaba todo: `updateRewardRedemptionEstado` existe en el
-- contexto y NO tiene ni un consumidor, y ninguna pantalla del panel lista
-- `reward_redemptions`. El estado ENTREGADO está en el CHECK de la tabla y no
-- lo escribe nadie. Mientras tanto el portal le promete a la socia «El estudio
-- te avisará» — y al estudio no se le avisa.
--
-- Devolver a mano sería peor: son TRES escrituras (estado, saldo, stock) que
-- deben ir juntas o no ir. Hechas desde TypeScript, un fallo a medias deja a
-- la socia sin recompensa y sin créditos. Por eso vive aquí.
--
-- Decisiones que no son obvias:
--
--  · La devolución NO borra ni reescribe el apunte del canje: añade uno que lo
--    compensa. Un ledger que se reescribe deja de ser un ledger.
--  · El apunte de devolución va con tipo 'CANJE' y signo POSITIVO, no como
--    'GANANCIA'. Así se mantienen las dos invariantes que permiten auditar
--    esto: suma(GANANCIA) == total_ganado, y suma(CANJE) == lo realmente
--    gastado. Con 'GANANCIA' la socia parecería haber ganado créditos que
--    nadie le concedió, y subiría de nivel por cancelar un canje.
--  · `total_ganado` no se toca: el nivel sale de ahí y cancelar un canje no
--    puede cambiar de nivel a nadie.
--  · Idempotente por estado + cerrojo de fila: dos cancelaciones simultáneas
--    del mismo canje devuelven los créditos UNA vez.
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- `for update` es el cerrojo real: sin él, dos pestañas cancelando a la vez
  -- leerían las dos PENDIENTE y devolverían el doble de créditos.
  select r.socio_id, r.catalog_item_id, r.creditos_gastados, r.estado
    into v_socio, v_item, v_coste, v_estado
  from reward_redemptions r
  where r.id = p_redemption_id and r.studio_id = p_studio_id
  for update;

  if not found then
    raise exception 'CANJE_NO_ENCONTRADO';
  end if;

  -- Ya resuelto (ENTREGADO o CANCELADO): no se devuelve nada por segunda vez.
  -- Se responde con el estado real en vez de fallar, para que quien llama
  -- pueda refrescar su pantalla sin tratar esto como un error.
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
    -- `greatest` es una red, no lógica: total_canjeado nunca debería quedar
    -- por debajo de lo que se devuelve. Si algún día pasara, un contador
    -- negativo rompería el histórico de gasto en pantalla.
    total_canjeado = greatest(0, member_credits.total_canjeado - v_coste),
    actualizado_en = now()
  returning member_credits.saldo into v_saldo;

  -- Solo los ítems con stock limitado lo reservaron; los de stock null no.
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

-- Gotcha de grants documentado en este repo (van 3+ veces): tras crear una
-- función el privilegio por defecto es EXECUTE TO PUBLIC. Se retira siempre.
revoke all on function public.cancelar_canje(text, text) from public, anon;
grant execute on function public.cancelar_canje(text, text) to authenticated, service_role;

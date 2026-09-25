-- ════════════════════════════════════════════════════════════════════════════
-- Eliminar un recibo pide un motivo, y solo lo que aún no es dinero cobrado
-- ════════════════════════════════════════════════════════════════════════════
--
-- Segundo paso de la auditoría de dinero del estudio (el libro `auditoria_estudio`
-- salió en 20260925152253). Hasta ahora «Eliminar» borraba un recibo con un
-- DELETE directo del navegador, en CUALQUIER estado y sin decir por qué: un cobro
-- ya cobrado desaparecía, un enlace de pago abierto quedaba huérfano y el libro
-- solo sabía quién y cuándo, no el porqué.
--
-- Qué cambia:
--   1. `eliminar_recibo(p_studio_id, p_recibo_id, p_motivo)` es la ÚNICA vía para
--      que un cliente elimine un recibo. Comprueba el rol (`puede_mover_dinero`,
--      igual que antes) y la sede, bloquea la fila (`for update`: un webhook que la
--      esté cobrando espera) y solo elimina un recibo PENDIENTE, FALLIDO o ANULADO
--      sin factura, sin penalización, sin un pago abierto y sin huella de un cobro
--      o una devolución anteriores. Un recibo COBRADO, DEVUELTO o EN_CURSO no se
--      borra: el dinero no desaparece, se devuelve. Límite honesto: quien puede
--      cambiar el estado de un recibo (PROPIETARIA, RECEPCIÓN) podría cambiarlo y
--      luego eliminar; ambos pasos quedan en el libro. La guarda protege de errores,
--      no de mala fe.
--   2. El MOTIVO es un código de una lista cerrada, sin texto libre: el libro no
--      se puede rectificar ni suprimir, y un texto libre acabaría llevando el
--      nombre de una clienta.
--   3. Se quita el DELETE directo de un cliente sobre `recibos` Y sobre `socios`
--      (política y permiso): borrar a la clienta arrastraba sus recibos en cascada
--      y se saltaba todo lo anterior. Los borrados de servidor (service-role:
--      penalizaciones, baja de clienta, purgas, restauración de copias) no cambian.
--   4. El trigger de auditoría lee el motivo de una variable de la transacción que
--      fija la propia RPC y lo guarda en el libro (`motivo`).
--
-- ⚠️ Cambia lo que puede hacer recepción: ya no puede borrar un recibo cobrado ni
-- uno con un pago en marcha. Es a propósito y está en la descripción del PR.

-- ── El libro gana el motivo ────────────────────────────────────────────────
alter table public.auditoria_estudio add column if not exists motivo text;
comment on column public.auditoria_estudio.motivo is
  'Código de motivo (lista cerrada, sin texto libre) que dio quien hizo el cambio. NULL si el cambio no lo pedía.';

-- ── El trigger de auditoría lee el motivo ─────────────────────────────────
create or replace function public.auditar_cambio_dinero()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_rol     text;
  v_studio  text;
  v_fila    jsonb;
  v_vieja   jsonb;
  v_antes   jsonb;
  v_despues jsonb;
  v_cambios text[];
  v_contexto jsonb;
  -- Motivo (lista cerrada) que fija, en su transacción, la RPC que hace el cambio
  -- (`eliminar_recibo`). Un cliente no puede fijarlo a su gusto: ninguna RPC
  -- expuesta le deja elegir el nombre de la variable, y sin la RPC queda NULL.
  v_motivo  text := left(nullif(current_setting('tentare.motivo_auditoria', true), ''), 60);
  -- tg_argv[0]: columnas de identificación (van a `contexto`).
  -- tg_argv[1]: columnas que NUNCA se copian al libro (datos de terceros que el
  --             libro, al ser inmutable, no podría rectificar ni suprimir).
  v_excluir text[] := string_to_array(coalesce(tg_argv[1], ''), ',');
begin
  -- Solo lo que hace una persona del equipo desde su sesión (ver cabecera). Esta
  -- salida va FUERA del bloque de excepción de abajo: un webhook o un cron (sin
  -- uid) no debe pagar una subtransacción por cada fila que toca.
  if v_uid is null then
    return null;
  end if;

  begin
    if tg_op = 'INSERT' then
      v_fila := to_jsonb(new) - v_excluir;
      v_despues := v_fila;
    elsif tg_op = 'DELETE' then
      v_fila := to_jsonb(old) - v_excluir;
      v_antes := v_fila;
    else
      v_fila := to_jsonb(new) - v_excluir;
      v_vieja := to_jsonb(old) - v_excluir;
      -- Solo lo que cambió. `updated_at` y parecidos los mueve la propia base en
      -- cada UPDATE, y `matricula_gratis_usados` es un contador que suma
      -- `reservar_matricula` por su cuenta: no son un cambio de nadie.
      select array_agg(n.key order by n.key),
             jsonb_object_agg(n.key, o.value),
             jsonb_object_agg(n.key, n.value)
        into v_cambios, v_antes, v_despues
        from jsonb_each(v_fila) n
        join jsonb_each(v_vieja) o on o.key = n.key
       where n.key not in ('updated_at', 'actualizado_en', 'modificado_en', 'matricula_gratis_usados')
         and o.value is distinct from n.value;
      if v_cambios is null then
        return null;
      end if;
    end if;

    v_studio := v_fila ->> 'studio_id';
    if v_studio is null then
      return null;
    end if;

    -- Rol de quien actúa EN LA SEDE DE LA FILA (no en la activa de su sesión:
    -- una RPC que escribiera en otra sede registraría el rol equivocado). Misma
    -- regla que `current_rol()`: la ficha de equipo activa y, si no, la dueña.
    select i.rol into v_rol
      from public.instructores i
     where i.auth_user_id = v_uid and i.studio_id = v_studio and coalesce(i.activo, true)
     limit 1;
    if v_rol is null then
      select 'PROPIETARIO' into v_rol
        from public.studios s
       where s.id = v_studio and s.owner_auth_user_id = v_uid;
    end if;
    -- Sin rol en esa sede (una socia que pasa por una RPC, p. ej.): no es el equipo.
    if v_rol is null then
      return null;
    end if;

    -- Columnas de identificación que fija cada trigger. Solo las que existan.
    if tg_nargs > 0 then
      select jsonb_object_agg(c, v_fila -> c)
        into v_contexto
        from unnest(string_to_array(tg_argv[0], ',')) as c
       where v_fila ? c;
    end if;

    -- ⚠️ `left(…, 200)`: los ids son texto que elige el cliente (la RLS solo mira
    -- `studio_id` y el permiso de dinero) y los índices del libro rechazan una
    -- entrada de más de ~2.700 bytes. Con un id así de largo el INSERT fallaba,
    -- el `exception` de abajo se lo tragaba y esa fila de dinero quedaba SIN
    -- auditar durante toda su vida: justo el camino de quien no quiere que se vea
    -- lo que hace. El id completo sigue en `antes`/`despues` en altas y bajas.
    insert into public.auditoria_estudio
      (studio_id, actor_uid, actor_rol, tabla, fila_id, operacion,
       socio_id, cambios, contexto, antes, despues, motivo)
    values
      (left(v_studio, 200), v_uid, v_rol, tg_table_name, left(coalesce(v_fila ->> 'id', ''), 200), tg_op,
       left(v_fila ->> 'socio_id', 200), v_cambios, v_contexto, v_antes, v_despues, v_motivo);
  exception when others then
    -- FAIL-OPEN (decisión 1 de la cabecera): jamás se impide una escritura de
    -- dinero por un fallo al registrarla. No atrapa la cancelación por timeout
    -- (`query_canceled`): esa sí aborta la sentencia entera.
    raise warning 'AUDITORIA_FALLO (%): %', tg_table_name, sqlerrm;
  end;

  return null;
end;
$$;

revoke all on function public.auditar_cambio_dinero() from public, anon, authenticated;

-- ── La única vía para eliminar un recibo ───────────────────────────────────
create or replace function public.eliminar_recibo(p_studio_id text, p_recibo_id text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
begin
  -- `coalesce(…, false) is not true`: una sesión sin rol da NULL en `puede_mover_dinero()`
  -- y `if not NULL` NO salta, así que la guarda fallaría abierta. Y sin sede no hay nada
  -- que comprobar.
  if p_studio_id is null or coalesce(public.puede_mover_dinero(), false) is not true then
    raise exception 'NO_AUTORIZADO';
  end if;
  perform public.validar_studio_mismatch(p_studio_id);

  -- Lista cerrada: la misma que `lib/recibos-eliminar.ts` (un test las ata).
  if p_motivo is null
     or p_motivo not in ('DUPLICADO', 'IMPORTE_ERRONEO', 'CREADO_POR_ERROR', 'CLIENTA_DE_BAJA', 'OTRO_MOTIVO') then
    raise exception 'MOTIVO_INVALIDO';
  end if;

  -- `for update`: si un webhook o un cobro lo está pasando a COBRADO, espera y
  -- después se ve el estado real, no el de hace un segundo.
  select r.id, r.estado, r.checkout_session_id, r.stripe_payment_intent_id,
         r.cobro_mostrador_pi, r.cobro_mostrador_checkout_session_id,
         r.fecha_cobro, r.fecha_devolucion, r.importe_devuelto, r.reembolso_stripe_id,
         r.entrega_aplicada, r.conciliado_en
    into v_r
    from public.recibos r
   where r.id = p_recibo_id and r.studio_id = p_studio_id
     for update;
  if not found then
    raise exception 'RECIBO_NO_ENCONTRADO';
  end if;

  -- El dinero cobrado, devuelto o en camino no se borra: se devuelve.
  if v_r.estado not in ('PENDIENTE', 'FALLIDO', 'ANULADO') then
    raise exception 'ESTADO_NO_ELIMINABLE';
  end if;

  -- El estado no prueba que nunca hubo dinero: un adeudo SEPA devuelto por el banco
  -- vuelve a PENDIENTE o FALLIDO conservando su fecha de cobro, y un ANULADO puede
  -- haber sido cobrado o devuelto antes. Si alguna huella de dinero real sigue ahí, no
  -- se borra (y con él, en cascada, el libro de devoluciones).
  if v_r.fecha_cobro is not null
     or v_r.fecha_devolucion is not null
     or coalesce(v_r.importe_devuelto, 0) > 0
     or v_r.reembolso_stripe_id is not null
     or coalesce(v_r.entrega_aplicada, false)
     or v_r.conciliado_en is not null
     or exists (select 1 from public.devoluciones d where d.recibo_id = p_recibo_id) then
    raise exception 'TIENE_COBRO_PREVIO';
  end if;

  -- Un enlace de pago o un cobro de mostrador abiertos aún pueden completarse; sin
  -- recibo, ese dinero no tendría a qué asociarse. Un intento FALLIDO (solo el
  -- PaymentIntent) ya no puede completarse.
  if v_r.checkout_session_id is not null
     or v_r.cobro_mostrador_checkout_session_id is not null
     or v_r.cobro_mostrador_pi is not null
     or (v_r.stripe_payment_intent_id is not null and v_r.estado <> 'FALLIDO') then
    raise exception 'PAGO_ASOCIADO';
  end if;

  if exists (select 1 from public.facturas f where f.recibo_id = p_recibo_id) then
    raise exception 'TIENE_FACTURA';
  end if;
  if exists (select 1 from public.penalizaciones p where p.recibo_id = p_recibo_id) then
    raise exception 'ES_PENALIZACION';
  end if;

  -- Variable LOCAL a esta transacción: la lee el trigger de auditoría del DELETE.
  perform set_config('tentare.motivo_auditoria', p_motivo, true);

  delete from public.recibos where id = p_recibo_id and studio_id = p_studio_id;

  -- Y se limpia al terminar: que un motivo no pueda «viajar» a otro cambio que se
  -- haga después en la misma transacción.
  perform set_config('tentare.motivo_auditoria', '', true);
end;
$$;

-- El default de Supabase da EXECUTE directo a anon: fuera PUBLIC y anon; la llama
-- el panel con la sesión de la persona.
revoke all on function public.eliminar_recibo(text, text, text) from public, anon;
grant execute on function public.eliminar_recibo(text, text, text) to authenticated;

-- ── Se quita el borrado directo ────────────────────────────────────────────
drop policy if exists recibos_escritura_delete on public.recibos;
revoke delete on table public.recibos from authenticated;

-- ── Ni por la puerta de atrás ──────────────────────────────────────────────
-- `recibos.socio_id` es ON DELETE CASCADE: quien podía borrar una clienta por REST
-- (PROPIETARIA, RECEPCIÓN y GERENCIA, con `socios_escritura_delete`) se llevaba sus
-- recibos, cobrados incluidos, sin motivo y sin las guardas de la RPC. El panel no
-- lo usa: la baja va por `/api/socios/eliminar` (service-role), que no cambia.
drop policy if exists socios_escritura_delete on public.socios;
revoke delete on table public.socios from authenticated;

-- ── Comprobación al aplicar ────────────────────────────────────────────────
do $$
begin
  if has_function_privilege('anon', 'public.eliminar_recibo(text, text, text)', 'EXECUTE') then
    raise exception 'eliminar_recibo() es ejecutable por anon';
  end if;
  if not has_function_privilege('authenticated', 'public.eliminar_recibo(text, text, text)', 'EXECUTE') then
    raise exception 'eliminar_recibo() no es ejecutable por authenticated';
  end if;
  if has_table_privilege('authenticated', 'public.recibos', 'DELETE') then
    raise exception 'authenticated todavía puede borrar recibos directamente';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recibos' and cmd in ('DELETE', 'ALL')) then
    raise exception 'recibos todavía tiene una política de borrado';
  end if;
  if has_table_privilege('authenticated', 'public.socios', 'DELETE') then
    raise exception 'authenticated todavía puede borrar clientas directamente';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'socios' and cmd in ('DELETE', 'ALL')) then
    raise exception 'socios todavía tiene una política de borrado';
  end if;
  if has_function_privilege('anon', 'public.auditar_cambio_dinero()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.auditar_cambio_dinero()', 'EXECUTE') then
    raise exception 'auditar_cambio_dinero() es ejecutable por un cliente';
  end if;
end;
$$;

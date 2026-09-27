-- ════════════════════════════════════════════════════════════════════════════
-- Auditoría: un mismo cargo se anota UNA vez
-- ════════════════════════════════════════════════════════════════════════════
--
-- Cuarto paso de la auditoría de dinero del estudio. «Cobrar online» y aprobar un
-- cobro en Automatizaciones (`COBRO_LANZADO`, lib/auditoria/cobro-manual.ts) ya
-- dejan en el libro quién lanzó el cargo.
--
-- Un doble clic llega a Stripe dos veces y este devuelve el MISMO PaymentIntent (la
-- clave de idempotencia lleva el recibo y el nº de intento). Si los dos clics llegan
-- A LA VEZ, los dos leen el recibo pendiente antes de que ninguno lo cierre y los dos
-- anotarían el mismo cargo: dos entradas idénticas en un libro que no se puede
-- corregir. Como con el reembolso (20260925194043), lo rechaza un índice único, y el
-- helper (lib/auditoria/registrar-servidor.ts) da el 23505 por «ya estaba».
--
-- Un reintento después de un rechazo es OTRO intento (clave nueva → otro
-- PaymentIntent) y no choca. `despues` solo lleva las columnas que CAMBIAN: si el
-- recibo ya tenía ese `stripe_payment_intent_id` antes del cobro (un reintento con la
-- misma clave), no aparece en `despues`, y los NULL no chocan entre sí: ahí no hay
-- deduplicación. Es un caso raro y el precio es una entrada de más, no una de menos.
-- Y el caso «el dinero entró y el recibo no cambió» ni siquiera se anota (ver la
-- cabecera de cobro-manual.ts).
--
-- Aditiva: un índice sobre una tabla de pocas filas. No cambia grants, RLS ni triggers.

create unique index if not exists auditoria_estudio_cobro_unico_idx
  on public.auditoria_estudio (studio_id, fila_id, (despues ->> 'stripe_payment_intent_id'))
  where origen = 'servidor' and contexto ->> 'accion' = 'COBRO_LANZADO';

-- ── Comprobación al aplicar (no fiarse del comentario SQL) ─────────────────
do $$
begin
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and tablename = 'auditoria_estudio'
                    and indexname = 'auditoria_estudio_cobro_unico_idx') then
    raise exception 'falta el índice único del cobro';
  end if;
  -- Y el del reembolso, de la migración anterior, sigue ahí.
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and tablename = 'auditoria_estudio'
                    and indexname = 'auditoria_estudio_reembolso_unico_idx') then
    raise exception 'falta el índice único del reembolso';
  end if;
end;
$$;

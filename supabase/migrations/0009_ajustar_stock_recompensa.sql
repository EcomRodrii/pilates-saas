-- ═══════════════════════════════════════════════════════════════════════════
-- 0009 · A-13: decremento ATÓMICO del stock de recompensas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (due diligence, hallazgo A-13)
-- El canje decrementaba el stock con read-modify-write en JS
-- (supabase-data.ts: `update reward_catalog set stock = item.stock - 1`),
-- leyendo item.stock de un snapshot. Dos canjes concurrentes del último ítem
-- leen stock=1, ambos pasan la validación y ambos escriben stock=0 → se canjea
-- dos veces un premio de stock 1 (oversell), y el stock puede quedar negativo
-- (no había CHECK). supabase-js no soporta updates relativos a columna, así que
-- —como en ajustar_creditos— se usa una RPC atómica.
--
-- ajustar_stock(p_delta): claim = -1 (falla con SIN_STOCK si dejaría el stock
-- por debajo de 0), refund = +1. Solo aplica a ítems con stock limitado
-- (stock not null); los de stock ilimitado (null) no llaman a la RPC.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ajustar_stock(
  p_item_id text,
  p_studio_id text,
  p_delta integer
) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare v_stock int;
begin
  -- Aislamiento por estudio en llamadas autenticadas (panel); la service-role
  -- (endpoints públicos) no tiene auth.uid() y se salta el check.
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
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
$$;

-- Sana cualquier stock negativo que el bug de oversell (read-modify-write) haya
-- podido dejar, para que el CHECK siguiente pueda crearse sin fallar en prod.
UPDATE public.reward_catalog SET stock = 0 WHERE stock < 0;

-- CHECK de respaldo: el stock nunca es negativo (defensa en profundidad).
ALTER TABLE public.reward_catalog
  DROP CONSTRAINT IF EXISTS reward_catalog_stock_no_negativo;
ALTER TABLE public.reward_catalog
  ADD CONSTRAINT reward_catalog_stock_no_negativo CHECK (stock IS NULL OR stock >= 0);

-- Permisos: authenticated (panel) + service_role (endpoints públicos). NO anon
-- (lección de C-1: las funciones SECURITY DEFINER concedidas a anon son un
-- agujero cross-tenant). CREATE OR REPLACE va antes del REVOKE para fijar la ACL.
REVOKE EXECUTE ON FUNCTION public.ajustar_stock(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_stock(text, text, integer) TO authenticated, service_role;

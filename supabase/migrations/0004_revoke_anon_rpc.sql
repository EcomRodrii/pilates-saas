-- ═══════════════════════════════════════════════════════════════════════════
-- 0004 · C-1: cerrar las RPCs SECURITY DEFINER expuestas al rol `anon`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (due diligence, hallazgo C-1)
-- El dump base (0000_base.sql) concede EXECUTE a `anon` sobre cuatro funciones,
-- tres de ellas SECURITY DEFINER (saltan RLS). Como la `anon key` es pública
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY, embebida en el bundle del navegador) y
-- PostgREST expone `public.*` en /rest/v1/rpc, CUALQUIERA podía llamarlas sin
-- autenticarse y a través de fronteras de estudio:
--   · ajustar_creditos     → inflar/vaciar créditos de cualquier socia de
--                            cualquier estudio (no tenía NINGÚN check).
--   · cancelar_reserva_plaza (p_socio_id NULL salta el check de propiedad) →
--                            cancelar cualquier reserva de cualquier estudio.
--   · reservar_plaza        → crear reservas arbitrarias (el guard por estudio
--                            se salta cuando auth.uid() es NULL, como en anon).
--   · crear_reserva_atomica → código muerto (INVOKER; hoy lo frena RLS), se
--                            revoca por higiene.
--
-- Ningún llamador legítimo usa el rol `anon`:
--   · El panel llama estas RPCs con el JWT del staff (rol `authenticated`).
--   · Los endpoints públicos las llaman con la service-role (getSupabaseAdmin).
-- Por tanto revocar `anon` no rompe ningún flujo.
--
-- Además se añade a `ajustar_creditos` el MISMO aislamiento por estudio que ya
-- tienen reservar_plaza / cancelar_reserva_plaza: una llamada autenticada solo
-- puede tocar su propio estudio; la service-role (auth.uid() NULL) se salta el
-- check a propósito porque el endpoint de servidor ya validó la identidad.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Defensa en profundidad: aislamiento por estudio dentro de ajustar_creditos.
--    (Reemplazo idéntico al original + guard al inicio; conserva firma, tipo de
--    retorno, LANGUAGE y SECURITY DEFINER. Va ANTES del REVOKE porque
--    CREATE OR REPLACE preserva la ACL existente: revocamos al final para fijar
--    el estado final con independencia del orden de evaluación.)
CREATE OR REPLACE FUNCTION public.ajustar_creditos(
  p_socio_id text,
  p_studio_id text,
  p_delta_saldo integer,
  p_delta_ganado integer,
  p_delta_canjeado integer
) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare v_saldo int;
begin
  -- Aislamiento por negocio en llamadas autenticadas (panel). Las de
  -- service-role (endpoints de servidor) no tienen auth.uid() y se saltan el
  -- check — la identidad ya se validó en la ruta.
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
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
$$;

-- 2) Revocar EXECUTE de PUBLIC **y** de anon.
--    IMPORTANTE: al crear una función, Postgres concede EXECUTE a PUBLIC por
--    defecto, y `anon` es miembro de PUBLIC — revocar solo de `anon` NO cierra
--    el acceso (lo conservaría vía PUBLIC). Revocando de PUBLIC, los roles
--    `authenticated` y `service_role` mantienen acceso por su GRANT explícito
--    (0000_base.sql), que es justo lo que queremos.
REVOKE EXECUTE ON FUNCTION public.ajustar_creditos(text, text, integer, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reservar_plaza(text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancelar_reserva_plaza(text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crear_reserva_atomica(text, text, text, text, text) FROM PUBLIC, anon;

-- NOTA (seguimiento, fuera del alcance de C-1):
--   · M-4: `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon` en
--     0000_base.sql:~3896/3906 sigue haciendo que toda tabla FUTURA nazca
--     accesible por anon. Revisar en una migración aparte.
--   · C-9: `public_read_studios USING(true)` filtra la fila completa de studios
--     (NIF, Stripe, suscripción). Requiere una vista de solo-branding.
--   · C-7: supabase/schema.sql (fuente del generador de tipos) NO refleja este
--     cambio; reconciliar como parte del arreglo de la fuente de verdad.

-- CRÍTICO: reservar_numero_factura es SECURITY DEFINER (bypasa RLS) y estaba
-- concedida a `anon` por el mismo motivo que reservar_cita (migración
-- 20260729154500): ALTER DEFAULT PRIVILEGES concede EXECUTE a `anon` de forma
-- DIRECTA a toda función nueva, y esta nunca se revocó.
--
-- Peor que reservar_cita: esta función INSERTA directamente una fila en
-- `facturas` con un número correlativo real y su hueco en la cadena de huellas
-- Veri*Factu (verifactu_seq/verifactu_prev_hash) — con la anon key pública,
-- cualquiera podía forjar una "factura" fiscal para CUALQUIER estudio con
-- importes/receptor arbitrarios, o corromper la secuencia correlativa
-- exigida por la AEAT. No tiene ningún llamador en el código actual (el
-- sellado real usa un INSERT directo en lib/billing/sellar-factura-server.ts,
-- no esta RPC) — huérfana y expuesta, la combinación más peligrosa posible.

revoke execute on function public.reservar_numero_factura(text, text, text, date, text, text, numeric, numeric, numeric, numeric) from public, anon;

-- Barrido del resto de RPCs con EXECUTE para `anon`: se comprobó cada una
-- (proceso documentado en el hallazgo de esta sesión) — todas las demás son
-- SECURITY INVOKER (corren con los privilegios del llamante), así que la RLS
-- real de cada tabla (studio_id = current_studio_id(), que anon nunca
-- satisface) las bloquea aunque EXECUTE esté concedido. No se tocan aquí
-- porque no son explotables, pero queda como nota: sería más limpio revocarles
-- EXECUTE también y no depender de que nadie cambie su RLS por error en el
-- futuro — follow-up de higiene, no de seguridad urgente.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0027 · Consumo atómico de sesión de bono (arregla sobre-consumo concurrente)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Cambia el ESQUEMA de producción (RPC nueva). No toca datos ni tablas.
--
-- BUG (auditoría R2)
-- `consumirBonoServidor` (lib/supabase-data.ts) hacía read-modify-write y escribía
-- el valor ABSOLUTO `sesiones_restantes = restantes - 1`, fuera de cualquier lock.
-- N reservas concurrentes de la misma socia leen el mismo saldo M y escriben todas
-- M-1 → solo se descuenta 1 crédito para N clases (ingreso perdido).
--
-- FIX
-- Decremento atómico y condicional en una sola sentencia. El lock de fila del
-- UPDATE serializa las llamadas concurrentes; el guard `> 0` impide bajar de 0.
-- Devuelve el nuevo saldo, o NULL si no había sesión que consumir (carrera perdida
-- o suscripción sin saldo) — el llamador lo trata como "no se pudo consumir".
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.consumir_sesion_bono(p_suscripcion_id text, p_studio_id text)
returns integer
language sql security definer
set search_path = public
as $$
  update public.suscripciones
     set sesiones_restantes = sesiones_restantes - 1
   where id = p_suscripcion_id
     and studio_id = p_studio_id
     and sesiones_restantes > 0
  returning sesiones_restantes;
$$;

revoke execute on function public.consumir_sesion_bono(text, text) from public, anon;
grant  execute on function public.consumir_sesion_bono(text, text) to authenticated, service_role;

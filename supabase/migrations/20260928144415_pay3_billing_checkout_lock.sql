-- Auditoría 62ª pasada (PAY-3). La clave de idempotencia de Stripe en
-- /api/billing/checkout lleva un bucket de minuto a propósito (no se puede
-- quitar sin más: una clave estable haría que reintentar el alta HORAS después
-- —con la suscripción anterior ya cancelada— devolviera la sesión vieja y
-- caducada que Stripe sigue recordando hasta 24h). `checkoutPrevio()`
-- (lib/billing/checkout-saas-previo.ts, PAY-5) ya cierra el caso real de dos
-- peticiones separadas por más de un minuto: pregunta a Stripe y reutiliza la
-- sesión abierta en vez de crear otra. Lo que sigue abierto es la rendija
-- estrecha que ni el bucket ni checkoutPrevio pueden cerrar solos: dos
-- peticiones CASI simultáneas (doble clic, dos pestañas) que además caen en
-- minutos distintos — las dos ven "sin sesión abierta" en checkoutPrevio antes
-- de que ninguna haya creado la suya, y las dos crean una Checkout Session real.
--
-- Cerrojo de una fila por estudio (compare-and-set), no `pg_advisory_lock`:
-- mismo motivo que verifactu_transmision_lock (20260910110345) — supabase-js
-- no garantiza que dos `.rpc()` caigan en la misma conexión pooled de
-- Postgres, así que lock/unlock de sesión no es fiable desde aquí.
--
-- Expira a los 30 s: de sobra para las llamadas a Stripe de esta ruta
-- (list + create, normalmente <1 s), muy por debajo del timeout de la función.
-- Un cuelgue real (timeout de Vercel, crash) libera el cerrojo solo pasados
-- 30 s en vez de dejarlo atascado para siempre.
--
-- Verificado en vivo (transacción revertida): primer intento adquiere,
-- un segundo en vuelo falla, tras liberar vuelve a adquirir, y un cerrojo
-- huérfano de >30 s se recupera solo.

create table if not exists public.billing_checkout_locks (
  clave text primary key,
  en_curso boolean not null default false,
  iniciado_en timestamptz
);

comment on table public.billing_checkout_locks is
  'Cerrojo de una fila por estudio/cadena (compare-and-set) para que dos peticiones casi simultáneas a /api/billing/checkout no creen dos Checkout Sessions reales. PAY-3, 62ª pasada.';

alter table public.billing_checkout_locks enable row level security;

-- Solo el propio endpoint (service_role) — mismo criterio que webhook_events
-- y verifactu_transmision_lock: control-plane, nunca de cliente.
revoke all on public.billing_checkout_locks from public, anon, authenticated;

create or replace function public.reclamar_checkout_lock(
  p_clave text,
  p_expira_segundos int default 30
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_reclamado boolean;
begin
  insert into public.billing_checkout_locks (clave, en_curso, iniciado_en)
    values (p_clave, true, now())
  on conflict (clave) do update
    set en_curso = true, iniciado_en = now()
    where billing_checkout_locks.en_curso = false
       or billing_checkout_locks.iniciado_en < now() - (p_expira_segundos || ' seconds')::interval
  returning true into v_reclamado;

  return coalesce(v_reclamado, false);
end;
$function$;

-- Libera el cerrojo. Solo tiene efecto sobre la fila que sigue en curso —no
-- pisa una reclamación nueva que haya expirado y vuelto a adquirirse.
create or replace function public.liberar_checkout_lock(p_clave text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  update public.billing_checkout_locks set en_curso = false where clave = p_clave;
$function$;

revoke all on function public.reclamar_checkout_lock(text, int) from public, anon, authenticated;
revoke all on function public.liberar_checkout_lock(text) from public, anon, authenticated;
grant execute on function public.reclamar_checkout_lock(text, int) to service_role, postgres;
grant execute on function public.liberar_checkout_lock(text) to service_role, postgres;

do $$
begin
  if has_function_privilege('anon', 'public.reclamar_checkout_lock(text, int)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reclamar_checkout_lock(text, int)', 'EXECUTE') then
    raise exception 'reclamar_checkout_lock quedó llamable por roles de cliente';
  end if;
  if has_function_privilege('anon', 'public.liberar_checkout_lock(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.liberar_checkout_lock(text)', 'EXECUTE') then
    raise exception 'liberar_checkout_lock quedó llamable por roles de cliente';
  end if;
end $$;

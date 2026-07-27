-- ─────────────────────────────────────────────────────────────────────────────
-- La otra mitad de la 0107.
--
-- Allí se cerraron las ESCRITURAS de la facturación y se dejaron las lecturas
-- abiertas a propósito, porque cerrarlas sin tocar la UI habría dejado pantallas
-- EN BLANCO en vez de ocultas: la instructora seguiría viendo la tarjeta de
-- "Ingresos cobrados este mes", ahora con un 0 € falso. Eso es peor que el
-- problema, porque además miente.
--
-- Ya está tocada la UI (mismo PR): el panel de inicio esconde ingresos, gráfica
-- y pagos pendientes para quien no lleva la caja. Así que ahora sí.
--
-- Lo que había: una instructora leía los 22 recibos del estudio. En una cadena
-- con 18 instructoras, eso es la cuenta de resultados del negocio repartida a 18
-- personas sin que nadie lo decidiera.
--
-- ── LO QUE NO SE CIERRA, Y POR QUÉ ──────────────────────────────────────────
-- `suscripciones` sigue siendo legible por todo el personal. No es un descuido:
-- el calendario necesita saber si a una clienta le quedan sesiones ANTES de
-- meterla en una clase (`tieneEntitlementActivo`), y eso lo hace la instructora
-- desde su propio panel. Cerrarlo rompería el aviso de "no tiene bono", que es
-- justo lo que evita que se cuelen clases gratis.
--
-- Un bono no es un importe: dice cuántas sesiones quedan, no cuánto se pagó.
-- ─────────────────────────────────────────────────────────────────────────────

-- Espejo en SQL de `puedeVerFinanzas` (lib/permisos-reglas.ts). Hoy coincide con
-- `puede_mover_dinero`, pero responde a otra pregunta y por eso va aparte: el
-- día que alguien tenga que consultar sin poder tocar, se cambia una sola.
create or replace function public.puede_ver_finanzas() returns boolean
  language sql stable security definer
  set search_path = public
  as $$
    select public.current_rol() in ('PROPIETARIO', 'RECEPCION');
  $$;

comment on function public.puede_ver_finanzas() is
  'Roles que pueden LEER facturación (recibos, facturas, ventas). El manager NO: lleva la sede, no la caja. Ver migración 0109.';

grant execute on function public.puede_ver_finanzas() to authenticated;

drop policy if exists recibos_lectura on public.recibos;
create policy recibos_lectura on public.recibos
  for select to authenticated
  using (studio_id = public.current_studio_id() and public.puede_ver_finanzas());

drop policy if exists facturas_lectura on public.facturas;
create policy facturas_lectura on public.facturas
  for select to authenticated
  using (studio_id = public.current_studio_id() and public.puede_ver_finanzas());

drop policy if exists ventas_pos_lectura on public.ventas_pos;
create policy ventas_pos_lectura on public.ventas_pos
  for select to authenticated
  using (studio_id = public.current_studio_id() and public.puede_ver_finanzas());

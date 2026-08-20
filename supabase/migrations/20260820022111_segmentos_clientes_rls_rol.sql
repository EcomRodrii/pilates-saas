-- Auditoría (PR #1276, tentare-seguridad + tentare-qa, mismo hallazgo por
-- las dos vías): la policy original de segmentos_clientes solo acotaba por
-- studio_id, sin condición de rol. INSTRUCTOR llega a /clientas (está en la
-- whitelist PERMITIDO_INSTRUCTOR de lib/permisos-reglas.ts) y podía crear,
-- renombrar o borrar segmentos guardados por PROPIETARIO/MANAGER/RECEPCION
-- dentro de su propio estudio — sin cruce entre estudios, pero sí un
-- permiso de escritura sobre una audiencia compartida que el comentario de
-- la migración original daba por cerrado con un guard de UI que no existía.
-- La RLS es la cerradura real, la UI nunca es el límite (lib/permisos-reglas.ts).
--
-- Mismo criterio que segmentos_clientes_por_estudio ya usaba para studio_id,
-- ahora con current_rol() (patrón ya establecido en intentos_reserva_fallidos
-- y otras tablas del repo).
drop policy if exists segmentos_clientes_por_estudio on public.segmentos_clientes;

create policy segmentos_clientes_por_estudio on public.segmentos_clientes
  for all to authenticated
  using (
    studio_id = public.current_studio_id()
    and public.current_rol() in ('PROPIETARIO', 'RECEPCION', 'MANAGER')
  )
  with check (
    studio_id = public.current_studio_id()
    and public.current_rol() in ('PROPIETARIO', 'RECEPCION', 'MANAGER')
  );

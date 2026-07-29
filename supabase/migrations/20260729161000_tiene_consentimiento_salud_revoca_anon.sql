-- Barrido de RPCs SECURITY DEFINER con EXECUTE para `anon` (sesión de
-- auditoría 2026-07-29, tras encontrar reservar_cita y reservar_numero_factura
-- expuestas del mismo modo). tiene_consentimiento_salud(p_socio_id) es
-- STABLE SECURITY DEFINER, solo lectura, sin llamadores en el código actual —
-- pero expuesta a `anon` permite averiguar sin sesión si una socia (dado su
-- id) dio consentimiento de salud: filtración de un metadato binario por
-- enumeración de ids. Severidad baja (no expone la ficha clínica en sí, ni
-- está conectada a ningún flujo real hoy), pero gratis de cerrar.
revoke execute on function public.tiene_consentimiento_salud(text) from public, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Segunda pasada sobre `20260914080445_socios_datos_privados_cierre.sql`: tras
-- cerrar el SELECT de tabla completa a `authenticated` y sustituirlo por un
-- GRANT de columnas concretas, aparecieron columnas de uso legítimo por el
-- cliente que se habían quedado fuera de la lista (rompiendo pantallas que sí
-- necesitan leerlas por su cuenta, no vía admin): `auth_user_id` (para que la
-- propia socia se reconozca en su fila), `aceptacion_version` y
-- `excluir_de_perfilado`, y `consentimiento_salud_registrado_por_uid`.
--
-- Al reescribir la lista completa a mano se coló un error: se volvió a incluir
-- `consentimiento_salud_texto` y `consentimiento_marketing_texto` — las dos
-- columnas que `080445` excluía a propósito por ser el TEXTO LEGAL completo de
-- un consentimiento de salud/marketing, no solo la fecha. Ningún camino de
-- cliente (rol `authenticated`) las necesita: todos sus usos reales en el
-- repo pasan por `getSupabaseAdmin()`/`requireSupabaseAdmin()` (service_role,
-- ajeno a los grants de columna). Corregido en la migración siguiente,
-- `20260914091809_socios_cierre_sin_columnas_de_mas.sql`.
-- ─────────────────────────────────────────────────────────────────────────────

revoke select on public.socios from authenticated;

grant select (
  id, studio_id, nombre, apellidos, email, telefono, fecha_alta, activo,
  lead_stage, tags, avatar, metodo_pago_preferido, cumple_mm_dd, foto_url,
  referido_por, origen_lead, campos_extra,
  aceptacion_fecha, aceptacion_origen, aceptacion_por, aceptacion_version,
  auth_user_id, excluir_de_perfilado,
  consentimiento_salud_fecha, consentimiento_salud_registrado_por,
  consentimiento_salud_registrado_por_uid, consentimiento_salud_revocado_en,
  consentimiento_salud_texto,
  consentimiento_marketing_en, consentimiento_marketing_por,
  consentimiento_marketing_texto,
  usuario, objetivo_clases_mes,
  borrado_en, visible_en_clase
) on public.socios to authenticated;

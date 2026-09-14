-- ─────────────────────────────────────────────────────────────────────────────
-- 60ª auditoría (14-sep-2026) — el PASO 3 de 3 que `20260914025903` anunció y
-- que no existía en el repo.
--
-- Aquella migración se declara «Paso 1 de 3 — ADITIVO, no quita nada a nadie» y
-- dice que un `..._socios_datos_privados_cierre.sql` revocaría después el
-- SELECT de tabla. El paso 2 (que el panel lea lo público de la tabla y lo
-- privado por la RPC) sí está hecho y desplegado — `fetchSociosPanel`,
-- lib/supabase-data.ts:5236. El paso 3 no se escribió, así que la fuga seguía
-- abierta con la migración dándose por buena.
--
-- Medido en producción el 14-sep, impersonando a una INSTRUCTORA real de
-- studio-1 (`set local role authenticated` + su `auth_user_id`):
--
--     puede_ver_datos_privados = false      ← la RPC sí falla cerrada
--     RPC socios_datos_privados → 0 filas   ← control positivo del paso 1
--     PERO: 32 socias con EMAIL legible, 16 con TELÉFONO, 7 con NIF,
--           4 con STRIPE_CUSTOMER, 11 con la FIRMA del contrato
--
-- Es el hallazgo del 14-ago sobre Network repetido en `socios`: la policy filtra
-- FILAS y no COLUMNAS, y el privilegio de tabla las da todas.
--
-- ⚠️ Método (lección del 14-ago, repetida el 25-ago): un `revoke` POR COLUMNA es
-- un NO-OP si existe el grant de TABLA. Lo correcto —y lo que este repo ya hace
-- para el UPDATE de esta misma tabla— es `revoke select on <tabla>` y después
-- `grant select (columnas)`. Se comprueba abajo con `has_column_privilege`,
-- nunca con el `success: true`.
--
-- La lista de columnas NO es una opinión nueva: es exactamente la que el panel
-- pide hoy (`fetchSociosPanel`), más `borrado_en` (lo usa su propio filtro
-- `.is('borrado_en', null)`, y filtrar por una columna exige SELECT sobre ella)
-- y `visible_en_clase` (la mapea `lib/supabase-data.ts:591`). Todo lo demás
-- —incluidos `consentimiento_salud_texto` y `consentimiento_marketing_texto`,
-- que el propio `FilaSocioPanel` ya excluye en TypeScript— deja de viajar al
-- navegador. Quien necesita lo privado lo pide por `socios_datos_privados()`,
-- que comprueba el rol.
-- ─────────────────────────────────────────────────────────────────────────────

revoke select on public.socios from authenticated;

grant select (
  id, studio_id, nombre, apellidos, email, telefono, fecha_alta, activo,
  lead_stage, tags, avatar, metodo_pago_preferido, cumple_mm_dd, foto_url,
  referido_por, origen_lead, campos_extra,
  aceptacion_fecha, aceptacion_origen, aceptacion_por,
  consentimiento_salud_fecha, consentimiento_salud_registrado_por,
  consentimiento_salud_revocado_en,
  consentimiento_marketing_en, consentimiento_marketing_por,
  usuario, objetivo_clases_mes,
  borrado_en, visible_en_clase
) on public.socios to authenticated;

-- ── Verificación: negativa Y positiva ────────────────────────────────────────
do $$
declare
  c text;
  v_privadas text[] := array[
    'nif', 'direccion', 'fecha_nacimiento', 'aceptacion_firma',
    'tarjeta_marca', 'tarjeta_ultimos4', 'tarjeta_exp_mes', 'tarjeta_exp_anio',
    'stripe_customer_id', 'stripe_payment_method_id',
    'sepa_mandate_id', 'sepa_payment_method_id',
    'consentimiento_salud_texto', 'consentimiento_marketing_texto'
  ];
  v_publicas text[] := array[
    'id', 'studio_id', 'nombre', 'apellidos', 'email', 'telefono', 'activo',
    'borrado_en', 'consentimiento_salud_fecha'
  ];
begin
  -- El grant de TABLA tiene que haber desaparecido, o todo lo de abajo miente.
  if has_table_privilege('authenticated', 'public.socios', 'SELECT') then
    raise exception 'authenticated conserva el SELECT de TABLA: el grant por columna sería un no-op';
  end if;

  foreach c in array v_privadas loop
    if has_column_privilege('authenticated', 'public.socios', c, 'SELECT') then
      raise exception 'authenticated sigue leyendo la columna privada %', c;
    end if;
  end loop;

  -- Control positivo: sin esto, un «denegado» no demuestra nada.
  foreach c in array v_publicas loop
    if not has_column_privilege('authenticated', 'public.socios', c, 'SELECT') then
      raise exception 'authenticated ha perdido la columna pública %: el panel dejaría de cargar', c;
    end if;
  end loop;

  -- Y el servidor sigue viéndolo todo (crons, Decision OS, exportación RGPD).
  if not has_table_privilege('service_role', 'public.socios', 'SELECT') then
    raise exception 'service_role ha perdido el SELECT de socios';
  end if;
end $$;

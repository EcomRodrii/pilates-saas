-- 20260910170000 · TENTARE — authenticated pierde UPDATE de tabla entera sobre
-- studios (pasa a whitelist explícita de columnas), y todo acceso de escritura
-- a cadenas
--
-- 53ª pasada de auditoría (2026-09-10), hallazgo H1 (🔴 crítico). Verificado
-- EN VIVO que la política RLS `owner_studios` (0000_base.sql) es FOR ALL sin
-- distinción de columna, y que `authenticated` tenía GRANT UPDATE sobre la
-- tabla `studios` ENTERA (grant de TABLA, no column-specific — confirmado en
-- `information_schema.role_table_grants`, no solo en la vista expandida
-- `column_privileges`). La fila-check de la RLS (`id = current_studio_id()`)
-- solo decide QUÉ FILA se puede tocar, nunca QUÉ COLUMNA — así que cualquier
-- propietaria autenticada podía hacer, por PostgREST/supabase-js directo con
-- su propio JWT (sin pasar por ningún endpoint de la app):
--
--   update studios set plan = 'CADENA', subscription_status = 'active'
--     where id = current_studio_id();
--
-- y desbloquear todas las features de pago sin que Stripe cobrara nada. O
-- enlazar su estudio a una `cadena_id` ajena sin ninguna comprobación de
-- pertenencia.
--
-- ⚠️ Intento previo descartado: `REVOKE UPDATE (col1, col2, ...) ON studios
-- FROM authenticated` es un NO-OP silencioso aquí — revocar un privilegio
-- column-specific no quita nada cuando el privilegio real concedido es de
-- TABLA COMPLETA (Postgres calcula el efectivo como la unión de ambos; el de
-- tabla sigue vivo). Detectado con dry-run BEGIN/ROLLCABK + has_column_privilege
-- antes de aplicar nada — el patrón correcto es revocar la tabla entera y
-- volver a conceder solo las columnas reales de la whitelist del cliente.
--
-- La whitelist de abajo es EXACTAMENTE la unión de las columnas que escriben
-- `dbUpdateStudioConfig` y `dbUpdateStudio` (lib/supabase-data.ts, únicos dos
-- callers de `.from('studios').update(...)` con el cliente `authenticated` —
-- todo lo demás en el repo usa `admin`/service_role: webhook de Stripe,
-- checkout, importador de tema, etc.). Ninguna de las 6 columnas de
-- billing/cadena (`plan`, `subscription_status`, `subscription_id`,
-- `stripe_customer_id`, `current_period_end`, `cadena_id`) aparece en esa
-- unión — el cliente legítimo nunca las toca, las escriben siempre el webhook
-- de Stripe o las funciones SECURITY DEFINER de migr 0066.
--
-- `cadenas`: TODA escritura real (checkout, webhook, guardar el layout de
-- cadena) pasa por `admin` (service_role) — `authenticated` no tiene ningún
-- caller legítimo de ESCRITURA. El SELECT sí hace falta y NO se toca: dos
-- políticas RLS de OTRAS tablas evalúan `EXISTS (SELECT 1 FROM cadenas ...)`
-- bajo el rol `authenticated` de verdad (no dentro de una función SECURITY
-- DEFINER) — `insert_studios` (el alta pública de un estudio, `dbCreateStudio`
-- en lib/supabase-data.ts, hecha con la sesión del propio usuario) y
-- `owner_cadena_tipos_clase` (20260807190524_cadena_tipos_clase_plantilla.sql).
-- Postgres comprueba el privilegio SELECT sobre toda tabla referenciada en una
-- política RLS al reescribir la consulta, aunque la rama que la usa nunca se
-- ejecute en tiempo real — revocar el SELECT entero habría roto el alta
-- pública de estudios para cualquier persona, no solo para un atacante.

revoke update on public.studios from authenticated;

grant update (
  nombre, nif, razon_social, direccion, ciudad, codigo_postal, sitio_web,
  normas_texto, email, telefono, color_primario, tema_portal,
  widget_dominios_autorizados, widget_builder, logo_url, iva_por_defecto,
  dep_umbral_alto, dep_umbral_medio, dep_ventana_dias, avatar_admin, foto_url,
  imagen_bienvenida_url, descripcion, anio_fundacion, creditos_nombre,
  creditos_caducan_meses, racha_clases_semana, cancelacion_ventana_horas,
  cancelacion_devolver_bono_tardia, recuperacion_caducidad_tipo,
  recuperacion_caducidad_dias, cancelacion_clase_devuelve_bono,
  reserva_exigir_plan, compra_publica_modo, reserva_max_simultaneas,
  reserva_ventana_minima_minutos, reserva_antelacion_maxima_dias,
  permite_lista_espera, hora_apertura, hora_cierre, requiere_aprobacion,
  valoracion_inicial_activa, lista_espera_plazo_aceptacion_minutos,
  minimo_asistentes_por_clase, penalizacion_importe_eur,
  penalizacion_aplica_cancelacion_tardia, penalizacion_aplica_no_show,
  penalizacion_cobro_automatico, reembolsos_activos, reembolso_plazo_dias,
  reembolso_solo_sin_usar, requiere_checkin_qr, bloquear_reserva_impago,
  recuperacion_auto_semanal, visible_en_network, stripe_account_id,
  onboarding_descartado_en, sepa_acreedor_id, sepa_iban, sepa_titular,
  bienvenida_vista_en, onb_centros, onb_software_anterior,
  onb_alumnos_activos, onb_importar_datos, onb_prioridad, onb_ayuda_alta,
  decision_contrato_visto_en, tour_visto_en, gestoria_envio_automatico,
  review_boost_mostrado_en, review_boost_pospuesto_en,
  review_boost_veces_mostrado, politica_privacidad, terminos_servicio
) on public.studios to authenticated;

revoke insert, update, delete on public.cadenas from authenticated;

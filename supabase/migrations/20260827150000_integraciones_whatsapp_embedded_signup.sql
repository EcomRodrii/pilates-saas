-- Fase D de la migración a Meta WhatsApp Embedded Signup v4 (ver WHATSAPP_AUDIT.md).
--
-- Solo `phone_number_id` sube a columna real (el resto de datos nuevos —
-- waba_id, business_id, display_phone_number, verified_name— se quedan
-- dentro de `config` jsonb, mismo patrón que token/phoneId/plantillaAprobada
-- que ya usa esta tabla para el resto de integraciones "campos").
--
-- Motivo de promoverla: el webhook entrante de Meta resuelve `studio_id` a
-- partir del `phone_number_id` del payload SIN sesión de usuario — esa
-- resolución necesita la garantía de unicidad de un índice, que config jsonb
-- no puede dar (un typo pegando el número a mano en dos estudios dejaría dos
-- filas con el mismo phoneId, y el webhook enrutaría eventos del negocio A al
-- negocio B).

alter table public.integraciones
  add column if not exists phone_number_id text;

comment on column public.integraciones.phone_number_id is
  'Solo tipo=WHATSAPP. phone_number_id de Meta — columna real (no config
   jsonb) porque el webhook entrante resuelve studio_id a partir de este
   valor sin sesión de usuario, y esa resolución necesita la garantía de
   unicidad de un índice. UNIQUE parcial: integraciones_whatsapp_phone_number_id_key.';

-- Único por tenant SOLO entre filas WHATSAPP con el campo relleno: no bloquea
-- NULL (resto de tipos de integración, o WhatsApp aún sin conectar).
create unique index if not exists integraciones_whatsapp_phone_number_id_key
  on public.integraciones (phone_number_id)
  where tipo = 'WHATSAPP' and phone_number_id is not null;

-- Sin política RLS nueva: owner_integraciones ya cubre todas las columnas de
-- la tabla (mismo criterio que 20260818142206_integraciones_salud.sql).
-- Sin GRANT/REVOKE nuevo: no se crea ninguna función SECURITY DEFINER aquí.

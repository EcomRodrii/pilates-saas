-- ─────────────────────────────────────────────────────────────────────────────
-- Descargas de recursos: la plantilla de /recursos a cambio del email.
--
-- Quien descarga una plantilla (la primera: la política de cancelación) deja su
-- email y, si quiere, su permiso para recibir novedades de Tentare. Es un lead
-- más, así que cae en `plataforma_lead` con `origen = 'DESCARGA'` y aparece en
-- el panel de Crecimiento sin tocar nada: nada de una tabla aparte que luego
-- haya que cruzar a mano cuando esa persona se da de alta.
--
-- El permiso para comunicaciones comerciales (LSSI art. 21) va en columnas
-- propias y no en `notas`, porque hay que poder DEMOSTRARLO:
--   · `consentimiento_texto` / `consentimiento_en`: qué casilla marcó y cuándo.
--     Descargar no es consentir: la casilla va aparte y sin marcar. El CHECK
--     impide un «sí» sin esas dos pruebas.
--   · `consentimiento_confirmado_en`: pulsó «Sí, quiero recibirlas» en el correo
--     (doble confirmación). El formulario es público y cualquiera puede escribir
--     el email de otra persona: sin esto, un «sí» no vale.
--   · `baja_en`: pidió no recibir más. Se guarda la fecha en vez de borrar el
--     consentimiento, para que quede el historial.
-- Se le puede escribir solo si `consentimiento_comercial` y
-- `consentimiento_confirmado_en` están puestos y no hay `baja_en` posterior.
--
-- `descargado_en`: abrió el enlace de la plantilla, que solo llega por correo.
-- Informativo (quién la usó de verdad); no es consentimiento de nada.
--
-- De paso, el CHECK de `origen` gana 'NETWORK_ESTUDIO' y 'NETWORK_CIUDAD', que
-- `app/api/network/interes/route.ts` inserta desde hace semanas y que el CHECK
-- rechazaba: el aviso a soporte salía, pero el lead no se guardaba (medido el
-- 25-sep: 2 filas en la tabla, las dos 'ALTA'). Postgres no sabe añadir un valor
-- a un CHECK, así que se recrea entero, con todos los de antes.
--
-- Sin cambios de permisos: la tabla sigue con RLS activa y cero políticas (0136);
-- solo entra el service-role.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.plataforma_lead
  add column if not exists recurso                      text,
  add column if not exists consentimiento_comercial     boolean not null default false,
  add column if not exists consentimiento_texto         text,
  add column if not exists consentimiento_en            timestamptz,
  add column if not exists consentimiento_confirmado_en timestamptz,
  add column if not exists baja_en                      timestamptz,
  add column if not exists descargado_en                timestamptz;

alter table public.plataforma_lead drop constraint if exists plataforma_lead_consentimiento_check;
alter table public.plataforma_lead add constraint plataforma_lead_consentimiento_check
  check (not consentimiento_comercial or (consentimiento_texto is not null and consentimiento_en is not null));

alter table public.plataforma_lead drop constraint if exists plataforma_lead_origen_check;
alter table public.plataforma_lead add constraint plataforma_lead_origen_check
  check (origen in (
    'CONCIERGE', 'ALTA', 'SOPORTE', 'MANUAL', 'REFERIDO', 'IMPORT_PROSPECTOS',
    'NETWORK_ESTUDIO', 'NETWORK_CIUDAD', 'DESCARGA'
  ));

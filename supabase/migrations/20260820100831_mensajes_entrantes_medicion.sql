-- Instrumentación de medición (auditoría vs Momence, "bandeja de entrada
-- bidireccional" — antes de construir el inbox completo, medir si de verdad
-- hace falta: hoy no existe NINGÚN dato de cuántas socias responden a un
-- mensaje saliente de Tentare, ni por qué canal — ni siquiera un webhook
-- dormido en ningún canal, confirmado por grep exhaustivo).
--
-- Solo WhatsApp/SMS vía Twilio: es la única integración de PLATAFORMA (una
-- cuenta compartida por todos los estudios, TWILIO_ACCOUNT_SID/
-- TWILIO_WHATSAPP_FROM en env, ver lib/twilio.ts) — un solo webhook capta
-- mensajes entrantes de todos los estudios sin que cada uno configure nada,
-- a diferencia de WhatsApp Business (Meta), que es credencial por estudio.
--
-- DELIBERADAMENTE sin studio_id/socio_id: como TWILIO_WHATSAPP_FROM es un
-- único número para toda la plataforma, resolver a qué estudio pertenece un
-- mensaje entrante exige cruzar el número de origen contra socios.telefono
-- de TODOS los estudios — ambiguo si dos socias de estudios distintos
-- comparten número, y no hace falta resolverlo para el propósito de esta
-- tabla (contar volumen). Ese cruce, si algún día hace falta, se hace en el
-- momento del análisis por SQL, no al escribir.
--
-- Sin UI, sin RLS para authenticated/anon a propósito: nadie del panel debe
-- ver esto todavía — es una tabla de análisis interno, consultada
-- directamente vía SQL durante la ventana de medición (2-3 semanas). Cuando
-- se decida si el inbox completo se construye, esta tabla se hereda o se
-- borra según el resultado.
create table if not exists public.mensajes_entrantes_medicion (
  id text primary key,
  canal text not null check (canal in ('WHATSAPP', 'SMS')),
  de_numero text not null,
  para_numero text not null,
  cuerpo text,
  twilio_sid text not null unique,
  creado_en timestamptz not null default now()
);

create index if not exists idx_mensajes_entrantes_medicion_fecha
  on public.mensajes_entrantes_medicion (creado_en desc);

comment on table public.mensajes_entrantes_medicion is
  'Instrumentación temporal (auditoría vs Momence, "bandeja bidireccional"): mide volumen real de respuestas entrantes de WhatsApp/SMS antes de comprometerse a construir un inbox completo. Sin studio_id (número Twilio compartido por toda la plataforma) — resolución de socia/estudio se hace en el análisis, no al escribir. Solo escribe el webhook con service-role.';

alter table public.mensajes_entrantes_medicion enable row level security;
-- Sin ninguna policy: RLS activo + cero policies = cero acceso desde
-- authenticated/anon, en cualquier estudio. Solo service_role (el webhook)
-- puede leer/escribir — mismo criterio "deny by default" que el resto del
-- catálogo desde 20260724123319_revoke_grants_deny_by_default.

-- Paso 5 de docs/marketing-integrations-arquitectura.md §8/§7. Consentimiento
-- de marketing por email, ART. 7.4 RGPD: debe ser ESPECIFICO, no puede ir
-- empaquetado con la aceptacion del contrato general (socios.aceptacion_*).
-- Mismo patron que consentimiento_salud_* (art. 9): vive en socios (una fila
-- por persona), no en notification_preference (esa tabla exige user_id de
-- auth.users, y muchas socias con ficha nunca reclaman cuenta).
alter table public.socios
  add column if not exists consentimiento_marketing_en timestamptz,
  add column if not exists consentimiento_marketing_texto text,
  add column if not exists consentimiento_marketing_por text;

comment on column public.socios.consentimiento_marketing_en is
  'Cuando la socia dio consentimiento especifico (art. 7.4 RGPD, separado del contrato general) para recibir marketing por email. NULL = no lo ha dado, ninguna campana ni automatizacion de marketing debe alcanzarla.';
comment on column public.socios.consentimiento_marketing_texto is
  'Texto COMPLETO que acepto (lib/legal-textos.ts textoConsentimientoMarketing), no un numero de version - se compara contra el texto vigente para saber si sigue siendo valido, mismo patron que socios.aceptacion_version.';
comment on column public.socios.consentimiento_marketing_por is
  'Quien lo recogio: SOCIA si lo dio ella misma, o el nombre de quien del estudio lo registro en su nombre.';

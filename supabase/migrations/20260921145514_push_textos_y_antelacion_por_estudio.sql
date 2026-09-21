-- ─────────────────────────────────────────────────────────────────────────────
-- El estudio decide el TEXTO de los avisos que reciben sus alumnas y CUÁNDO les
-- llega el recordatorio de clase.
--
-- 1. Antelación del recordatorio (antes fija en 24 h y 1 h, `FRANJAS_RECORDATORIO`).
--    Valores cerrados, no libres: el barrido corre cada 15 min y cada franja
--    necesita su anchura para no saltarse clases; un valor arbitrario (37 min)
--    no tiene franja probada. Default = lo de hoy.
--
-- 2. `notification_template`: la tabla existía desde la 0092 y NADIE la leía.
--    La 20260805195400 le quitó la política de escritura a propósito («quien
--    conecte plantillas por estudio decide quién escribe»). Se decide ahora:
--    SOLO la propietaria, el mismo criterio que `plantillas_email`
--    (`admin_plantillas_email`, migr 20260811005749). Es el texto que ve cada
--    alumna en su móvil: la instructora no lo reescribe.
-- ─────────────────────────────────────────────────────────────────────────────
set lock_timeout = '5s';

alter table public.studios
  add column if not exists recordatorio_largo_horas smallint not null default 24,
  add column if not exists recordatorio_corto_minutos smallint not null default 60;

alter table public.studios drop constraint if exists studios_recordatorio_largo_horas_check;
alter table public.studios add constraint studios_recordatorio_largo_horas_check
  check (recordatorio_largo_horas in (12, 24, 48));
alter table public.studios drop constraint if exists studios_recordatorio_corto_minutos_check;
alter table public.studios add constraint studios_recordatorio_corto_minutos_check
  check (recordatorio_corto_minutos in (30, 60, 120));

-- `authenticated` escribe `studios` por lista blanca de columnas (migr 20260910171150).
grant update (recordatorio_largo_horas, recordatorio_corto_minutos) on public.studios to authenticated;

-- ── Plantillas de aviso por estudio ──────────────────────────────────────────
-- Largo máximo: lo que cabe en la notificación de un móvil sin cortarse a
-- media frase. Vacío no: un push sin texto no dice nada.
alter table public.notification_template drop constraint if exists notification_template_title_largo;
alter table public.notification_template add constraint notification_template_title_largo
  check (char_length(btrim(title_tpl)) between 1 and 80);
alter table public.notification_template drop constraint if exists notification_template_body_largo;
alter table public.notification_template add constraint notification_template_body_largo
  check (char_length(btrim(body_tpl)) between 1 and 240);

drop policy if exists template_write on public.notification_template;
create policy template_write on public.notification_template
  for all to authenticated
  using ((select public.current_rol()) = 'PROPIETARIO' and studio_id = (select public.current_studio_id()))
  with check ((select public.current_rol()) = 'PROPIETARIO' and studio_id = (select public.current_studio_id()));

-- La 0092 dio los cuatro privilegios a `authenticated` y a `anon` por el ACL por
-- defecto. `anon` no tiene nada que hacer aquí.
revoke all on table public.notification_template from anon;

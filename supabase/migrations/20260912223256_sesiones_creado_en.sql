-- ─────────────────────────────────────────────────────────────────────────────
-- `sesiones` gana cuándo se CREÓ cada clase.
--
-- Hasta ahora la tabla solo sabía cuándo EMPIEZA una clase (`inicio`), no cuándo
-- la programó alguien. Con eso se puede responder «¿este estudio tiene
-- horario?» pero nunca «¿cuánto tardó en montarlo?» — y ese es justo el paso del
-- embudo donde se cae la mitad de los estudios (6 de 13 con alguna clase, a
-- 12-sep-2026). Sin esta columna no hay forma de saber si `PrimerHorario`
-- (#1767) o la guía (#1877) acortan ese tiempo.
--
-- La ausencia ya costó un bug: `/api/interno/kpis` pedía `sesiones.creado_en`
-- dando por hecho que existía, PostgREST respondía 400 y el panel interno contó
-- CERO clases en toda la plataforma (#1892).
--
-- ── Por qué en DOS pasos y no `add column ... default now()` ─────────────────
-- En Postgres, añadir una columna con DEFAULT rellena las filas que ya existen
-- con ese valor. Con `now()` eso estamparía la fecha de ESTA migración en todas
-- las clases de la historia: un estudio que montó su horario en julio aparecería
-- creado hoy, y cualquier medición de «tiempo hasta la primera clase» saldría
-- falsa justo en el dato de partida. Una fecha inventada es peor que no tenerla.
--
-- Así que primero la columna sin default (las filas viejas quedan NULL = «no se
-- sabe») y después el default, que solo afecta a las filas nuevas.
--
-- ── Quién la rellena ─────────────────────────────────────────────────────────
-- La base, siempre. Los dos caminos de alta desde TypeScript (`sesionToDb` en
-- lib/supabase-data.ts y el importador de `app/api/clases/import`) mandan una
-- lista explícita de columnas que no la incluye, así que cae el default. La
-- restauración de copias (`restaurar_backup`) hace `select *` sobre la copia: una
-- copia anterior a esta migración no trae la clave y deja NULL, y una posterior
-- la conserva — que es lo correcto en los dos casos.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.sesiones add column if not exists creado_en timestamptz;
alter table public.sesiones alter column creado_en set default now();

comment on column public.sesiones.creado_en is
  'Cuándo se programó la clase (no cuándo empieza: eso es `inicio`). NULL = clase anterior a 2026-09-13, fecha desconocida.';

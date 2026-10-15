-- «Pedir mi app» (fase 1, 15-oct-2026): en qué punto va la app de tienda de cada estudio.
--
-- `activa` sigue siendo el único interruptor TÉCNICO (el endpoint de la entrada de la app y el
-- fichero de enlaces universales solo miran `activa = true`). `estado` es lo que se le cuenta al
-- estudio y lo que mueve quien tramita la petición desde /interno. Son cosas distintas a
-- propósito: una app puede estar EN_PREPARACION y aún no activa, o PAUSADA sin borrarla.
--
-- Una petición nueva nace PEDIDA y sin activar. La fila de «marta» (el piloto) pasa a EN_PRUEBAS.
-- La tabla sigue siendo solo del servidor (ver 20261013212437_apps_estudio.sql).

alter table public.apps_estudio
  add column if not exists estado text not null default 'PEDIDA',
  add column if not exists pedida_en timestamptz,
  add column if not exists url_tienda text,
  add column if not exists nota_interna text;

alter table public.apps_estudio add constraint apps_estudio_estado check (estado in ('PEDIDA','EN_PREPARACION','EN_PRUEBAS','EN_REVISION','PUBLICADA','PAUSADA'));
alter table public.apps_estudio add constraint apps_estudio_url_tienda check (url_tienda is null or url_tienda ~ '^https://apps\.apple\.com/');

update public.apps_estudio set estado = 'EN_PRUEBAS', pedida_en = creada_en where bundle_id = 'app.tentare.marta';

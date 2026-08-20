-- Widget Builder (Etapa 2): la última configuración del builder de snippets,
-- POR TIPO de widget ({ "clases": {...}, "embed-script": {...} }).
--
-- ⚠️ Esto NO es un "tema publicado": la config real viaja CONGELADA en el
-- snippet que la propietaria copia (query params / data-*), igual que Momence.
-- Esta columna solo evita perder lo configurado al recargar la pantalla del
-- panel — Momence lo pierde, nosotros no. Dato interno del panel: NO se añade
-- a studioPublico() (lista blanca) porque el público no lo necesita nunca.
alter table public.studios
  add column if not exists widget_builder jsonb not null default '{}'::jsonb;

comment on column public.studios.widget_builder is
  'Última config del Widget Builder por tipo de widget. Solo comodidad del panel: la config efectiva viaja congelada en el snippet copiado.';

-- TENTARE — la frase manuscrita de la home de la alumna.
--
-- Tercer texto de marca del estudio, junto a `lema` y `frase_heroe` (migr
-- 20260910201734). Sale de la guía de marca que mandó el fundador, donde
-- aparece en una tarjeta en color: «Un cuerpo feliz hace una mente tranquila».
--
-- La escribe cada estudio, por lo mismo que los otros dos: el portal es marca
-- blanca y una frase fija en el código serían trece estudios diciendo lo mismo.
-- NULL = esa tarjeta no se pinta.
--
-- ⚠️ El GRANT, otra vez y por lo mismo: desde
-- `20260910171150_studios_cadenas_revoca_columnas_billing.sql`, `authenticated`
-- no tiene UPDATE sobre la tabla entera sino lista blanca de columnas, y una
-- columna nueva NO entra sola. Verificado en vivo con BEGIN/ROLLBACK antes de
-- aplicar: tras el ALTER, `has_column_privilege(…,'frase_manuscrita','UPDATE')`
-- = false; tras el GRANT, true. Sin esto Configuración enseñaría su toast de
-- guardado sin escribir nada.

alter table public.studios
  add column if not exists frase_manuscrita text;

comment on column public.studios.frase_manuscrita is
  'Frase corta del estudio, pintada con la tipografía manuscrita en la home de la alumna. NULL = no se pinta.';

grant update (frase_manuscrita) on public.studios to authenticated;

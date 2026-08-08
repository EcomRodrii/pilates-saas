-- El interruptor para servir el portal nuevo (el kit de diseño en React,
-- `components/portal-tema/`) en lugar del actual, estudio por estudio.
--
-- ⚠️ ESTA COLUMNA TIENE FECHA DE CADUCIDAD, y es una condición explícita del
-- encargo: se enciende en UN estudio piloto; si pasa una semana sin
-- incidencias se enciende en el resto y se retira el portal viejo EN EL MISMO
-- PR que borra esta columna. Un flag sin fecha se queda para siempre y
-- acabamos manteniendo dos portales.
--
-- No se reutiliza `studios.tema_portal` para esto aunque suene parecido: esa
-- es el preset viejo de 6 opciones (migr 0006/0019), hoy 'original' en los 9
-- estudios y ya sustituida por `studio_theme`. Meterle un significado nuevo
-- sería falsear el origen del dato, que es justo lo que se descartó al
-- diseñar las penalizaciones.
--
-- Aditiva y con default: ningún estudio cambia de portal al aplicarla.

ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS portal_react boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN studios.portal_react IS
  'TEMPORAL. true = las socias de este estudio ven el portal en React (components/portal-tema). Se borra junto con el portal viejo cuando termine el despliegue por fases.';

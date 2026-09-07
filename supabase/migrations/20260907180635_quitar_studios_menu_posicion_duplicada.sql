-- Se retira `studios.menu_posicion` (20260907165827): era un sistema PARALELO
-- a algo que ya existía.
--
-- `lib/layout-runtime.ts` lleva desde hace tiempo `MENU_POSICIONES =
-- ['lateral','superior']`, con su tipo, su validación y su hueco en
-- `studio_layout` (`layout-schema.ts`). Estaba declarado y sin cablear —nadie
-- en `components/` lo leía—, así que al buscar «¿existe ya la posición del
-- menú?» no aparecía por ningún consumidor y se creó una columna nueva, encima
-- con OTROS valores ('izquierda'/'arriba') y un tipo `MenuPosicion` que
-- colisionaba de nombre con el que ya había.
--
-- Dos fuentes para el mismo ajuste es exactamente lo que este repo prohíbe. Se
-- queda la que ya estaba, que además viaja en el mismo `studio_layout` que el
-- orden del menú y el de la home — que es donde la propietaria los toca juntos.
--
-- Sin migración de datos: la columna se creó hoy, con default, y su único
-- consumidor se retira en este mismo cambio. No hay ningún estudio con un valor
-- elegido a mano que se pierda.

alter table public.studios drop constraint if exists studios_menu_posicion_valido;
alter table public.studios drop column if exists menu_posicion;

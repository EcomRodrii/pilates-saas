# Portal en React — dónde se quedó y cómo seguir

Estado: mergeado en `main` (#786) y ya **visible en el navegador** en
`/portal-tema-preview/{oliva,bloom,noir}`. Sigue sin estar conectado a datos
reales ni montado en la ruta del portal.

## Lo que está hecho y verificado

**El supuesto central del encargo es cierto, medido no supuesto**: de los 56
ficheros de cada proyecto React, solo difieren cuatro — `src/theme/config.ts`,
`src/theme/tokens.css`, `README.md` y `package.json`. Los dos últimos son
metadatos. Por eso aquí hay **una sola copia** del código y tres juegos de datos.

- `components/portal-tema/` — 39 ficheros: `components/` (ui, layout, blocks),
  `screens/` (12 pantallas), `store/`, `hooks/`, `styles/`, `data/`,
  `PortalApp.tsx` y `tipos-tema.ts`.
- `themes/{oliva,bloom,noir}/` — `config.ts` + `tokens.css` por tema.
- Los tres `tokens.css` convertidos de `:root` a `html[data-theme="…"]`, 103 tokens
  cada uno. Conviven en el bundle: cambiar de tema es cambiar un atributo, no
  cargar otra hoja.
- `themes/registro.ts` — `TEMAS_PORTAL`, y el mapeo de los controles de la
  propietaria (ver abajo).
- Imports reescritos a los alias de este repo, salvo los 5 del tema.

## La decisión que hay que respetar: los controles de la propietaria NO se retiran

`radioTema` y `escalaTexto` **no son variantes del tema**: son ajustes que la
propietaria ya toca desde Apariencia. Se traducen a tokens y sobreviven:

- `radioTema` → `--radius-card` / `--radius-button` / `--radius-chip` /
  `--radius-quick`.
- `escalaTexto` → **un factor único** sobre TODOS los `--size-*`, no un px por
  paso. El motivo no es estético: con un px suelto por paso se pierde la
  proporción interna que el tema trae resuelta, que es exactamente el
  «24-contra-30 sin criterio» que se arregló en la etapa 5.

Ambas se emiten en línea sobre el contenedor del portal, así pisan al bloque
`[data-theme]` por especificidad sin tocar su fichero.

Lo que **sí** se retira son las `variantes`: su papel lo hacen ahora los
`features` de cada tema (10 flags: `welcome_style`, `tab_bar_style`,
`detail_style`, `quick_links_style`…).

## Lo que falta, en orden

1. ~~**THEME desde contexto (5 ficheros).**~~ **HECHO.** `store/TemaContext.tsx`
   (`TemaProvider` + `useTema`), y `PortalApp` recibe el tema **como dato**
   (`tema: ThemeConfig`), sin importar `themes/` — así el código compartido no
   depende de los temas concretos, que es lo que permite que sea una sola copia
   y no tres.
   ⚠️ El encargo decía «los componentes no necesitan un solo cambio»: era cierto
   **solo compilando un bundle por tema**. Con los tres conviviendo el tema se
   elige en runtime, así que el import estático tenía que caer.
   Detalle que conviene no deshacer: **el único que llama a `useTema()` es
   `useViewModel`**, que ya exponía `theme`/`features`; los otros cuatro
   ficheros leen de `vm`. Dos lecturas del mismo dato por caminos distintos es
   el patrón de bug que más veces ha mordido en este repo. Por lo mismo,
   `TabBar` recibe `floating` por prop (`vm.tabBarFloating`) en vez de mirar el
   tema: no recibe el view model.
   El `data-theme` lo pone `TemaProvider` en `<html>` con un efecto — **en la
   ruta real hay que renderizarlo también en servidor** desde el layout del
   portal, o se ve un parpadeo sin tintar en el primer pintado.
2. ~~**Dejar verde `eslint --max-warnings 0`.**~~ **HECHO.** Eran 2 errores y 5
   avisos, todos del código tal cual vino de diseño, ninguno introducido al
   integrarlo:
   - `PortalStore.tsx` — `stateRef.current = state` en render. Pasa a un
     efecto: todo el que lee ese ref (manejadores de evento, el callback del
     intervalo) corre después del commit, así que no cambia nada salvo dejar de
     escribir en un render que React puede descartar.
   - `hooks/motion.ts` — `useCountUp` escribía estado dentro del efecto para el
     caso de movimiento reducido. Ahora la decisión se toma al montar
     (`useState(prefiereMenosMovimiento)`) y el hook devuelve el valor final
     directo. ⚠️ Resolverlo con un segundo efecto habría dejado correr un par
     de fotogramas de conteo justo a quien pidió menos movimiento.
   - Las 5 `<img>` colapsan en **un** `FotoTema` en `chrome.tsx`, con un solo
     disable razonado (mismo patrón que ya usa `app/portal/[slug]/…`). Cuando
     entren las fotos reales (punto 8) hay un único sitio que reconsiderar.
3. ~~**Que se vea.**~~ **HECHO.** `/portal-tema-preview/{oliva,bloom,noir}`,
   con `components/portal-tema/portal-tema.css` cableando tokens + hojas y los
   7 SVG en `public/media/`. Se cae en producción (`VERCEL_ENV`) y se borra
   entera cuando el portal esté montado detrás de su flag.
   ⚠️ Tres cosas que salieron SOLO al mirarlo, ninguna visible con `tsc`/lint:
   - **`.phone__screen` no existía en ninguna de las 17 hojas** del kit, con lo
     que la bienvenida (única pantalla `position:absolute`) medía 0px de alto y
     salía el titular en blanco sobre crema. Pasa igual en los tres proyectos
     originales. Regla añadida en `02-phone.css`.
   - **Colisión de `--font-display`**: el layout raíz la declara (Instrument
     Serif) en `<html>` con una clase de `next/font`; los tokens del tema la
     declaran también. Misma especificidad → decidía el orden de los chunks.
     Por eso el selector es `html[data-theme="…"]` y no `[data-theme="…"]`.
     Comprobado en vivo: sin el atributo sale Instrument Serif, con él Outfit.
   - Las **fuentes ya estaban todas cargadas** por el layout raíz vía
     `next/font`. El `<link>` a `fonts.googleapis.com` del proyecto de diseño
     sobra y contradice una decisión explícita del repo.
   Verificado además que la hoja del portal **no se filtra** al resto de la app:
   en `/login` no está cargada, `data-theme` vuelve a `null` y el `body` no
   cambia ni de fondo ni de fuente.
4. ~~**La capa de datos.**~~ **HECHA la mitad de arriba.** `lib/portal-tema/`
   traduce el dominio de Tentare (`Sesion`, `TipoClase`, `Suscripcion`…) a lo
   que pinta el portal, en funciones puras con 22 tests. El portal ya no
   importa los datos de muestra: entran por `PortalProvider` (`datos`), y los
   de muestra son solo el valor por defecto de la previsualización.
   ⚠️ Lo que sacó a la luz, y que con datos inventados no existía:
   - **La lista de clases puede venir VACÍA.** `findClass` devolvía
     `CLASSES[0]` cuando no encontraba nada; con un estudio real eso es
     `undefined` y la pantalla de detalle revienta al leerle el nombre. Ahora
     `buscarClase` devuelve `null` y el detalle tiene estado vacío propio.
     Mismo caso con `PLANS[0]` (un estudio sin tarifas) y con dividir por
     `PASS.total` (sin bono, `NaN`).
   - **El aforo lo decide `plazasOcupadas`**, no un conteo propio. El primer
     intento contaba solo `CONFIRMADA` y se dejaba `ASISTIDA`: una clase
     pasada habría aparecido con plazas libres que no existen.
   - **La semana se calcula en Europe/Madrid.** En UTC, una clase de las 00:30
     cae el día anterior y el horario la enseña donde no es — el mismo bug que
     ya arregló la migración 0105. Hay test para eso.
   Lo que **falta** de esta pieza: quién llama a `construirDatosPortal` (hoy
   nadie: el adaptador está probado pero sin consumidor real hasta que el
   portal se monte en la ruta), y la pantalla de **Calendario**, que sigue con
   el mes de muestra fijado a "Septiembre 2026" — marcar días reales sobre una
   rejilla inventada quedaría medio bien, que es peor que quedar claramente
   falso.
5. **Flag por estudio, CON FECHA DE SALIDA.** Se activa en un estudio piloto;
   pasada una semana sin incidencias se activa en el resto **y se retira el
   portal viejo en el mismo PR**. Un flag sin fecha se queda para siempre y se
   acaban manteniendo dos portales.
6. **Conectar las acciones de red.** `reserve`, `cancel`, `pay` y `authSubmit`
   en `store/PortalStore.tsx` son `setTimeout`. Sustituir el cuerpo por la RPC
   real **manteniendo el estado de carga**: no es decorativo — el botón pasa por
   «Reservando…» con rueda antes de «Reservada», y de ahí dependen el bono, el
   anillo y el marcado en el horario. Si la RPC responde en 80 ms, mantener un
   **mínimo visible de ~400 ms**.
7. **Retirar las cuatro vistas viejas**: `portal-home-view.tsx`,
   `portal-clases-view.tsx`, `portal-bonos-view.tsx`, `bloque-home-render.tsx`.
   **NO se retira** la capa de datos ni `PortalShell`.
8. **Sustituir las imágenes marcador** de `public/media/*.svg`. ⚠️ No son
   neutras: el diseño de la bienvenida cuenta con una foto OSCURA debajo del
   velo para que el titular blanco se lea. Un marcador claro deja esa pantalla
   ilegible aunque el CSS esté bien.

## Reglas del encargo que no se pueden saltar

- El dorado de Noir **nunca rellena** (como fondo con texto claro da 1,9:1).
- El rosa de Bloom es acento, no marca.
- Cambiar de tema **no borra el contenido de la propietaria**: al aplicar
  `home_blocks`, los bloques que ella añadió van al final.
- Ningún componente escribe un color o un radio a mano. Si hace falta un valor
  nuevo, se añade un token.
- `classic` se queda como **tema predefinido**, igual que Horizon en Shopify.

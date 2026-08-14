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
     entren las fotos reales (punto 9) hay un único sitio que reconsiderar.
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
   El consumidor es `/portal-tema-preview/[tema]?estudio=<slug>`: pinta el
   catálogo público real de ese estudio, sin socia ni datos personales.
   ⚠️ **Pasarle datos de verdad encontró dos fallos que los tests no vieron**,
   porque los fixtures los escribí yo con la misma cabeza que el código:
   - **Se colaban clases de otro mes.** El filtro iba por día del mes y al
     adaptador le llegan TODAS las sesiones del estudio: el 5 de septiembre
     tiene el mismo `day` que el 5 de agosto. Ahora filtra por fecha completa.
   - **`nivel` salía como el enum crudo** ("PRINCIPIANTE" en la píldora del
     detalle y en «Nivel …»). Los datos de muestra ya traían texto humano, así
     que no se veía. Hay mapa a palabras — y es el quinto del repo con distinta
     redacción; unificarlos es un cambio aparte.
   ~~Lo que falta: la pantalla de **Calendario**.~~ **HECHA** (#1017):
   `rejillaMesPortal` en `lib/portal-tema/datos.ts`, con el mes real en la zona
   del estudio y las marcas casadas por **fecha completa** — nunca por
   `StudioClass.day`, que es el día del MES y confunde el 13 de agosto con el 13
   de septiembre. `ahoraISO` viaja con los datos para que la previsualización
   siga siendo determinista. De paso se quitaron las dos flechas de mes, que no
   tenían `onClick`: navegar de mes exige que `state.day` pase de número de día
   a fecha completa, y eso toca el filtrado del horario — pasada aparte.
5. **DECIDIDO: manda `PortalShell`, no `PortalApp`.** Las pantallas del kit se
   montan una por ruta de Next; se tiran el enrutador y la navegación por
   estado del kit. Motivo, medido: el portal actual tiene **19 rutas** y el kit
   **12 pantallas** — siete no tienen equivalente y no son cascarones
   (`/progreso` 509 líneas, `/compras` 436, `/preferencias` 255, `/videos` 211,
   `/notificaciones` 170, `/invitar` 123, `/instructores` 93). Además, con la
   pantalla en el estado una URL no identifica una clase: no se puede compartir
   ni guardar el enlace, ni funciona el botón atrás del navegador.
   **Esas siete se quedan como están** (decisión del fundador): el portal se
   verá mezclado un tiempo, unas pantallas con el tema nuevo y otras no.
   ~~Costura de navegación~~ **HECHA**: las doce acciones que navegaban pasan
   por `ir()`, y `PortalProvider` acepta `navegar`/`pantalla`. Por defecto
   sigue siendo el estado, así que la previsualización se comporta igual.
   ~~Selector de plaza~~ **HECHO**, y con él **la puerta de Clases ya está
   abierta**: `PortalShell` no mira `spots`. La rejilla vive en `ClassDetail`
   (`.plazas`), el `spotId` viaja hasta `addReserva` —la MISMA vía que la hoja
   de siempre— y elegir es OPCIONAL, igual que allí: obligar aquí sería una
   regla nueva, y esto era para no perder funcionalidad, no para cambiarla.
   ⚠️ Tres cosas que solo salieron al mirarlo, ninguna visible con `tsc`:
   - **La fila del horario de Tentada tenía un atajo «Reservar»** que salta el
     detalle. Reservar desde ahí en un estudio de reformer habría dejado a la
     socia sin máquina — justo lo que la puerta cerrada evitaba. Con plazas,
     ese atajo lleva al detalle en vez de reservar. Los otros tres temas usan
     `ClassRow`, sin atajo, así que no tenían el agujero. ⚠️ El rótulo sigue
     siendo «Reservar» (decisión del fundador, 2026-08-13): es lo que hace la
     fila del portal de siempre —pulsar abre la hoja y se confirma allí— y dos
     verbos distintos para el mismo gesto según el estudio confunden más de lo
     que aclaran.
   - **La rejilla NO puede llevar un número fijo de columnas.** Copié el 7 de
     la hoja de reserva de siempre y la sala real del piloto —8 plazas, 2×4—
     salió como 7 + 1 huérfana. Ahora las columnas salen del dato
     (`columnasDeSala`), contando columnas DISTINTAS: en producción los
     índices van desde 0, así que ni `max` ni `max+1` acertaban.
   - **La plaza elegida tiene que soltarse al cambiar de clase.** Sin eso, la
     1 elegida en la clase de las 10 viaja a la de las 18, donde puede estar
     cogida, y el servidor la rechaza con un mensaje que no explica nada.
   Cubierto por `e2e/portal-tema-elegir-plaza.spec.ts` (4 casos, incluido que
   una clase SIN plazas no pinta ninguna rejilla — vacío es «este estudio no
   asigna sitio», no «sala llena»).
6. **Flag por estudio, CON FECHA DE SALIDA.** Se activa en un estudio piloto;
   pasada una semana sin incidencias se activa en el resto **y se retira el
   portal viejo en el mismo PR**. Un flag sin fecha se queda para siempre y se
   acaban manteniendo dos portales.
   ~~La fecha.~~ **PUESTA Y COMPROBADA**: `FECHA_SALIDA_PORTAL_REACT` en
   `lib/portal-tema/caducidad.ts` (**2026-10-15**), con un test que pone la
   suite roja ese día y dice qué borrar. El flag ya existía —
   `studios.portal_react`, migr `20260807120000` — y su comentario decía
   literalmente «ESTA COLUMNA TIENE FECHA DE CADUCIDAD»... **sin ninguna
   fecha**, igual que `portal-shell.tsx` avisaba de «no dejar que eche raíces»
   sin decir hasta cuándo. Las dos eran intención, no plazo: nada fallaba
   nunca por incumplirlas.
   **El piloto sigue sin empezar**: 0 de 13 estudios con la bandera encendida
   (comprobado en prod el 2026-08-13). Encenderla en un estudio real cambia lo
   que ven sus socias, así que es decisión de producto — y antes conviene
   cerrar el selector de plaza del punto 5, que hoy deja la pantalla de Clases
   fuera del kit en los estudios de reformer.
7. ~~**Conectar las acciones de red.**~~ **HECHO lo que había que hacer, y las
   dos que quedan NO deben conectarse.** Revisado el 2026-08-13:
   - `reserve` → `alReservar` → `addReserva`, esperando la respuesta entera del
     servidor (ese endpoint rechaza legítimamente en seis sitios; anunciarlo
     antes es el #500).
   - `cancel` → `alCancelar` → `cancelarReserva` (RPC transaccional).
   - `checkout` → `alPagar` → Checkout **alojado** de Stripe.
   Las tres las cablea `components/portal/portal-tema-marco.tsx`, y sin callback
   —la previsualización de temas— se quedan con la maqueta del kit.
   ⚠️ **`pay` y `authSubmit` siguen siendo `setTimeout` A PROPÓSITO.** Las
   llaman `Checkout.tsx` y `Auth.tsx`, que son las pantallas de mentira del kit
   y **no están en `RUTA_A_PANTALLA`**: el portal real solo enruta `inicio`,
   `clases`, `reservas`, `bonos` y `centro`. `pay` no tiene a qué conectarse
   —la vía de verdad ya es `checkout`— y la puerta real del portal es la de dos
   pasos con enlace mágico, no la del kit.
   ⚠️ **Esto es una condición del punto 5, no una tarea suya**: al montar más
   pantallas, `Checkout` y `Auth` NO entran en el mapa de rutas. El día que
   entren, una socia teclea número y CVC en nuestro propio DOM y lee «Pago
   confirmado · bono activado» sin que se haya cobrado nada.
8. **Retirar las cuatro vistas viejas**: `portal-home-view.tsx`,
   `portal-clases-view.tsx`, `portal-bonos-view.tsx`, `bloque-home-render.tsx`.
   **NO se retira** la capa de datos ni `PortalShell`.
   Ya no lo bloquea nada del punto 5 —Clases está abierta para todos—, pero
   sigue esperando a que el piloto pase su semana: mientras el kit sirva a un
   solo estudio, las vistas viejas son el portal de los otros doce.
9. ~~**Sustituir las imágenes marcador** de `public/media/*.svg`.~~ **HECHO**,
   y no sustituyéndolas: **borrándolas**. El kit tenía un segundo juego de
   marcadores en paralelo al que este repo ya usa —
   `lib/imagenes-por-defecto.ts` + `public/por-defecto/`, con su README y su
   criterio de encuadre por hueco— y mantener dos era el problema, no la falta
   de fotos. `FotoTema` ya no monta rutas: recibe un `src` que resuelve la capa
   de datos (`DatosPortal.fotos`, `StudioClass.fotoUrl`), así que **la socia ve
   la foto de SU estudio** si la propietaria la subió, y la de por defecto si
   no. Con `onError` a la de por defecto, que cubre la foto borrada de Storage.
   ⚠️ De los 7 SVG, **4 no los usaba nadie** (`estudio`, `instructora-1/2/3`).
   Y las caras siguen SIN foto por defecto a propósito — decisión ya
   documentada en los dos README: una modelo de catálogo haciéndose pasar por
   la instructora es peor que las iniciales.
   El aviso de la foto oscura era real y está comprobado, no supuesto:
   `estudio-vertical.webp` mide 62/255 de luminancia media en la banda del
   titular (p90 = 65), y la bienvenida se miró en los CUATRO temas.

## Con el kit, el orden del Inicio lo manda el ESTUDIO (2026-08-14)

Decisión del fundador, tomada al descubrir que el rail de Secciones enseñaba
agarradera y ojo **que no movían nada**: con el kit encendido el orden salía de
`themes/<tema>/config.ts` y `studio_layout.bloques` se ignoraba entero.

⚠️ Y de paso una corrección que estaba escrita al revés en dos sitios: **«el
tema manda, como en Shopify» es falso**. En Shopify el tema trae el orden por
DEFECTO y la tienda lo cambia — que era además el encargo explícito del Theme
Builder.

Fuente de verdad: `ordenDelInicio` (`lib/portal-tema/equivalencias.ts`), con
cuatro reglas y un test por regla:

1. **Sin bloques guardados manda el tema** — el caso de los 13 estudios el día
   del despliegue, así que salió como no-op.
2. **Oculto no se pinta**, y ocultar GANA a la regla 3. Sin eso, apagas una
   sección y reaparece por detrás.
3. **Lo que el tema compone y el estudio nunca ordenó va al final**, no se
   pierde: un tema que añade una sección la enseña en vez de tragársela por no
   estar en una lista guardada hace meses. Mismo criterio que `aplicarLayout`.
4. **Lo que el kit no sabe pintar se ignora**, no deja hueco.

⚠️ **Dos vocabularios, una pantalla.** El editor nombra las secciones con los
ids del sistema viejo (`cabecera`, `proximaClase`…) y el kit con los suyos
(`home-header`, `next-class`…). La tabla que los cruza es
`BLOQUE_EDITOR_A_KIT`, y su test se cruza contra los `home_blocks` REALES de
los cuatro temas — un nombre mal escrito ahí no falla en ningún otro sitio.

### Lo que falta para el modelo entero

Los **10 bloques del catálogo** (`texto`, `galeria`, `video`, `faq`,
`testimonios`, `cta`, `banner`, `contenedor`…) **no tienen renderizador en el
kit**: `REGISTRY` (`components/portal-tema/components/blocks/HomeBlocks.tsx`)
solo trae módulos de producto. Añadir uno desde el rail **no aparece**.

No es una regresión —el kit ignoraba `studio_layout` entero desde el principio—
pero ahora que reordenar y ocultar SÍ funcionan, chirría más: el rail deja
añadir algo que no se va a ver. Cerrarlo es portar esos renderizadores al kit,
y es trabajo de otro tamaño.

⚠️ Relacionado y sin resolver: **ningún tema compone `studio-banner`**, así que
«Contenido del estudio» —el mensaje y los banners que escribe la propietaria—
no tiene sitio en el kit. Hoy no cuesta nada (cero banners en los 13 estudios,
comprobado el 2026-08-13) y hay un test que caerá el día que un tema lo componga.

## Reglas del encargo que no se pueden saltar

- El dorado de Noir **nunca rellena** (como fondo con texto claro da 1,9:1).
- El rosa de Bloom es acento, no marca.
- Cambiar de tema **no borra el contenido de la propietaria**: al aplicar
  `home_blocks`, los bloques que ella añadió van al final.
- Ningún componente escribe un color o un radio a mano. Si hace falta un valor
  nuevo, se añade un token.
- `classic` se queda como **tema predefinido**, igual que Horizon en Shopify.

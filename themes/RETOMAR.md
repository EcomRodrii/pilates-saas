# Portal en React — dónde se quedó y cómo seguir

Rama: `feat/portal-tema-react`. **`tsc --noEmit` ya pasa limpio**; lo que aún no
pasa es `eslint --max-warnings 0`, que es lo que corre CI (ver "Lo que falta",
punto 2). Sigue siendo andamiaje: el portal no está montado en ninguna ruta ni
conectado a datos reales.

## Lo que está hecho y verificado

**El supuesto central del encargo es cierto, medido no supuesto**: de los 56
ficheros de cada proyecto React, solo difieren cuatro — `src/theme/config.ts`,
`src/theme/tokens.css`, `README.md` y `package.json`. Los dos últimos son
metadatos. Por eso aquí hay **una sola copia** del código y tres juegos de datos.

- `components/portal-tema/` — 39 ficheros: `components/` (ui, layout, blocks),
  `screens/` (12 pantallas), `store/`, `hooks/`, `styles/`, `data/`,
  `PortalApp.tsx` y `tipos-tema.ts`.
- `themes/{oliva,bloom,noir}/` — `config.ts` + `tokens.css` por tema.
- Los tres `tokens.css` convertidos de `:root` a `[data-theme="…"]`, 103 tokens
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
2. **Dejar verde `eslint --max-warnings 0`** (lo que corre CI). Son 2 errores y
   5 avisos, todos del código tal cual vino de diseño, ninguno introducido al
   integrarlo:
   - `store/PortalStore.tsx:115` — `stateRef.current = state` en render
     (`react-hooks/refs`). Mover a un efecto es seguro: las acciones leen el ref
     desde manejadores de evento, siempre después del commit.
   - `hooks/motion.ts:13` — `set-state-in-effect` en `useCountUp`.
   - 5 avisos `@next/next/no-img-element` en `ClassDetail`/`Welcome`/
     `GuidedSession`. Son las imágenes marcador del punto 6; decidir junto con
     ese punto si pasan a `next/image` o llevan un disable razonado.
3. **Flag por estudio, CON FECHA DE SALIDA.** Se activa en un estudio piloto;
   pasada una semana sin incidencias se activa en el resto **y se retira el
   portal viejo en el mismo PR**. Un flag sin fecha se queda para siempre y se
   acaban manteniendo dos portales.
4. **Conectar las acciones de red.** `reserve`, `cancel`, `pay` y `authSubmit`
   en `store/PortalStore.tsx` son `setTimeout`. Sustituir el cuerpo por la RPC
   real **manteniendo el estado de carga**: no es decorativo — el botón pasa por
   «Reservando…» con rueda antes de «Reservada», y de ahí dependen el bono, el
   anillo y el marcado en el horario. Si la RPC responde en 80 ms, mantener un
   **mínimo visible de ~400 ms**.
5. **Retirar las cuatro vistas viejas**: `portal-home-view.tsx`,
   `portal-clases-view.tsx`, `portal-bonos-view.tsx`, `bloque-home-render.tsx`.
   **NO se retira** la capa de datos ni `PortalShell`.
6. **Sustituir las imágenes marcador** de `public/media/*.svg`.

## Reglas del encargo que no se pueden saltar

- El dorado de Noir **nunca rellena** (como fondo con texto claro da 1,9:1).
- El rosa de Bloom es acento, no marca.
- Cambiar de tema **no borra el contenido de la propietaria**: al aplicar
  `home_blocks`, los bloques que ella añadió van al final.
- Ningún componente escribe un color o un radio a mano. Si hace falta un valor
  nuevo, se añade un token.
- `classic` se queda como **tema predefinido**, igual que Horizon en Shopify.

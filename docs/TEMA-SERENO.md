# Tema Sereno — la nueva app de alumna

Qué se hizo con el paquete de Claude Design (`tema tentare.zip`, 2026-08-17), qué
se reutilizó tal cual, y las decisiones que no son obvias leyendo el diff.

---

## 1. El punto de partida: el ZIP ya venía en el formato real

Lo primero que se auditó fue si el paquete proponía una arquitectura paralela.
No la propone. Su `README-CLAUDE-CODE.md` es explícito —«no incluye a propósito
ningún Theme Builder, editor, preview engine ni sistema de draft/publicación:
todo eso existe en el repo y NO debe duplicarse»— y sus dos ficheros de tema
(`theme/sereno/config.ts` y `theme/sereno/tokens.css`) rellenan el contrato real
de `components/portal-tema/tipos-tema.ts` y usan los mismos nombres de token que
`themes/{tentada,oliva,bloom,noir}/tokens.css`.

Eso convirtió el encargo en lo que ya era el camino del repo: **un quinto tema
de datos, cero código de tema**. `theme/templates/templates.json` y
`theme/sections/sections.json` son documentación (lo dicen ellos mismos en su
primera clave), y `theme/data/sample-data.json` es solo para preview — no se
importó ninguno de los tres.

## 2. Mapping — Claude Design → pieza real de Tentare

| Diseño (prototipo) | Pieza de Tentare que YA existía | Lo que se hizo |
|---|---|---|
| Bienvenida | `screens/Welcome.tsx` + tokens `--welcome-*` | tokens; auth real sigue siendo la puerta de dos pasos |
| Inicio | `screens/Home.tsx` + `HomeBlocks` + `lib/portal-home-bloques.ts` | `home_blocks` del tema; cero bloques nuevos |
| Clases + filtros | `screens/Schedule.tsx` + `lib/portal-tema/datos.ts` | nada: `schedule_style: chips` ya existía |
| Detalle + plazas | `screens/ClassDetail.tsx` (`plazas`, `columnasDeSala`) | nada: `detail_style: bleed` ya existía |
| Reserva | `portal-tema-marco.tsx` → `addReserva` (contexto) | hoja de error con reintento (§4) |
| Cancelación | `alCancelar` → `cancelarReserva` (RPC transaccional) | la hoja deja de mentir sobre el crédito (§4) |
| Lista de espera | flujo + NOTIFICATION-ENGINE existentes | nada |
| Bonos | `screens/Passes.tsx` (`passes_style: plan`) | rótulo, línea de uso y los dos estados vacíos (§4) |
| Agenda | `screens/Calendar.tsx` / `Bookings.tsx` | nada |
| Perfil | `screens/Profile.tsx`, `MyData.tsx`, `/preferencias` | nada |
| Avisos | `/notificaciones` + push | nada |
| Compra de bono | `alPagar` → Stripe Checkout **alojado** | nada; la hoja de tarjeta del prototipo es maqueta y no se monta |
| On Demand | `/videos`, hoy `PORTAL_VIDEOS_CONGELADO` | nada. Sin sección ni pestaña, como pide el propio ZIP |

**Cero backend nuevo**: ni una query, ni un endpoint, ni una tabla, ni una
migración. La única forma de dato que cambió es un campo que ya existía en
`studios` y no llegaba al portal (§4.1).

## 3. Alta del tema (lo mecánico)

- `themes/sereno/config.ts` y `themes/sereno/tokens.css` — copiados del ZIP, con
  los ajustes de §5.
- `components/portal-tema/tipos-tema.ts` — `"sereno"` en el union de
  `ThemeConfig["id"]`, y un `tab_labels?` opcional (§5.4).
- `themes/registro.ts` — import + entrada en `TEMAS_PORTAL` + `TemaPortalId`.
  **`TEMA_PORTAL_POR_DEFECTO` sigue siendo `tentada`.**
- `components/portal-tema/portal-tema.css` — `@import` de sus tokens.
- `app/layout.tsx` — Libre Caslon Text (con cursiva) y Figtree por `next/font`,
  como Cormorant para Tentada. Cero petición a Google Fonts.
- `lib/theme-schema.ts` — `figtree` en `FUENTES`, `libreCaslon` en
  `ESTILOS_TITULAR_PORTAL`.
- `lib/theme-runtime.ts` — `varsTitularPortal` resuelve `libreCaslon` (peso 400).
- `lib/theme-definitions.ts` — la entrada de biblioteca, **la última** de la
  lista: entregar un tema no lo convierte en el de casa.

## 4. Los deltas de comportamiento, y por qué NO son solo de Sereno

El README del ZIP (§10.3) autoriza «ajustar las pantallas del kit donde la spec
del prototipo difiera — comportamiento, no rediseño». Los tres que salieron
resultaron ser **bugs que ya sufrían los cuatro temas anteriores**, así que se
arreglan para todos.

### 4.1 La hoja de cancelar prometía un crédito que no siempre vuelve

Decía «La clase vuelve a tu bono» a cualquiera que tuviera bono, sin mirar la
hora. La RPC decide con `v_devolver := v_devolver_tardia or not v_tardia`: hacen
falta **las dos mitades** de la política y la segunda —
`studios.cancelacion_devolver_bono_tardia`— no llegaba al portal.

- `FuenteDatosPortal.cancelacionDevolverBonoTardia` → `DatosPortal.devolverBonoTardia`.
- `vm.cancelSheet.devuelve` lo predice con **`debeDevolverBono`**
  (`lib/booking-logic.ts`), el MISMO helper puro que ya usa `/reservar`, no una
  segunda copia de la regla.
- La hoja pinta dos avisos distintos, y el de perder la sesión va en ámbar.

⚠️ Es una **predicción**, no la respuesta del servidor: `cancelarReserva` no
devuelve `devolverBono` al cliente. Se calcula con los mismos dos datos que usa
la RPC, así que coincide salvo que la política cambie entre abrir la hoja y
pulsar. Convertirla en confirmación exigiría propagar el resultado de la RPC
hasta el contexto, y eso es un cambio de firma que toca todas las superficies.

### 4.2 Un fallo al reservar era un toast que se iba solo

Reservar es la única acción del portal que cuesta dinero, y el error duraba tres
segundos: la socia se quedaba sin saber si se había gastado un crédito. Ahora es
una hoja (`hoja.tipo === 'errorReserva'`) que se queda hasta que ella la cierre,
con el motivo que da el SERVIDOR (son seis rechazos legítimos distintos) y la
frase que siempre es verdad: «No se ha usado ningún crédito».

`reintentable` compara contra `ERROR_RED`, la única frase que
`mensajeDeFalloAlGuardar` reserva para un fallo de red real. Ofrecer «Reintentar»
sobre un rechazo legítimo —sin bono, clase empezada, tope semanal— sería mandarla
a repetir algo que va a volver a fallar. Y la plaza elegida **no se suelta** al
fallar: el reintento pide el mismo sitio.

Y de paso, un fallo que salió tirando de ese hilo: **la hoja leía la política de
la clase abierta en el DETALLE, no la de la reserva que se estaba cancelando.**
Desde «Mis reservas» (`Bookings`) la hoja se abre con el id de esa fila y no toca
`state.classId`, así que enseñaba la ventana de la última clase que se hubiera
mirado. Con una ventana por tipo de clase eso ya era decirle otra cosa; con
`devuelve` de por medio sería decirle que recupera un crédito que va a perder.
`cancelSheet` pasa a ser `cancelSheetDe(classId)`.

### 4.3 La pantalla de Bonos solo pintaba uno de sus tres estados

`passes_style: "plan"` renderizaba la tarjeta siempre. Sin bono salía con un «0»
y un «caduca el » sin fecha; con un plan ILIMITADO salía igual de vacía, porque
`bonoDe` descarta a propósito los que no tienen sesiones que contar. Son dos
situaciones distintas y las dos salían rotas. Ahora: tarjeta con rótulo «Bono
activo» y línea «N de M usadas», tarjeta de plan ilimitado, o estado vacío.

## 5. Lo que hubo que cambiar del paquete, y por qué

Todo lo de esta sección son **tokens con el valor de siempre por defecto**: los
cuatro temas anteriores no se mueven ni un píxel. Verificado en el navegador tema
a tema (§7).

1. **Faltaban los cinco `--section-title-*`.** El rótulo de sección de Sereno son
   versalitas de cuerpo («TU PRÓXIMA CLASE»); sin esos tokens `.section-title`
   cae a Libre Caslon minúscula. Mismo caso que Tentada.
2. **`--size-greeting: 13px` estaba mal atribuido.** Su comentario decía «la
   línea micro sobre el nombre», pero en el kit ese token lo consume
   `.greeting__name` —el titular— y la micro va a un 12.5px fijo. El nombre salía
   del tamaño de un metadato. Corregido a 30px.
3. **El velo de la bienvenida no cubría el texto.** Sereno es el único de los
   cinco que escribe la bienvenida en TINTA sobre la foto; los otros cuatro la
   escriben en blanco sobre un velo que oscurece, y por eso la foto vertical se
   elige oscura a propósito. Con el corte original (opaco solo al 100 %) el
   titular en malva y el párrafo no se leían. El velo llega a porcelana sólida
   al 62 %.
4. **Cuatro cosas escritas a mano en el kit que ningún tema podía cambiar**, y
   que Sereno necesita distintas. En todas se añadió el token y se dejó el valor
   anterior como respaldo:
   - `.welcome__cta` → `--welcome-cta-radius`, `--welcome-cta-arrow-display`.
   - `.tab-bar--floating` → `--tab-bar-radius/-blur`, `--tab-pill-bg/-ink/-radius`,
     y que por fin lea `--tab-bar-bg` / `--tab-bar-border` (que declaraba y solo
     usaba la barra pegada). Bloom no cambia: sus valores coincidían con los fijos.
   - `.hero__photo` / `.hero__body` → `--hero-photo-inset/-height`,
     `--hero-body-pad/-display`. Sereno pone la foto como banda arriba.
     ⚠️ `.hero__body` es un `<span>` y sigue siendo **inline** por defecto: su
     `padding: 20px` nunca ha empujado en vertical. Se declara bloque solo donde
     hace falta; hacerlo global les añadiría 20px arriba y abajo a los otros cuatro.
   - `.hero__badge` → `--hero-badge-bg/-ink`. Su blanco translúcido desaparecía
     sobre una tarjeta clara.
   - `tab_labels` (`ThemeFeatures`, opcional) → la cápsula flotante enseñaba
     etiqueta solo en la activa, que es la regla de Bloom escrita como si fuera
     la de todas. Ausente = como siempre.
5. **El `\n` de `welcome.text`** partía la frase por un sitio que no era el suyo:
   `.welcome__text` es `pre-line` y ya tiene su medida.

## 6. Desviaciones del diseño, a propósito

- **La ficha del detalle usa `.detail__label`** (Libre Caslon 14px), no el rótulo
  en versalitas del prototipo. Es una convención del kit compartida por los cinco
  temas; cambiarla es rediseñar el sistema, no adaptar un tema.
- **El chip de hora va bajo el título**, no sobre la foto de la tarjeta de próxima
  clase. Moverlo es markup compartido por los cinco temas.
- **Las tres columnas «Equilibrio / Bienestar / Conexión»** de la tarjeta de bono
  no se construyeron: son decoración con copy fijo que no sale de ningún dato.
- **`barraFlotante: true`** en la entrada de biblioteca gobierna la barra del
  portal de SIEMPRE (las rutas que el kit no cubre). Ahí la pastilla activa sale
  de marca, mientras que en el prototipo es arena con tinta. Es la traducción más
  cercana de ese vocabulario; la alternativa (`barraClasica`) perdería lo que más
  se reconoce del tema.
- **`escalaTexto` declara cuatro pasos, no seis.** `seccion` son versalitas de
  11px en este tema —no un rótulo— y declararlo dejaría los titulares del portal
  de siempre en 11px además de envenenar el promedio de `varsEscalaSobreTema`
  (el mismo motivo que ya dejó fuera a `numeroBono`). `saludo` no está porque
  Sereno saluda con el título de pantalla.
- **Datos de muestra**: `member_name`/`member_initial`/`greeting_note` del config
  son para la previsualización, igual que en los otros cuatro. En el portal real
  los pisa la socia (`useViewModel` solo cae al valor del tema si el dato viene
  vacío). Nada de «Laura Gómez» ni «Aura Pilates» en producción.

## 7. Verificación

| Qué | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio (los 7 errores restantes son `@stripe/*` y `codemirror` sin instalar en el worktree, en ficheros no tocados) |
| `npm test` | **2912 / 2912** |
| `npm run lint` | limpio |
| `playwright e2e/apariencia-tema.spec.ts` (chromium) | **12 / 12**, incluido el nuevo `"Usar" en Sereno` |
| Navegador, `/portal-tema-preview/sereno` | Bienvenida, Inicio, Clases, Detalle, Reserva → Confirmación, Reservas, Bonos, Perfil, hoja de cancelar (las dos variantes) |
| Regresión visual | Tentada, Oliva y Bloom revisados pantalla a pantalla: sin cambios |

**Tests nuevos**: 11 en `lib/theme-definitions.test.ts` (incluido el guardia de
que la escala del tema y la de la biblioteca no puedan discrepar, derivado en vez
de copiado a mano), 2 en `lib/portal-tema/datos.test.ts` (la política de
cancelación entera), 1 e2e.

### Lo que NO se pudo probar

- **Con datos reales de una socia.** Todo lo visto en navegador es
  `/portal-tema-preview/sereno`, que monta el kit con `DATOS_DE_MUESTRA`. El
  camino de datos reales (`useDatosPortal` → `construirDatosPortal`) es el mismo
  que ya usan los cuatro temas anteriores y está cubierto por unitarios, pero
  este worktree no tiene credenciales de sesión de socia.
- **La hoja de error de reserva en vivo.** En la previsualización no hay servidor
  al que reservar (`alReservar` es `undefined` y corre la maqueta), así que la
  hoja se verificó por código y tipos, no en pantalla.
- **La variante ámbar de la hoja de cancelar** se vio forzando la clase en el
  DOM: con los datos de muestra la clase cae fuera de la ventana. La regla está
  cubierta por unitario en los cuatro casos.
- **Ningún e2e monta el portal del KIT.** `montarPortal` (`e2e/portal-mock.ts`)
  sabe montar el portal de SIEMPRE con el tema de un id de galería, pero no
  tiene interruptor de `portal_react`, así que las hojas del kit —la de
  cancelar y la nueva de error— no tienen camino e2e hoy. Es un hueco anterior
  a este cambio y se documenta en vez de ampliar el andamiaje de paso: el
  interruptor es una capacidad nueva del harness, no una adaptación de tema.

## 8. Qué es tema y qué es Core

- **Tema** (`themes/sereno/`): color, tipografía, radios, sombras, composición
  del Inicio (`home_blocks`) y las banderas de `features`. Dos ficheros de datos.
- **Core** (todo lo demás): los datos, la lógica, los permisos y la RLS. El tema
  no sabe que existe Supabase — recibe `DatosPortal` ya masticado por
  `lib/portal-tema/datos.ts`, que es puro y se prueba con `node --test`.

No se tocó ninguna política RLS, ningún endpoint y ninguna comprobación de rol:
el alcance de datos de una alumna con Sereno es exactamente el mismo que con
Tentada, porque es el mismo código.

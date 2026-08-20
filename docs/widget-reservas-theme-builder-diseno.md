# Widget de reservas — rediseño visual + Theme Builder: diseño técnico

> Estado del repo auditado: `9f05c9e1` (18 ago 2026) en la rama
> `claude/checkout-sin-login-impl` (PR #1197, **abierta, NO mergeada en
> `main`** — el último commit en `main` es `560669d5`). Documento de diseño,
> no código — la implementación es un paso posterior. Sigue el mismo formato
> que `docs/reserva-sin-login-diseno.md`, del que este diseño depende
> directamente (§0).

## 0. El hallazgo que cambia el encargo, en una frase

**El handoff describe un widget que ya existe dos veces con arquitecturas
distintas — y el que más se le parece por fuera (Modo B, script embebible) es
justo el que menos tiene construido por dentro (paga sin pasar por un plan,
cero theming mas alla de un color).** El repo tiene:

- **Modo A** (`app/reservar/[slug]/page.tsx`, 2759 lineas): pagina completa
  con pestanas Clases/Citas/Mis reservas/Estudio/Cuenta, embebible por
  iframe a `/reservar/<slug>?embed=1&tab=clases` — mecanismo YA usado en
  produccion (Configuracion > Estudio > Enlaces lo genera). Aqui vive el
  unico sistema de theming del widget hoy (`lib/reservar/apariencia-widget.ts`,
  ver 1.2) y el UNICO flujo de "pagar y reservar sin login previo" que existe
  en el repo (PR #1197, ver 1.7) — pero PENDIENTE DE MERGEAR.
- **Modo B** (`app/widget-bundle/main.tsx`): bundle standalone compilado con
  esbuild (`public/widget.js`), div con data-attribute + script, Shadow DOM
  real (no iframe) — el mecanismo que el propio handoff recomienda "si no
  existiera ya" (su seccion "About the Design Files": *"si no existe entorno
  aun, elegir... web component / bundle standalone con Shadow DOM o
  iframe"*). Tema **fijo** (`MODO_TOKENS.dia`, comentario explicito en el
  fichero: *"el widget no lee el editor de Apariencia del panel...
  tipografia/fondo/textos quedan fuera de este primer bundle"*),
  personalizacion de color minima via `data-color` (un solo acento), y
  **sin ningun camino de pago** — solo reserva directa o gated por plan ya
  comprado.

Los 11 estados del handoff (lista de clases → datos → pago → confirmacion,
con lista de espera y hold de 10 min) son, casi verbatim, el flujo que PR
#1197 construyo — pero **solo en Modo A**, y su propio documento de diseno
(`docs/reserva-sin-login-diseno.md §3.2`) dejo Modo B explicitamente fuera:
*"Modo B ya resuelve 'elige clase antes que login' para reservas gratuitas...
Anadir el mismo 'datos'→'pago' aqui es mecanicamente el mismo cambio, pero...
es alcance real, no trivial"*.

**Decision que este documento recomienda (§2): construir el rediseno sobre
Modo A + `?embed=1`, no sobre Modo B.** Es donde ya vive el pago sin login, el
unico sistema de tokens de apariencia existente, y el "Fase 7 Widget
Experience Builder" que ya controla que pestanas se ofrecen. Migrar primero a
Modo B significaria portar PR #1197 entero (dinero real, sin probar con un
cobro real todavia) antes de poder ensenar la pantalla 04 del handoff — coste
que ninguna parte de este pedido pide asumir ahora.

## 1. Lo que ya existe y hay que entender antes de tocar nada

### 1.1 ReservaCalendario — el componente que YA pintan ambos modos

`components/reserva/reserva-calendario.tsx` (857 lineas) es "100% inline-
styled y theme-driven" (comentario propio del fichero): recibe un objeto
ModoTokens + datos + handlers por props, sin acoplarse a useStudio/useModo.
Hoy pinta un patron de tira de SEMANA con flechas de navegacion, no la tira
de 10 dias con scroll horizontal +-240px del handoff (pantalla 01) — es un
patron de navegacion distinto, no el mismo componente con otro CSS.
`components/reserva/rail-filtros.tsx` (134 lineas) ya resuelve el filtrado
(tipo/instructora/nivel/horario) pero como rail lateral con desplegables, no
como fila de chips pildora inline (handoff, pantalla 01) — y deliberadamente
omite "Ubicacion" en modo un-solo-estudio, con un comentario explicito sobre
por que (`vaLaPena`: un control con una sola opcion es un control roto).

Ambos son reutilizados por Modo A (page.tsx) y Modo B
(app/widget-bundle/main.tsx, mismo import). Cualquier cambio visual al
calendario en si afecta a los dos modos a la vez — es la pieza de mayor
apalancamiento (y de mayor riesgo de regresion) de todo este rediseno.

### 1.2 lib/reservar/apariencia-widget.ts — el theming que YA existe, y su alcance real

Seis controles, todos opcionales, cada uno con su parametro de URL Y su
persistencia en `studios` (editados desde un panel — ver 1.4):

| Campo | Rol | Parametro URL |
|---|---|---|
| fondo | null / 'transparente' / hex | ?fondo= |
| fuente | Nombre de familia (Google Fonts) | ?fuente= |
| radio | Radio en px, tope 32 | ?radio= |
| ocultarPie | Oculta direccion/legales del widget | ?pie=0/1 (invertido) |
| soloPestana | Ensena solo la pestana pedida, sin barra | ?solo-pestana= |
| texto | 'auto' / 'claro' / 'oscuro' | ?texto= |

`resolverApariencia` mezcla lo guardado con los parametros de la URL, y la
URL solo gana con un valor VALIDO — un parametro con basura no cae a un
default, se queda con lo guardado (comentario explicito: "un error de tecleo
en el snippet le romperia la web sin decir nada"). `modoTextoDe` ya deriva
claro/oscuro por luminancia relativa WCAG (no YIQ) del fondo elegido — la
misma idea que pide el handoff para `--t-accink`, con una formula mas
rigurosa que la de la spec (YIQ >=150 -> oscuro es una aproximacion de los
90; `luminanciaRelativa` de `lib/wcag-contrast.ts` es el estandar WCAG 2.1
que el resto del repo ya usa para el Theme Builder del portal — ver 1.4).
No hace falta una segunda funcion de contraste.

Lo que NO cubre hoy, frente a la lista completa del handoff:
- Color de acento/marca independiente — lo pone `--portal-brand`
  (`lib/theme-runtime.ts`), que sale del Theme Builder del PORTAL (blanco/
  negro por estudio), no de este sistema de 6 controles.
- Superficie/linea/muted/soft por separado — hoy son fijos
  (MODO_TOKENS.dia/.noche, `lib/portal-paleta.ts`), solo el fondo de la RAIZ
  es configurable.
- Radios DISTINTOS para tarjeta/boton/input — un solo `radio` para todo.
- Forma de boton (pildora vs recto) — no existe el concepto.
- Densidad/espaciado — no existe el concepto.
- Estilo de tarjeta (borde/sombra/plano) — fijo (`lib/reservar-publico-tokens.ts`,
  sombras/radios pixel-exactos a UN diseno, ver 1.3).
- Layout lista-vs-grid-semanal — no existe, hoy es semana+lista siempre.
- Fuente DISTINTA para display vs UI — un solo `fuente` para toda la pagina.

### 1.3 lib/reservar-publico-tokens.ts — el lenguaje visual actual es de Tentare, no del estudio

Radios, sombras y el patron de espaciado responsive (clamp()+cqw) de
`/reservar/[slug]` estan "extraidos pixel a pixel del diseno 'Reservas'"
(comentario del propio fichero) — son constantes TypeScript fijas
(radius.card = 26, shadow.card = una sombra en rgba fija, etc.), no tokens
editables por estudio. El unico blanco-etiquetado real hoy es el color de
marca (`--portal-brand`) y los 6 controles de 1.2. Esto es lo opuesto a lo
que pide el handoff ("Ningun componente usa colores/radios/fuentes
hardcodeados"). Migrar de verdad a "todo por tokens" toca este fichero
entero, no solo apariencia-widget.ts.

### 1.4 El Theme Builder que YA existe (lib/theme-schema.ts, 646 lineas) — para el portal, no el widget

Sistema de white-label completo y en produccion (memoria del repo: "Fases
0-4 desplegadas"): theme-runtime.ts resuelve un Theme guardado a variables
CSS (`--portal-brand`, `--portal-radius-card`, etc.), con gate de contraste
WCAG obligatorio antes de publicar (`validarContrasteTheme`,
components/theme/theme-editor.tsx). Vive en
components/theme/theme-editor.tsx / theme-library.tsx, con un WidgetPreview
(components/theme/widget-preview.tsx) que YA ES un iframe en vivo a
`/reservar/<slug>?embed=1&...` con los ajustes del borrador — exactamente el
patron "vista previa en vivo sin publicar" que un Theme Builder nuevo
necesitaria, ya construido y sirviendo apariencia-widget.ts.

Este sistema decide el PORTAL de la socia (`/portal/[slug]`,
app/(dashboard)), no el widget de reservas embebido — decision de diseno ya
tomada y documentada en reservar-publico-tokens.ts: "Es SU PROPIO lenguaje,
distinto del portal privado... comparte familia tipografica y curva de
animacion... pero radios, sombras y patron de espaciado son propios de esta
pantalla". Es decir: el repo ya decidio deliberadamente que el widget de
reservas NO hereda el Theme Builder del portal completo — solo su
tipografia base y su curva de easing. Un Theme Builder nuevo para el widget
debe respetar esa misma separacion (no reabrir esa decision), pero puede —
y debe — reutilizar la MAQUINARIA (motor de resolucion de tokens, gate de
contraste WCAG, patron de vista previa por iframe) en vez de rehacerla.

### 1.5 lib/portal-paleta.ts — los "4 presets" del handoff ya tienen mitad del trabajo hecho

MODO_TOKENS.dia/.noche (ModoTokens, 17 campos: bg/surface/surface2/line/ink/
muted/muted2/micro/accentInk/velo/veloFuerte/veloSuave/...) es literalmente
la paleta dia/noche que alimenta ReservaCalendario hoy — con un test de
contraste WCAG ya escrito (portal-paleta.test.ts) y una nota explicita de
que grises se oscurecieron a mano para pasar AA. El preset "Tentare" del
handoff (bg #FAF7F4, surface #FFFFFF, ink #221C19...) es un TERCER par de
valores, no una extension de MODO_TOKENS — pero la FORMA (bg/surface/ink/
muted/line/accent, con accentInk derivado) es casi la misma estructura, con
nombres en espanol.

### 1.6 sesiones.precio_puntual existe en columna desde 0000_base.sql, pero nadie lo cobra

`supabase/migrations/0000_base.sql` (linea 919), expuesto por
lib/supabase-data.ts y lib/db/supabase-data-admin.ts, con su CHECK de
no-negativo (migracion 0035). Hoy solo alimenta el margen del Decision OS
(lib/decision/margen-clase.ts) — nadie lo cobra a una clienta. Las capturas
del handoff (04-checkout.png: "1 clase — 18,00 €", "Total 18,00 €") muestran
precio fijo por clase suelta, sin ningun plan de por medio — esto es
exactamente la "Ruta B" que docs/reserva-sin-login-diseno.md §9 dejo
deferred explicitamente: "Si en el futuro se pide de verdad 'vender esta
clase concreta a este precio concreto, sin que sea un plan reutilizable'...
No se construye en este PR... es trabajo real de diseno aparte".

### 1.7 PR #1197 (Modo A, claude/checkout-sin-login-impl) — el contrato de backend a reutilizar, sin mergear todavia

Anade a page.tsx los pasos 'datos'/'pago' (Ruta A: la clase se cubre con un
plan PUNTUAL/bono, no con precio_puntual), extiende
POST /api/public/checkout-embebido con sesionId opcional, y anade
reservarPlazaTrasPagoPublico (lib/db/supabase-data-admin.ts) llamada desde
el webhook de Stripe. Verificado con `git merge-base --is-ancestor` que NO
esta en main — un commit por delante de la doc ya mergeada (PR #1193). Esto
importa para el alcance (§4): el rediseno visual de las pantallas 03/04/05/
06/07 del handoff solo tiene backend real que ensenar si #1197 llega a main
primero, o en paralelo.

## 2. Arquitectura propuesta

### 2.1 Sigue siendo Modo A (/reservar/[slug]?embed=1), no un cuarto sistema

Ni un "web component nuevo" (el handoff lo sugiere solo por desconocer que
ya existen dos mecanismos de embebido en este repo) ni Modo B (le falta
Ruta A de pago entero, §0). El rediseno visual + Theme Builder se construye
sobre Modo A, reutilizando:

- ReservaCalendario / rail-filtros.tsx como base de la pantalla 01/02,
  reestructurados (no reescritos desde cero) para el patron de tira de 10
  dias + chips pildora del handoff — ver 2.3 sobre cuanto layout es
  genuinamente nuevo.
- Los pasos 'datos'/'pago'/'done'/'espera'/'pendiente' de PR #1197 para las
  pantallas 03-09 — copy y componentes nuevos por ENCIMA de un step-machine
  que ya existe, no una maquina de estados nueva.
- apariencia-widget.ts como la base del sistema de tokens, EXTENDIDA (§3),
  no sustituida por un vocabulario --t-* paralelo.
- El patron de vista previa por iframe (WidgetPreview) para el editor del
  Theme Builder nuevo.

### 2.2 El Theme Builder es un editor NUEVO, con el motor de tokens EXTENDIDO — no el editor de temas del portal reutilizado

components/theme/theme-editor.tsx edita el Theme del PORTAL
(lib/theme-schema.ts) — mezclar ambos formularios en una sola UI reabriria
la separacion ya decidida en 1.4. La UI del Theme Builder del widget es
NUEVA (un editor dedicado, en Configuracion > Estudio > Widget de reservas
o seccion equivalente), pero:

- Su tipo de datos (AparienciaWidget) se EXTIENDE, no se reemplaza — sigue
  viviendo en lib/reservar/apariencia-widget.ts, con mas campos.
- Su motor de resolucion (resolverApariencia, URL pisa lo guardado con
  validacion) se reutiliza tal cual para los campos nuevos.
- Su gate de contraste reutiliza lib/wcag-contrast.ts (cumpleContraste /
  foregroundParaFondo) — el mismo que ya usa el Theme Builder del portal,
  en vez de reinventar el umbral YIQ del handoff.
- Su vista previa reutiliza el patron de WidgetPreview (iframe a ?embed=1
  con los parametros del borrador).

### 2.3 Cuanto del layout es genuinamente nuevo

| Pieza del handoff | Ya existe (reutilizar) | Nuevo |
|---|---|---|
| Cabecera (avatar+nombre+ubicacion) | estudioNombre/estudioLogo/estudioDireccion ya resueltos en page.tsx | Composicion visual (avatar circular 36px) |
| Tira de dias | — | SI: ReservaCalendario pinta semana con flechas, no 10 dias con scroll +-240px. Requiere nueva subcomponente o modo de contarSlotsPorDia/localDayKey (lib/reserva-calendario-logic.ts) ya reutilizables como logica, solo cambia el render |
| Chips de filtro por tipo | RailFiltros ya calcula opcionesDe/vaLaPena | SI el layout (chips inline vs rail lateral) — la LOGICA de que opciones mostrar se reutiliza, la disposicion visual no |
| Fila de clase (hora/nombre/instructor/aforo) | ReservaSlot, colorOcupacion/etiquetaOcupacion (lib/ocupacion.ts) | Composicion visual (3 columnas fijas del handoff) |
| Skeleton al cambiar de dia | A verificar si existe ya un loading state en ReservaCalendario (no confirmado en esta auditoria) | Probablemente nuevo |
| Paso datos/pago/checkout/pago-en-proceso/fallido/confirmada | Step-machine de PR #1197 | Composicion visual completa, pendiente de que #1197 llegue a revision |
| Lista de espera / estado vacio | aceptarOfertaEspera, textos de vacio ya existen en algun grado | Composicion visual |
| Movil 390 | El patron cq()/clamp() de reservar-publico-tokens.ts YA es responsive por container query | Ajuste de breakpoints concretos si no calzan con los del handoff |

## 3. Plan de tokens: --t-* del handoff -> sistema real

| Token handoff | Mapeo propuesto | Nota |
|---|---|---|
| --t-bg | AparienciaWidget.fondo (ya existe) | Sin cambios |
| --t-surface | Campo NUEVO `superficie` en AparienciaWidget | Hoy fijo a MODO_TOKENS.dia.surface |
| --t-ink | Campo NUEVO `tinta` | Hoy fijo |
| --t-mut | Campo NUEVO `textoSecundario` (o derivado de `tinta` con opacidad) | A decidir en implementacion |
| --t-line | Campo NUEVO `linea` | Hoy fijo |
| --t-soft | Campo NUEVO `relleno` | Hoy fijo |
| --t-acc | Ya existe: --portal-brand (Theme Builder del portal) | Reutilizar, NO duplicar como campo de AparienciaWidget — un estudio no deberia fijar dos colores de marca distintos entre portal y widget salvo que se decida expresamente lo contrario |
| --t-accink | foregroundParaFondo/cumpleContraste de lib/wcag-contrast.ts | Ya derivado automaticamente para el portal; reutilizar la funcion, no la formula YIQ del handoff |
| --t-err / --t-ok | Semantic tokens ya existentes (lib/portal-tokens.ts, `semantic`) | Verificar en implementacion si ya cubren los mismos matices de color |
| --t-rc / --t-rb / --t-ri | AparienciaWidget.radio se DESDOBLA en 3 campos (radioTarjeta/radioBoton/radioInput), con `radio` legacy como alias de radioTarjeta para no romper snippets ya publicados | Migracion de campo unico a 3, con compatibilidad hacia atras |
| --t-fd / --t-fdw / --t-fdls | Campo NUEVO `fuenteDisplay` (+ peso/letter-spacing) | AparienciaWidget.fuente pasa a ser fuenteUI; ambas opcionales |
| --t-fu | AparienciaWidget.fuente renombrado a fuenteUI (o alias) | — |
| --t-sp (densidad) | Campo NUEVO `densidad: compacta/normal/aireada` -> multiplicador aplicado en reservar-publico-tokens.ts | Requiere que ese fichero deje de tener paddings fijos — trabajo real, no trivial |
| Estilo de tarjeta (borde/sombra/plano) | Campo NUEVO `estiloTarjeta` | Hoy shadow.card es una constante fija |
| Layout lista-vs-grid-semanal | Campo NUEVO `layoutClases` | Requiere una segunda implementacion de render, no solo un token — no es "solo CSS" |

Conclusion de esta seccion: la hipotesis por defecto del encargo (mapear a
extensiones del sistema existente, no un vocabulario paralelo) se confirma
para la mayoria de tokens — pero tres piezas no son solo tokens CSS nuevos,
son trabajo estructural: densidad (tocar el fichero de constantes fijas),
estilo de tarjeta (idem) y layout lista-vs-semanal (segunda implementacion
de render). Estas tres deben tratarse como fases propias, no como "anadir
un campo mas" (§5).

## 4. Alcance de esta pieza — que queda fuera y por que

1. Ruta B (cobro directo de precio_puntual, §1.6) queda fuera de la primera
   fase. El handoff asume precio fijo por clase sin plan (04-checkout.png),
   pero es la Ruta B que reserva-sin-login-diseno.md §9 dejo fuera a
   proposito por ser trabajo de diseno aparte (endpoint nuevo, funcion
   entregarReservaClaseSuelta, posible columna nueva en tipos_clase).
   Recomendacion: la primera fase visual usa Ruta A (plan PUNTUAL resuelto
   por servidor, mismo importe que veria la clienta) con el mismo copy
   "18,00 €" — la clienta no distingue si por detras hay un plan de una
   sesion o un cobro directo; solo el fundador necesita saber que hoy es
   Ruta A. Si el fundador confirma que quiere Ruta B de verdad (precio por
   sesion sin plan de catalogo), es un diseno de backend aparte antes de
   que el frontend de checkout tenga sentido.
2. PR #1197 debe mergearse (o revisarse en paralelo) antes de que las
   pantallas 03-09 tengan algo real que ensenar — hoy son la unica pieza de
   backend de "pagar sin login" que existe, y no estan en main.
3. Modo B (widget-bundle) queda fuera de esta fase, mismo criterio que ya
   fijo reserva-sin-login-diseno.md §3.2: portar Ruta A completa a Shadow
   DOM es alcance real, no una consecuencia trivial del rediseno visual.
4. Densidad/estilo de tarjeta/layout lista-vs-semanal (§3) son Fase 2, no
   parte del primer PR — son las tres piezas de la tabla de tokens que no
   son "solo CSS".
5. Nada de esto se ha verificado en navegador real — mismo tipo de
   limitacion que el resto de fases de este repo sin credenciales de
   Stripe/sesion de prueba en este entorno; la verificacion visual contra
   las 11 capturas es un paso de implementacion, no de este documento.

## 5. Plan de implementacion por fases

### Fase 0 — depende de #1197
Mergear o revisar claude/checkout-sin-login-impl antes de empezar el
rediseno de las pantallas de pago — de lo contrario se esta pintando
encima de un flujo que puede cambiar de forma bajo los pies.

### Fase 1 — Theme Builder minimo + rediseno visual de pantallas 01/02/08/09/10
- Extender AparienciaWidget (lib/reservar/apariencia-widget.ts): separar
  radio en 3, anadir superficie/tinta/textoSecundario/linea/relleno,
  renombrar fuente -> fuenteUI, anadir fuenteDisplay.
- Editor nuevo (components/theme/widget-theme-editor.tsx o similar) +
  reutilizacion de WidgetPreview para vista previa en vivo.
- Reestructurar ReservaCalendario / nuevo subcomponente de tira de dias
  (10 dias, scroll horizontal) — o un modo alternativo detras de un prop,
  para no romper la tira de semana donde ya se usa sin el nuevo layout.
- Reidseno de rail-filtros.tsx -> chips pildora inline (o nueva variante de
  layout, reutilizando opcionesDe/vaLaPena).
- lib/reservar-publico-tokens.ts: sustituir constantes fijas de radio/
  sombra por lectura de AparienciaWidget resuelto.

### Fase 2 — pantallas de pago 03-07 (depende de Fase 0)
- Copy y composicion visual nueva sobre los pasos 'datos'/'pago'/'done'/
  'espera'/'pendiente' de PR #1197.
- Verificacion de que CheckoutEmbebido reutilizado admite el resumen de
  clase pintado ENCIMA del PaymentElement con el estilo del handoff.

### Fase 3 — densidad, estilo de tarjeta, layout lista-vs-semanal
Los tres tokens estructurales de §3, cada uno con su propio diseno de
implementacion (no trivial).

### Fase 4 (deferred, requiere confirmacion explicita del fundador)
- Ruta B (precio_puntual directo, sin plan) — solo si se confirma que el
  handoff no es solo copy de ejemplo.
- Portar a Modo B (widget-bundle).

## 6. Checklist de verificacion

- npx tsc --noEmit + npm run lint (React Compiler es estricto con
  memoizacion manual — ver memoria del repo).
- node --test --experimental-strip-types sobre cualquier logica nueva en
  lib/** (extension .ts explicita en imports relativos).
- Verificacion visual en navegador real de las 11 pantallas contra las
  capturas de screenshots/, en ambos anchos (390px y 760px+, container
  queries) — el handoff es "high-fidelity", pixel-perfect es el criterio
  de aceptacion explicito del propio material.
- webkit-publico (Playwright): extender o crear specs para
  /reservar/[slug]?embed=1 — es una pantalla publica, sufrida por alguien
  externo (regla ya fijada en .claude/tentare-os.md).
- Gate de contraste WCAG (cumpleContraste) contra CUALQUIER combinacion de
  tokens que el Theme Builder nuevo permita guardar — un tema mal
  combinado no debe poder publicarse, mismo criterio que el Theme Builder
  del portal.
- Si Fase 2 llega a implementarse: los mismos e2e ya disenados en
  docs/reserva-sin-login-diseno.md §10.2 (camino feliz, pago fallido,
  doble click, refresh tras pago, servidor dice no) — no reinventar el
  plan de pruebas, solo pintarlo con el nuevo diseno visual.

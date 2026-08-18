# Auditoría de la app de la alumna — Fase 1

Fecha: 2026-08-18. Sin cambios de código: esto es solo el diagnóstico y el plan.

Todo lo que sigue está comprobado contra el código, la base de datos de producción
o el navegador. Lo que no he podido comprobar lo digo explícitamente en vez de
darlo por bueno.

---

## 0. El mapa: qué es «Alumna» exactamente

No es una app aparte. Es el **kit del portal** (`components/portal-tema/`), una
sola implementación con los temas como datos (`themes/<id>/config.ts` +
`tokens.css`). Se monta en `/portal/<slug>/…` desde `PortalShell`, que decide
entre el kit y el portal de siempre con dos condiciones a la vez:
`studio.portalReact` y que el tema publicado sea uno del kit.

- **21 pantallas** en `components/portal-tema/screens/`.
- **Store único** (`store/PortalStore.tsx`, 43 KB) con `useReducer` + persistencia
  en `localStorage` bajo `tentare-portal`.
- **Un view model** (`store/useViewModel.ts`, 662 líneas) que traduce store +
  datos + tema a lo que pinta cada pantalla.
- **CSS**: 3.347 líneas en 16 ficheros numerados, acotadas bajo `.portal-tema`,
  con los tokens por tema en `html[data-theme="…"]`.
- **Datos**: un único `POST /api/public/studio-data` trae el catálogo, más
  `/api/public/session`, `/historial` y los avisos.

### Lo que funciona y no hay que romper

- **Reservar y cancelar.** El camino real pasa por `crearReservaPublica` y la RPC
  `reservar_plaza` / `cancelar_reserva_plaza`, con aforo bajo candado y las reglas
  por tipo de clase. El kit **no** reimplementa nada de eso: llama y espera la
  respuesta. La elección de sitio (`.plazas`) tiene e2e propio.
- **La semántica HTML.** Busqué `<div onClick>` en todo el kit: **cero**. Todo lo
  pulsable es `<button>`. Es mejor de lo que la mayoría de estas auditorías
  encuentra y no pienso tocarlo.
- **La hidratación defensiva.** Al recargar se descartan `loading`, `hoja`,
  `ultimaReserva` y el día seleccionado. Eso evita una clase entera de bugs
  (hojas fantasma, spinners colgados, abrir la app en «¡Reserva confirmada!»).
- **`!important`**: uno solo, en `keyframes.css`. No hay guerra de especificidad.

---

## P0 — Crítico

### P0-1 · Favoritas no existe de verdad

**Pantalla**: acceso rápido «Favoritas», corazón del detalle de clase.
**Archivo**: `components/portal-tema/store/PortalStore.tsx:864-873`.

`toggleFavourite` escribe en `state.favourites` (localStorage) y nada más.
`showFavourites` **lanza un aviso** — «3 clases guardadas» — y ya: no hay pantalla
de favoritas en ningún sitio.

Y hay backend real sin usar: `app/api/public/favoritos/route.ts`
(`toggleFavoritoPublico`), autenticado por JWT con el mismo patrón que
`/api/public/reserva`, ya consumido por `studio-context` (`favoritos`).

Además los dos modelos no encajan: **el kit guarda el id de la sesión**
(`s.classId`, una clase concreta de un día concreto), **el backend guarda
`tipoClaseId`**. Marcar «Reformer del martes» no es marcar «Reformer».

**Solución**: cablear `toggleFavourite` al endpoint existente cambiando la clave
a `tipoClaseId`, con estado optimista y reversión si falla, y construir la
pantalla de favoritas con su estado vacío. Cero backend nuevo.

### P0-2 · «Mis datos» puede guardar campos vacíos encima de los reales

**Pantalla**: Perfil → Datos personales.
**Archivo**: `components/portal-tema/screens/MyData.tsx:26-31`.

El formulario hace `useState` con los valores de `vm.profile` **al montar**, y el
fichero no tiene **ni un solo `useEffect`** (comprobado: `grep -c useEffect` → 0).
Si la pantalla se abre antes de que el perfil haya llegado, los seis campos salen
vacíos, y «Guardar cambios» envía esos vacíos.

Es el mismo patrón que ya nos costó el autoguardado de Apariencia: fijar la línea
base antes de que carguen los datos.

**Solución**: resincronizar el formulario cuando llegue el perfil mientras no
haya edición en curso, y no permitir guardar hasta que haya datos cargados. Falta
además validación (email, teléfono) y el botón «Guardar» está **fuera** del
`<form>`, con lo que hay dos caminos de envío distintos.

### P0-3 · Navegación congelada — YA ARREGLADO en esta sesión

Documentado aquí porque es la causa de «los botones dejan de funcionar» que
reportaste. `mandaLaRuta` escribía su excepción por exclusión, y el estado inicial
del store (`welcome`) bloqueaba la ruta desde el primer render: sin barra de
pestañas y sin responder a nada, con el Inicio pintándose por un fallback.
Arreglado y desplegado en [#1176](https://github.com/EcomRodrii/pilates-saas/pull/1176).

**Queda por hacer**: verificar en tu móvil que no hay una segunda causa. Si
después del despliegue vuelve a pasar, hay que buscarla — pero ya con andamiaje:
`montarPortal` acepta `kit`, así que el portal autenticado se puede reproducir.

---

## P1 — Alto

### P1-1 · «Historial de clases» va a la Agenda

**Archivo**: `components/portal-tema/screens/Profile.sereno.tsx:72`.
La fila llama literalmente a `actions.goBookings`. No es un enlace mal puesto: no
hay pantalla de historial.

Sí hay **backend**: `historialAsistidasPublico` + `POST /api/public/historial`,
construidos hace unos días, que devuelven las clases asistidas ordenadas por
fecha descendente. Hoy solo los consume la pestaña «Completadas» de la Agenda.

**Solución**: pantalla de historial propia (asistidas y canceladas, con fecha,
clase, instructora y sala), reutilizando el endpoint. La Agenda mira hacia
delante; el historial hacia atrás. Son cosas distintas.

### P1-2 · Método de pago: no se puede añadir, y el texto que lo explica está desfasado

**Archivo**: `components/portal-tema/components/ui/hojas.tsx:179-217`.

La hoja dice *«Se guarda sola la primera vez que compras un bono»*, y un comentario
justifica que no haya botón de añadir: *«ese botón no existe aquí, y no por
olvido»*. **Eso ya no es cierto**: `app/api/stripe/setup-tarjeta/route.ts` existe,
es semipúblico a propósito (la socia lo abre sin sesión de staff), y hace
exactamente eso — Checkout alojado de Stripe en `mode: 'setup'`, sin que
toquemos nunca el número de tarjeta.

**Eliminar tarjeta**: aquí sí falta backend. No hay ningún `paymentMethods.detach`
en el repo. Endpoint a crear, con su confirmación y su aviso de consecuencias
(si hay cuotas domiciliadas, quitar la tarjeta las deja sin método).

**Falta también** la frase que explique para qué se usa. Y hay que decir la verdad
del producto: se usa para cobrar bonos y cuotas del estudio, y —si el estudio lo
tiene activado— penalizaciones por cancelación tardía o no-show.

### P1-3 · Los interruptores de avisos del perfil no guardan nada

**Archivo**: `PortalStore.tsx:881-884` (`toggleNotification`).
Escriben en estado local y se persisten en `localStorage`. Las preferencias reales
de canal y push de la socia viven en otra pantalla (`/preferencias`).

Un interruptor que se mueve y no hace nada es peor que no tenerlo: la socia cree
que ha desactivado un aviso y le sigue llegando.

**Solución**: o se cablean a las preferencias reales, o se quita la sección del
perfil del kit y se enlaza a la pantalla que sí funciona.

### P1-4 · Clases no enseña a la instructora, y sí tiene con qué

**Archivos**: `components/portal-tema/components/layout/chrome.tsx:179-201`
(`ClassRow`), `screens/Schedule.tsx`.

La fila pinta un **monograma** (`<Avatar>{row.initial}</Avatar>`). En producción,
**7 de las 9 instructoras de `studio-1` tienen `foto_url`**. Se está sustituyendo
un dato real por una inicial.

Sobre valoraciones: la tabla `valoraciones` existe (`instructor_id`, `puntuacion`,
`comentario`), pero tiene **2 filas en total**, ambas de 5. Enseñar «5,0 ★» con
una valoración es exactamente el porcentaje sin respaldo que ya nos costó un bug
en la tarjeta de sustituciones.

**Solución**: foto real con respaldo a monograma cuando falte o la imagen falle
(sin romper el layout). Valoración **solo** por encima de un mínimo de muestra, y
siempre con el número de valoraciones al lado; por debajo, no se enseña nada.
Nada de inventar ratings.

También falta jerarquía: hoy la hora, el nombre, el meta y el estado compiten. La
info debe leerse en dos golpes de vista, no en cinco.

### P1-5 · No hay skeletons en ninguna pantalla, y error state solo en 2 de 21

Medido: `grep -rl Skeleton screens/` → **0**. `EmptyState` → 7 de 21.
Algo parecido a «error» → 2 de 21.

Lo que hay es un esqueleto genérico en `PortalShell` mientras carga el catálogo:
un bloque igual para todas las pantallas, que no se parece a ninguna.

**Solución**: skeletons por pantalla para Inicio, Clases, Agenda y Bonos, que son
las que esperan datos; estado de error con acción de reintento donde hoy no hay
nada.

---

## P2 — Medio

### P2-1 · Tres implementaciones de la fila de clase, tres del perfil

`chrome.tsx` tiene `ClassRow`, `ClassRowSereno` y `ClassRowPlana`. `screens/` tiene
`Profile.tsx`, `Profile.tentada.tsx` y `Profile.sereno.tsx`.

La regla del repo es una implementación con banderas por tema, y el fichero por
tema como salida de emergencia. Se ha usado la salida de emergencia tres veces
para lo mismo. Es justo tu punto 31: `ClassCard` debería servir en Inicio, Clases,
Favoritas y Agenda sin cuatro versiones.

### P2-2 · `z-index` sin escala

Diez valores sueltos: 1, 2, 3, 8, 9, 20, 24, 26, 30, 100. La barra de pestañas
**no tiene ninguno**, y una cabecera pegajosa tiene 30. Hoy no chocan porque el
layout es flex, pero no hay nada que lo garantice: el primer `position: absolute`
nuevo lo rompe.

### P2-3 · 78 colores literales en el CSS del kit

27 hexadecimales y 51 `rgba()` escritos a mano en `styles/*.css`, fuera de los
ficheros de tema. Cada uno es un sitio donde un tema nuevo no puede entrar — es
la misma causa del disco magenta sobre fondo oscuro del logotipo.

### P2-4 · El view model entero se recalcula con cualquier cambio de estado

`useViewModel` es un `useMemo` con dependencias `[state, cfg, datos]`, y `state`
incluye `toast`, `toastId`, `loading`, `filter`, `day`… Mostrar un aviso recalcula
las clases, la agenda, el historial, los avisos, las profesoras y los planes, y
vuelve a pintar la pantalla completa: hay **un solo consumidor**, que es la
pantalla entera.

**Solución**: sacar del view model lo efímero (aviso, loading) y trocear el memo
por secciones, o seleccionar por porciones de estado. Sin tocar la lógica.

---

## P3 — Bajo

- **Bio de instructora**: 0 de 9 la tienen rellena. La hoja de profesora sale
  casi vacía siempre. O se pide el dato en el panel, o la hoja debe llevar algo
  más que el nombre.
- **`safe-area-inset`** aparece en 5 sitios del CSS. Hay que repasar teclado
  abierto, hojas y formularios, no solo la barra.
- **Estado inicial del store** con valores del prototipo (`classId: "c1"`). Hoy
  inofensivo, pero es prototipo colándose en producción.

---

## Lo que NO he podido comprobar, y por qué

Lo digo en vez de rellenarlo:

1. **Rendimiento real.** Medí la carga con `next dev`, que compila cada ruta
   dentro del test: 18,7 s hasta la barra y 1,2 s al cambiar de pestaña **no son
   cifras de producción** y no las uso para nada.
2. **Petición duplicada de `studio-data`.** La medí (2 llamadas en una sola carga),
   pero StrictMode está activo en desarrollo y ejecuta los efectos dos veces, lo
   que la explica entera. **No confirmado en producción.** Antes de tocar nada hay
   que medirlo contra el build (`E2E_USA_BUILD=1`).
3. **El portal real en tu móvil.** Sigo sin poder autenticarme contra producción.
   Todo lo de arriba sale del código, de la base de datos o del portal montado en
   pruebas.

---

## Plan de ejecución

Sigo tus diez fases, con una salvedad: **P0-2 (Mis datos) se adelanta**. Es el
único hallazgo que puede destruir datos de una socia, y esperar a la fase 8 para
arreglarlo no tiene defensa.

| Fase | Qué | Cierra |
|---|---|---|
| 0 | Mis datos: resincronizar y bloquear el guardado en vacío | P0-2 |
| 1 | Fundaciones: escala de `z-index`, colores literales a tokens, `Skeleton`/`ErrorState` | P2-2, P2-3, parte de P1-5 |
| 2 | Navegación: verificar que no hay segunda causa; barra con jerarquía y área táctil | P0-3 |
| 3 | Unificar `ClassCard` y el perfil; retirar las variantes duplicadas | P2-1 |
| 4 | Inicio contra la referencia; rediseño de accesos rápidos | — |
| 5 | Clases: foto real de instructora, valoración con mínimo de muestra, jerarquía | P1-4 |
| 6 | Favoritas: cablear al backend por `tipoClaseId` + pantalla + estado vacío | P0-1 |
| 7 | Agenda: coherencia con el resto | — |
| 8 | Perfil: historial propio, pagos (añadir + eliminar), avisos reales | P1-1, P1-2, P1-3 |
| 9 | Rendimiento: medir contra build ANTES de optimizar; trocear el view model | P2-4 |
| 10 | QA de extremo a extremo, con las reservas primero | — |

**Regla que me impongo en todas las fases**: reservar y cancelar se prueban
después de cada una, no solo al final.

**Backend nuevo necesario**: uno solo — eliminar método de pago (`detach`). Todo
lo demás se resuelve con endpoints que ya existen y no están cableados.

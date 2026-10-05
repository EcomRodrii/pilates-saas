# TENTARE COMPONENT GUIDELINES · v1.0

Cada componente usa **solo** tokens semánticos de `tokens.css`. Este documento define cómo se ve y se comporta cada uno; el código vive en `components/ui/`. La base técnica actual (base-ui + cva) se mantiene; lo que cambia es el aspecto.

## 0. Reglas globales (aplican a todos)
| Estado | Regla |
|---|---|
| Hover | Cambio de superficie (`surface-sunken` o un paso de Ink), 160 ms. Sin escalado ni sombra nueva. |
| Active | `translate-y: 1px`. |
| Focus | Anillo de 2 px `border-focus` con offset 2. Siempre visible con teclado. |
| Disabled | Opacidad 0,5 y sin eventos. Nunca solo por color. |
| Loading | El control conserva su ancho. Spinner de 14 px en lugar del icono. El texto no cambia. |
| Error | Borde y mensaje en `error-fg`. El mensaje explica, no culpa. |
| Touch | Objetivo mínimo de 44 px en móvil (se puede ampliar con padding invisible). |
| Texto | Mínimo 13 px. Horas, cifras y precios en `font-mono` tabular. |
| Accesibilidad | Contraste ≥ 4,5:1. El estado nunca se comunica solo con color. `aria-*` según el patrón WAI-ARIA del componente. |

---

## FOUNDATION

### Button
- **Anatomía:** [icono opcional] + etiqueta + [icono final opcional]. Radio `full`.
- **Tamaños:** sm 28 · md 36 · lg 44. Padding horizontal 10 / 16 / 20. Texto 13 / 14 / 15, peso 500.
- **Variantes:**
  - `primary`: `brand-strong` con texto `brand-strong-foreground`. Es la acción principal; una por vista.
  - `brand`: `--brand` del estudio. Para la acción principal en superficies del estudio (lanzador, ítem activo).
  - `outline`: borde `border-default`, fondo transparente.
  - `ghost`: sin borde; la superficie aparece al hacer hover.
  - `destructive`: `error-bg` con texto `error-fg`.
  - `cta-marketing`: Magenta 500 con texto blanco. Solo en web, para el alta.
- **Cuándo:** la etiqueta dice lo que pasa («Cobrar ahora», «Buscar sustituta»).
- **Cuándo NO:** para navegar a otra página (eso es un enlace); para más de una acción principal por vista.

### IconButton
- 36 × 36, radio `full`, icono de 16 a 17.
- `aria-label` obligatorio y tooltip al hacer hover.
- **Estado activo** (por ejemplo, privacidad activada): fondo `surface-sunken`.
- **Cuándo NO:** para acciones destructivas sin texto.

### Input
- **Base actual:** 40 de alto, radio `full`, fondo `surface-sunken`, sin borde. Padding 16. Texto 14 (16 en móvil para evitar el zoom de iOS).
- **Label:** encima, 13 / 500. **Ayuda:** debajo, 12 `text-tertiary`.
- **Estados:**
  - Focus: anillo `border-focus`.
  - Error: borde `error-fg` + mensaje.
  - Read-only: sin fondo y con texto `text-secondary`.
- **Datos numéricos** (precio, aforo): `font-mono`, alineados a la derecha.

### Select
- Igual que Input, con un chevron de 16 a la derecha.
- **Menú:**
  - Contenedor: `surface-raised`, radio `md`, `shadow-dropdown`, padding 6.
  - Opciones: filas de 36. La seleccionada lleva `selection` y un check en `text-link`.
- **Más de 8 opciones:** con buscador.
- **Cuándo NO:** con 2 o 3 opciones (usar Tabs segmentadas o Radio).

### Textarea
- Igual que Input, con radio `lg` (16), porque la píldora se deforma en varias líneas.
- Mínimo 3 líneas. Contador en mono si hay límite.

### Checkbox
- Caja de 18, radio 5, borde 1,5 `border-strong`.
- **Marcado:** fondo `text-primary` con check en `text-inverse`.
- **Indeterminado:** guion.
- La etiqueta es clicable.

### Radio
- Círculo de 18 con borde 1,5. Seleccionado: punto interior de 8 en `text-primary`.
- **Cuándo NO:** con más de 5 opciones (usar Select).

### Toggle (Interruptor)
- Pista 36 × 20 y radio `full`.
- **Off:** `border-default`. **On:** `brand-strong`.
- Pomo de 16 en Paper.
- Cambia en el acto, sin botón de guardar. Si el cambio no se aplica en el acto, usar Checkbox.

### Badge
- 20 de alto, radio `full`, padding 8, texto 12 / 500.
- **Tonos** (`fondo-100` con texto `-700`):
  - neutral (`surface-sunken` / `text-primary`)
  - info
  - success
  - warning
  - error
  - attention (Magenta 100 / 700)
- **Severidad del Centro de Control:** Crítico = error · Importante = warning · Recomendación = neutral.
- Un badge marca un estado y no es interactivo. Para filtros, usar Tabs/pills.

### Avatar
- **Tamaños:** sm 32 · md 40.
- **Contenido:** foto o iniciales (12 / 600) sobre `surface-sunken`.
- **Sin persona asignada:** «?» en `error-bg` / `error-fg`.
- El círculo completo solo se usa para personas.

### Tooltip
- **Estilo:** glass oscuro, radio `sm`, texto 12, ancho máximo 240.
- **Comportamiento:** aparece a los 400 ms; con foco, en el acto.
- **Cuándo NO:** para información imprescindible.

---

## LAYOUT

### Card
- **Estilo:** `surface-raised`, radio **24 px** (`--t-radius-product-card`, patrón aprobado), `shadow-card`. Los `rounded-3xl` actuales (38,4 px en el repo) son LEGACY y se migran en la fase 6.
- **Padding:** 20 (sm 16).
- **Cabecera opcional:** título 14–16 / 500–600 + acción a la derecha (enlace `text-secondary`), separada por `border-subtle`.
- **Cuándo NO:** dentro de otra card. Para eso, filas con divisor.

### Panel (lateral)
- **Estilo:** `surface-raised`, ancho 420–560, radio izquierdo `card`.
- **Pie fijo:** glass sólido con las acciones.
- **Cuándo:** la ficha de una clase, de una clienta o rellenar un hueco, sin salir del contexto.

### Modal
- **Estilo:** radio `modal` (20), ancho máximo 560, padding 24.
- **Velo:** `rgba(34,42,51,.4)` con blur 4.
- **Título:** en forma de pregunta, 18 / 600. El texto explica la consecuencia.
- **Acciones:** abajo a la derecha. La destructiva en `destructive` y a la derecha.
- **Cuándo NO:** para formularios largos (usar Panel).

### Drawer (móvil)
- Desde abajo, radio superior `card`, con una asa de 36 × 4.
- Equivale al Panel en móvil; el «Más» del menú usa la sidebar a pantalla completa.

### Section
- Bloque de página con título h3/h2 y separación de 24 en producto o 96–128 en marketing.
- **OPEN DECISION:** con el índice editorial retirado de la web, no hay numeración de secciones.

### Divider
- 1 px `border-subtle`. Para abrir un bloque mayor, 1 px `border-strong`.
- Prohibido: bordes de color a un solo lado y grosores de 3 px o más.

### Empty State
- **Anatomía:** label mono (contexto) + frase con voz de marca (20–22 / 600) + línea de horario punteada + acción principal + atajo opcional.
- **Sin ilustración.**
- **Cuándo NO:** cuando hay error de carga (eso es una Alert con «Reintentar»).

### Skeleton
- Bloques `surface-sunken` con la forma final; pulso de opacidad de 1,4 s.
- Si `prefers-reduced-motion`, estático.

### Toast
- **Estilo:** glass oscuro, radio `lg`, abajo a la derecha (en móvil, arriba de la barra inferior).
- **Contenido:** hora en mono + mensaje de 14 / 500 + acción «Deshacer» si se puede.
- **Duración:** 5 s; se pausa con hover o foco.

### Alert
- **Estilo:** en línea, radio `md`, padding 11 × 14. Punto de 7 + texto 13 / 500 + una acción.
- **Tonos:** info, success, warning, error.
- **Cuándo NO:** para celebrar (eso es un Toast).

---

## NAVIGATION

### Sidebar
- **Forma:** flotante, radio `nav` (28), `surface-nav`.
- **Tamaños:** Pequeño 64 · Normal 224 · Grande 288. También admite el modo «barra arriba».
- **Orden:** selector de sede → Esencial/Todo → bloque superior (Resumen, Centro de Control, Automatizaciones) → grupos con label mono (OPERACIÓN · EQUIPO · NEGOCIO · ESTUDIO) → Portal clientes → usuario → tamaño.
- **Ítem:**
  - 40 de alto, radio `full`, icono de 17.
  - Activo: `--brand` con texto `brand-foreground`.
  - Contador: badge `error` si pide acción; mono neutro si es informativo.
- **Nunca:** glass.

### Topbar
- **Forma:** 56 de alto, fija, glass ligero.
- **Izquierda:** lanzador «¿Qué quieres hacer o buscar?» en `--brand`, ancho máximo 440, con ⌘K en mono.
- **Derecha:** píldora de prueba · privacidad · mensajería · notificaciones (contador `error`) · perfil.

### Tabs
- **Segmentadas:** pista `surface-sunken`, radio `full`, la píldora activa `brand-strong` se desliza en 400 ms.
- **De página:** texto 14 / 500 con subrayado de 2 px en `border-strong` en la activa.
- **Cuándo NO:** con más de 5 pestañas.

### Breadcrumbs
- Texto 13 `text-tertiary`, separador «/» y el último en `text-primary`.
- Solo con 3 niveles o más (Configuración › Clases › Reformer).

### Search
- **Lanzador global:** ⌘K, ventana modal, resultados por grupos con label mono.
- **Filtro local:** Input con icono de lupa.
- Los resultados buscan también por alias (nombres antiguos de las secciones).

---

## PRODUCT

### KPI card
- **Anatomía:** label mono + cifra (`metric` 40–48, la unidad al 40 %) + variación en mono con color de estado.
- Máximo 4 por fila; nunca 3+1 (4 → 2 × 2).
- En modo privacidad, la cifra se sustituye por «•••».

### Chart
- **Barras:** `surface-sunken`, con una serie en Blue 500 (alerta en Magenta solo si hay que actuar).
- Solo el eje base, 1 px `border-strong`. La cifra va encima del gráfico, nunca dentro.
- Máximo 4 series. Sin tartas ni 3D.

### Table
- **Filas:** 48 (compacta 40), divisor `border-subtle`.
- **Cabecera:** label mono con línea `border-strong`.
- **Datos:** cifras en mono, alineadas a la derecha. Selección en `selection`.
- **Rayado cebra:** no.
- **Móvil:** scroll horizontal propio o cards de fila.

### Calendar
- **Clase:** card de radio 12, con hora en mono, nombre 13 / 600 y ocupación en mono.
- **Tipo de clase:** por tono (Blue 100 · Stone · Cream), máximo 4.
- **«Ahora»:** línea de horario con punto magenta.
- **Huecos libres:** punteado. **Alerta de clase:** borde 1,5 `error-fg`.
- **OPEN DECISION:** cómo se correspondería la paleta categórica actual (nueve tonos) con estos cuatro tonos.

### Class card («Hoy en el estudio» / fila de clase)
- **Columnas:** 70–96 hora (`data-lg` + «→ fin» en mono 11) · punto de tipo de 6–7 · avatar + instructora + «Tipo · Sala» · ocupación «N / M plazas» + barra segmentada (un segmento por plaza) · estado de las alumnas (confirmadas, pendientes, huecos, motivos) · acción.
- **Estados:**
  - Pasada: opacidad 0,6.
  - Problema: fondo de error al 5 % y nombre en `error-fg`.
- **Acción según estado:** «Rellenar huecos» (outline) · «Buscar sustituta» (primary) · «Pasar lista» · «Todo preparado» (enlace).

### Client row
- Avatar 32 + nombre 14 / 500 + bono o cuota + saldo en mono a la derecha + estado (Badge).
- Clic → panel con la ficha.

### Payment row
- Concepto · persona · importe en mono a la derecha (en `error-fg` si ha fallado) · estado (cobrado / reintentando / fallido) · acción («Cobrar ahora», «Pedir nueva tarjeta»).

### Subscription card
- Nombre de la cuota · importe/mes como `metric` · próxima renovación en mono · estado.
- **Al fallar un cobro:** se muestran los reintentos +1 / +3 / +7 días.

### Bonus card
- **Nombre:** «Bono 10».
- **Saldo:** «6 / 10» en mono, con barra segmentada como la ocupación.
- **Caducidad:** en mono; en `warning-fg` si caduca en menos de 7 días.

### Instructor row
- Avatar + nombre + clases de la semana en mono + disponibilidad (punto) + valoración, si existe.

### Attendance state
- Punto + texto:
  - asistió (●, Ink)
  - confirmada (●, Ink 500)
  - pendiente (●, warning)
  - hueco (○)
  - ausente (●, error)
  - cancelación (●, Ink 300)

### Replacement workflow (sustituciones)
- **Cuatro pasos:** Buscando → Esperando tu visto bueno → Contactando → Cubierta. Badge con el tono de cada paso.
- **Candidatas:** fila con avatar, nombre y motivo. La propuesta va resaltada con `success-bg` al 6 %.
- **Botón principal:** dice la acción («Avisar a Julia Ramos»).
- **Registro:** Activity timeline.

### Activity timeline
- Filas con hora en mono (44) + línea de horario (sólida = hecho, punteada = por llegar) + texto.
- Sin iconos de color.

---

## BOOKING (widget y app de alumnas: marca del estudio, estructura TENTARE)

### Date selector
- Pills en mono («LUN 5»), radio `full`. El día activo, en `brand-strong`. Desplazamiento horizontal en móvil.

### Time selector
- Lista vertical de horas en mono (`data`), filas de 48 o más.

### Class card (booking)
- Hora en mono + clase 16 / 600 + instructora + sala + Capacity indicator + Booking CTA.

### Capacity indicator
- Barra segmentada (un segmento por plaza) + «N plazas» en mono.
- **«Última plaza»:** Magenta 700. **Completa:** se pasa a Waitlist.

### Booking CTA
- Button `primary` lg en la marca del estudio, a ancho completo en móvil.
- Texto: «Reservar» · «Unirme a la lista de espera» · «Cancelar reserva».

### Waitlist
- Badge con la posición en mono («Nº 2 en espera»).
- Texto: «Si se libera una plaza, es tuya y te avisamos».

### Confirmation
- **Titular:** «Tu reserva está en su sitio.»
- Línea de horario con inicio y fin + clase · sala · estudio + «Añadir al calendario».
- Sin confeti ni animación de celebración.

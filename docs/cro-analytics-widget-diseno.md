# Fase 8 — CRO + Inteligencia del widget: diseño técnico

> Estado del repo auditado: `origin/main` @ `b546177e` (17 ago 2026). Fotografía para
> decisión, no código — la implementación es un paso posterior.
>
> Continúa `docs/booking-engine-architecture.md` (Fase 0), coexiste con
> `docs/checkout-embebido-diseno.md` (Fase 3, **diseñada pero sin implementar** — el
> checkout de hoy sigue siendo Stripe Checkout hospedado con redirect de página
> completa, no Elements embebido) y con `docs/account-widget-diseno.md` (Fase 4, en
> `main`). No depende de ninguna de las dos para poder construirse, pero §5 marca un
> punto de coordinación real con Fase 3.

## 0. Resumen de lo que dice el brief y lo que dice el código

El brief pedía cuatro cosas. Verificado en el código real (no en la auditoría de
Fase 0, que es de antes de las fases 1-5):

1. Conectar los eventos del catálogo que no se emiten.
2. Pantalla "Configuración → Crecimiento web" con el embudo.
3. Recomendaciones deterministas con datos reales.
4. Gestionar `booking_abandoned` sin dark patterns.

El dato de memoria de sesión ("6/13 sin conectar", de la auditoría Fase 0) está
**desfasado**. Reverificado hoy con `grep -rn trackEventoWidget`: son **7 de 13 sin
ningún caller**, no 6 — y los 6 conectados están cableados en sitios distintos a los
que la Fase 0 pudo haber previsto. El detalle exacto va en §1.

---

## 1. Estado real de instrumentación (los 13 tipos, uno a uno)

Fuente: `lib/reservar/eventos.ts` (catálogo + `trackEventoWidget`), llamado desde
`app/reservar/[slug]/page.tsx` (Modo A, iframe) y `app/widget-bundle/main.tsx` (Modo B,
Shadow DOM). Escrito por `POST /api/public/evento` → `registrarEventoWidget`
(`lib/db/supabase-data-admin.ts:1360-1377`) en la tabla `widget_eventos`
(`supabase/migrations/20260814124844_widget_eventos.sql`).

| Evento | Estado | Dónde dispara hoy / dónde debería |
|---|---|---|
| `widget_loaded` | ✅ Conectado | `page.tsx:355` (Modo A) y `main.tsx:73` (Modo B). |
| `widget_viewed` | ⚠️ **Conectado solo en Modo B** | `main.tsx:74`, junto a `widget_loaded`. En Modo A (`page.tsx`) **no se dispara nunca** — falta añadirlo junto a la línea 355. Para Modo A "cargado" y "visto" son el mismo instante (página completa, visible al pintar), así que ambos deben dispararse juntos, igual que ya hace Modo B. |
| `class_list_viewed` | ❌ Sin caller | La pestaña "Clases" es la pestaña por defecto (`tab` inicializado a `'clases'`, `page.tsx:448`) y también se selecciona con `setTab('clases')` en varios sitios. Disparar una vez por sesión (con un `useRef` guardia, mismo patrón que otros "solo una vez" del repo) en un `useEffect` gateado por `tab === 'clases'`, junto al bloque `{tab === 'clases' && (...)}` (`page.tsx:1474`). |
| `class_selected` | ✅ Conectado | `page.tsx:895`, dentro de `openBooking(sesionId)` cuando `sesionId` no está vacío. |
| `class_detail_viewed` | ❌ Sin caller | El "detalle de una clase" en este widget es el paso `'confirm'` del modal de reserva, que pinta tipo/fecha/hora/instructor/aforo (`page.tsx:2438-2467`, `loginStep === 'confirm' && bookingSesion`). Disparar ahí, no en `class_selected` — `class_selected` es la intención de abrir, este es el momento en que de verdad ve el detalle (puede haber login/registro/contrato de por medio antes de llegar). |
| `recommendation_started` | ❌ Sin caller | `DiscoveryQuiz` (`components/reserva/discovery-quiz.tsx`) es el único motor de recomendación que existe en el widget hoy — un filtro determinista por nivel/objetivo/horario/día sobre los slots ya cargados (comentario explícito en `page.tsx:1478-1480`: "no un motor de recomendación nuevo"). Disparar en los dos sitios que hacen `setQuizAbierto(true)` (`page.tsx:1504` y `page.tsx:1521`). |
| `recommendation_completed` | ❌ Sin caller | En `onCompletar={() => { setQuizAbierto(false); setQuizCompletado(true); }}` (`page.tsx:1497`). |
| `booking_started` | ✅ Conectado | `page.tsx:1038` (`handleConfirm`, camino con modal) y `page.tsx:1093` (`handleReservarCalendario`, camino rápido desde el calendario compartido). Ambos requieren socia **autenticada** para llegar hasta aquí (ver §5). |
| `checkout_started` | ✅ Conectado | `page.tsx:1155`, en `handleContratarPlan`, justo antes de navegar a Stripe Checkout hospedado. A diferencia de `booking_started`, **no requiere autenticación** — un visitante anónimo puede comprar un plan directo (botón en `page.tsx:2034`, sin gate de login antes). |
| `booking_completed` | ✅ Conectado | `page.tsx:1069` (tras `addReserva` OK en `handleConfirm`) y `page.tsx:1113` (camino rápido del calendario). |
| `lead_started` | ✅ Conectado | `page.tsx:952`, al pedir el enlace mágico (`handleEnviarEnlace`). |
| `lead_completed` | ❌ Sin caller | El propio comentario del código ya lo explica (`page.tsx:949-951`): el momento real (clic en el enlace del email) pasa en **otra pestaña/sesión** de navegador, así que `sessionIdWidget()` de quien pidió el enlace nunca coincide con la de quien lo abre — no se puede medir con el mecanismo de sesión actual tal cual. Ver §1.1 para la opción real. |
| `booking_abandoned` | ❌ Sin caller | Diseño completo en §5 — no es un solo punto, son dos caminos deterministas distintos (cierre del modal de reserva y "pago cancelado" de vuelta de Stripe). |

**Resumen**: 6 conectados de siempre (`widget_loaded`, `class_selected`,
`booking_started`, `checkout_started`, `booking_completed`, `lead_started`), 1 conectado
a medias (`widget_viewed`, falta Modo A), 6 sin ningún caller
(`class_list_viewed`, `class_detail_viewed`, `recommendation_started`,
`recommendation_completed`, `lead_completed`, `booking_abandoned`).

### 1.1 `lead_completed` — por qué no es un simple "añadir la llamada"

No hay ningún punto del código donde, tras entrar por el magic link, se sepa qué
`sessionId` (de `sessionStorage`, por diseño anónimo — ver el comentario de
`eventos.ts:19-24`) pidió ese enlace. Tres opciones reales, ninguna trivial:

- **(a) Propagar el `sessionId` en el propio magic link** (como query param, igual que
  ya se propaga `bookingSesionId` — comentario en `page.tsx:934-935`: "Propaga la clase
  elegida al enlace mágico... evita la fuga de conversión de re-buscar la clase"). Al
  volver, si el `sessionId` de la URL coincide con el de un `lead_started` reciente sin
  `lead_completed`, se dispara. Es la única opción que mide el caso real (mismo
  dispositivo, pestaña nueva o la misma) sin tocar el diseño anónimo de `widget_eventos`.
- **(b) Cruzar por franja de tiempo** (todo `lead_started` sin `lead_completed` en los
  últimos N minutos, del mismo `studioId`): impreciso con más de un lead simultáneo,
  descartado.
- **(c) No medirlo por sesión — inferirlo agregado** (leads_started vs. cuentas nuevas
  creadas por magic-link en el mismo período): es lo que ya permite construir §3 sin
  tocar nada más, pero no es un evento discreto por sesión.

**Decisión**: (a). Es la única que no rompe el "anónimo por diseño" de `eventos.ts` y
reutiliza un patrón que el propio código ya usa (`bookingSesionId` viaja igual). Al
volver del magic link, dispararlo en el mismo sitio donde hoy se resuelve el deep-link
(el `useEffect` que reacciona a `autenticado`/`socia`, junto al de `pagoAviso`).

---

## 2. Dónde se guardan y cómo se leen — hoy solo se escribe

`widget_eventos` (migr `20260814124844`) tiene RLS de lectura ya puesta
(`widget_eventos_lectura`: `studio_id = current_studio_id() and current_rol() in
('PROPIETARIO','MANAGER')`) e índices ya pensados para agregación
(`(studio_id, creado_en desc)`, `(studio_id, tipo, creado_en desc)`). **Cero código lee
de esta tabla** — confirmado con `grep -rn widget_eventos` fuera del insert de
`registrarEventoWidget`: un solo resultado, el propio insert. Se escribe desde hace
tres días y no hay ninguna query de agregación en ningún sitio.

### 2.1 Dónde vive la agregación

El patrón ya establecido para esto en este repo (no un patrón nuevo) es
`informe_ingresos`/`ingresos_por_dia`/`stats_clientas`/`ocupacion_por_tipo`
(`supabase/migrations/0096_informe_ingresos_server_agg.sql` y hermanas): funciones SQL
`language sql stable security invoker`, sin RLS propia porque **heredan la del cliente
que las llama** (por eso `security invoker`, no `definer`) — el agregado corre sobre
todas las filas que RLS ya le deja ver a esa sesión, sin el cap de 1000 filas de
PostgREST. Se llaman desde el cliente autenticado con `.rpc('nombre', {...})`
(`lib/supabase-data.ts:2857` es el ejemplo más corto) y se pintan en `/informes`
directamente, sin pasar por `useStudio()`/`fetchAllStudioData` — **decisión
deliberada**: esa función ya está señalada como riesgo conocido de over-fetching que no
se debe agrandar (`.claude/tentare-os.md`), y `widget_eventos` no tiene ningún motivo de
negocio para vivir en el snapshot que cada pantalla del panel descarga entera.

**Decisión concreta**: una función nueva `embudo_widget(p_desde date)` `security
invoker`, migración aditiva (próximo número tras el último existente — comprobar con
`list_migrations` en el momento de escribirla, no confiar en este documento), que
devuelve `(tipo text, n bigint)` agrupando `count(*) ... group by tipo`. Un solo
`GROUP BY` sobre una tabla con dos índices ya puestos para exactamente esta consulta —
nada de vista materializada. El volumen real lo descarta por sí solo: con los estudios
actuales del repo (memoria de sesión: 202 socias en el estudio más grande con datos
reales, "Por Stripe no ha pasado ni un euro en prod" salvo 1 tarjeta) el tráfico del
widget de un mes cabe sobradamente en un `count()` sin agregación previa. Si algún día
un estudio de verdad genera cientos de miles de eventos/mes, el índice
`(studio_id, tipo, creado_en desc)` ya puesto sigue sirviendo — no hay que rediseñar
nada, solo medirlo entonces.

Función gemela `embudo_widget_por_dia(p_desde date)` → `(dia date, tipo text, n bigint)`
para la serie temporal de la pantalla (§3), mismo criterio que
`dbIngresosPorDia`/`ingresos_por_dia`.

Wrapper cliente en `lib/supabase-data.ts` (junto a `dbIngresosPorDia` y compañía, no un
módulo nuevo — es exactamente el mismo tipo de función que las que ya viven ahí, y
crear `lib/analytics-widget.ts` para dos funciones de 8 líneas cada una sería la
abstracción prematura que este repo evita):

```ts
export async function dbEmbudoWidget(desde: string | null): Promise<{ tipo: string; n: number }[]>
export async function dbEmbudoWidgetPorDia(desde: string | null): Promise<{ dia: string; tipo: string; n: number }[]>
```

---

## 3. La pantalla "Crecimiento web"

### 3.1 Dónde vive

Nueva pestaña en `Configuración` (`app/(dashboard)/configuracion/page.tsx`), mismo
patrón que las 12 pestañas ya existentes: añadir `'crecimiento-web'` a `TabId`
(`page.tsx:232`), una entrada en `TABS` (`page.tsx:235-247`), y un componente
`TabCrecimientoWeb` cargado con `next/dynamic` como las demás (`page.tsx:18-30`) —
mismo motivo que ya documenta el comentario de esas líneas: no descargar el JS de esta
pestaña en las otras 12.

**No en `/informes`**: `/informes` es negocio interno del estudio (ingresos, ocupación,
clientas) filtrado por `puedeVerFinanzas` (`PROPIETARIO`/`RECEPCION`). El widget público
es un canal de marketing/captación, no de finanzas — la pestaña se gatea con
`puedeGestionarPortalHome` (`lib/permisos-reglas.ts:152`, `PROPIETARIO`/`MANAGER`),
**la misma pareja de roles que la RLS de `widget_eventos_lectura` ya exige** (no
`puedeVerFinanzas`, que es `PROPIETARIO`/`RECEPCION` — un conjunto de roles distinto:
RECEPCION no debería ver esto, MANAGER sí). Es el mismo criterio que ya separa
`puedeGestionarPortalHome` de `puedeVerFinanzas` en el propio comentario de esa función
("trabajo operativo/de marketing de sede, no facturación"). La UI que no coincide con
la RLS es exactamente el tipo de hueco que este repo ya se ha encontrado antes — aquí
se evita desde el diseño.

### 3.2 Componente de gráfico: reutilizar, no traer una librería

No hay `recharts` ni ninguna librería de gráficos en el repo (`grep` exhaustivo, cero
resultados fuera de dos archivos propios). El patrón ya establecido es SVG inline hecho
a mano: `components/dashboard/custom-charts.tsx` (`ChartLine`/`ChartBars`, ~20 líneas
cada uno, sin dependencias) alimentado por datos ya calculados en JS. **Reutilizar esos
dos componentes tal cual** (son genéricos: `{ label, value }[]` + color) para la serie
temporal del embudo. No se reutiliza `ChartCard` completo (está atado a
`DashboardChart`/`computeSerieGrafico`, que operan sobre `useStudio()` — datos que
`widget_eventos` no comparte ni debe compartir).

### 3.3 El embudo exacto

Seis números, en el orden que pide el brief, cada uno con su origen:

| Métrica | Origen |
|---|---|
| Visitas | `n` de `widget_loaded` |
| Vistas (de listado de clases) | `n` de `class_list_viewed` |
| Inicios de reserva | `n` de `booking_started` **+** `n` de `checkout_started` (dos entradas al funnel de conversión: reservar una clase y comprar un plan directo son caminos distintos, se muestran como dos sub-filas bajo "Inicios", no sumados a ciegas — sumarlos escondería cuál de los dos convierte peor) |
| Completados | `n` de `booking_completed` **+** conversión de plan (⚠️ ver nota) |
| Tasa de conversión | completados / visitas |
| Abandono | inicios − completados, con el desglose de `booking_abandoned` (motivo conocido) aparte de la diferencia bruta (motivo desconocido — cierre de pestaña sin interactuar, no medible, ver §5) |
| Leads | `n` de `lead_started`, con `n` de `lead_completed` al lado en cuanto §1.1 esté conectado |

⚠️ **Nota sobre "completados" del lado de compra de plan**: `checkout_started` no tiene
un `checkout_completed` equivalente en el catálogo — el pago real se confirma por
webhook de Stripe (`checkout.session.completed`), no por el cliente (por diseño: nunca
te fías del cliente para dinero, regla de este repo). El número real de planes
comprados desde el widget ya existe en `recibos`/`suscripciones` filtrado por origen,
no en `widget_eventos`. Para no inventar una cifra falsa cruzando dos fuentes con
semánticas distintas, la fila de "compra de plan" en la pantalla saca su numerador de
`dbInformeIngresos`-equivalente filtrado a suscripciones con `origen_lead` no nulo (ya
existe esa columna, `socios.origen_lead` / `origenLead` en el checkout), no de
`widget_eventos`. Se documenta como una limitación explícita del embudo del widget: la
mitad "reservar una clase" es 100 % medible con eventos anónimos; la mitad "comprar un
plan" solo se cierra cruzando con una tabla que si tiene PII.

### 3.4 Filtro de rango

Mismo `PERIOD_OPTS` que ya usa `/informes` (`page.tsx:44-49` de esa pantalla: semana /
mes / 3 meses / año) — no inventar un selector de fechas nuevo.

---

## 4. Recomendaciones deterministas — NO es un especialista del Decision OS

### 4.1 Qué pide el brief, literalmente

"usando solo datos reales (histórico, horario habitual, tipo de clase, disponibilidad,
nivel)". Estos son atributos de **una visitante concreta eligiendo una clase en tiempo
real**, no de un estudio agregado para la propietaria. Esto NO es lo mismo que "una
recomendación de negocio para la dueña" (que es lo que produce cada especialista de
`lib/decision/especialistas/`).

### 4.2 Por qué no es un especialista nuevo

El Decision OS tiene una forma muy concreta, y esta pieza no encaja en ninguno de sus
cuatro rasgos estructurales:

1. **Audiencia**: todo especialista (`Candidata`/`Recomendacion`) es para la
   **propietaria**, vía Centro de Control/Umbral. Aquí el destinatario es la
   **visitante del widget**, a menudo anónima.
2. **Cadencia**: el motor corre 2×/día (`decision-dispatcher`, `30 6,14 * * *`) sobre un
   `SnapshotEstudio` construido en batch. Una recomendación de clase tiene que
   responder en el momento en que la visitante abre el quiz o mira "Mi cuenta" — no
   puede esperar al siguiente ciclo de 12h.
3. **Identidad**: `Candidata.socioId` es opcional pero el motor entero está construido
   alrededor de iterar `s.socios` de un `SnapshotEstudio` completo. La mayoría de
   visitas al widget son de gente que **no es socia todavía** (esa es literalmente la
   página de captación) — no hay `SnapshotEstudio` que las contenga.
4. **Ya existe el patrón correcto, y es otro**: `lib/portal-sugerencias.ts`
   (`sugerirClase`) es exactamente "una recomendación determinista con motivo explícito,
   basada en historial real de ESTA persona, sin nada inventado" — la misma regla no
   negociable que pide el brief ("NADA de recomendaciones aleatorias... si no hay ningún
   hecho que la sostenga, esto devuelve `null`", comentario de ese archivo). Está en
   `main`, probado (`portal-sugerencias.test.ts`), y **hoy solo lo usa el portal
   privado** (`/portal/[slug]`), nunca el widget público.

Meterlo dentro de Decision OS obligaría a: (a) construir un `SnapshotEstudio` parcial
para visitantes anónimas sin socia, rompiendo su contrato de tipos; (b) o forzar una
`Candidata` sin `socioId` de tipo nuevo cuyo único consumidor sería el widget, nunca
Centro de Control — es decir, reimplementar `sugerirClase` una segunda vez con otro
envoltorio. Ninguna de las dos vale la pena cuando la función pura ya existe y ya está
probada.

### 4.3 Decisión: dos mecanismos, ya casi construidos los dos, ninguno nuevo del todo

**(A) Visitante sin historial (la mayoría del tráfico)**: `DiscoveryQuiz`
(`components/reserva/discovery-quiz.tsx`) ya es el motor determinista correcto — filtra
los slots reales ya cargados por nivel/objetivo/horario/día, sin datos inventados. El
único trabajo de Fase 8 aquí es **conectar los eventos** (§1: `recommendation_started`/
`recommendation_completed`), no construir nada nuevo.

**(B) Visitante autenticada con historial real (Mi Cuenta, Fase 4)**: reutilizar
`sugerirClase` (`lib/portal-sugerencias.ts`) tal cual, sin tocar su código — es pura y
sin I/O, solo necesita que se le pasen `reservas`/`sesiones`/`tiposClase`/
`suscripciones` de esta visitante. El dato ya está disponible: `docs/account-widget-diseno.md`
§0 confirma que `fetchPublicStudioData` **ya descarga** `pub.socia.reservas` (TODAS,
todos los estados) para cualquier visitante autenticada del widget, y hoy `useDatosWidget`
solo lo usa para el mapa de aforo (`usar-datos-widget.ts:66`) — el resto "se tira a la
basura", en palabras del propio diseño de Fase 4. Renderizar `sugerirClase(...)` sobre
ese mismo payload en la pestaña "Mi cuenta"/como banner en "Clases" cuando hay
`porCostumbre: true` es exactamente conectar un dato que ya llega, no pedir uno nuevo.
`recommendation_started`/`recommendation_completed` se disparan aquí igual, cuando la
sugerencia se pinta / cuando la visitante reserva la clase sugerida.

**Descartado explícitamente**: un especialista `CRO`/`WIDGET` nuevo en
`lib/decision/especialistas/` que avisara a la propietaria de patrones del embudo
("el 40 % abandona en checkout los domingos") — es una idea legítima y SÍ encajaría
en la forma del Decision OS (estudio-agregado, sin socioId, como `MARKETING`/
`PREPARAR_CAMPANA`), pero el brief no lo pide (pide recomendar una CLASE a una
visitante, no un insight a la propietaria) y añadirlo por iniciativa propia sería
inflar el alcance de esta fase. Si se quiere en el futuro, es una fase separada con su
propio diseño — la pantalla de §3 ya le da a la propietaria los números crudos para
notar el patrón ella misma mientras tanto.

---

## 5. `booking_abandoned` — sin cron, sin PII nueva, dos disparos deterministas

### 5.1 Cuándo se considera "abandonada"

**No** un heurístico de "N minutos sin completar" vigilado por un barrido periódico.
El cliente ya sabe con certeza, en el momento, cuándo alguien se fue sin terminar —
no hace falta inferirlo después:

1. **Se cierra el modal de reserva sin terminar**: `closeBooking` (botón X,
   `page.tsx:2204`) ya es el único punto de salida del modal. Si en el momento de
   cerrarlo `loginStep` es uno de `'confirm' | 'espera' | 'pendiente' | 'registro' |
   'contrato'` (es decir, ya se disparó `booking_started` y todavía no llegó a `'done'`),
   es un abandono real y conocido. Comparar contra el paso en el que se cierra evita el
   falso positivo de alguien que solo abrió el modal y lo cerró en `'login'` sin haber
   llegado a intentar nada (para lo cual `booking_started` tampoco se ha disparado
   todavía — ver §1, se dispara en `handleConfirm`/`handleReservarCalendario`, ambos
   post-login).
2. **Vuelta de Stripe con pago cancelado**: el `useEffect` que lee `?compra=cancelada`
   (`page.tsx:593-599`, hoy solo pone `pagoAviso`) es la señal explícita de Stripe de que
   la visitante abandonó el checkout — más fiable que cualquier heurístico de tiempo,
   porque es el propio Stripe diciendo "canceló", no una ausencia que podría deberse a
   mil cosas.

Ninguno de los dos necesita guardar un timestamp de "cuándo empezó" ni comparar contra
"ahora" — son eventos discretos que el cliente puede fechar en el instante en que
pasan. **Sin cron nuevo, sin barrido, sin heurístico de ventana.**

⚠️ **Punto de coordinación con Fase 3** (`docs/checkout-embebido-diseno.md`, sin
implementar): si esa fase se construye, el checkout deja de ser un redirect a Stripe
Checkout hospedado y pasa a Payment Element embebido — el hook `?compra=cancelada`
desaparece y el punto (2) de arriba se mueve a donde sea que Fase 3 modele "la
visitante cerró el Payment Element sin pagar". No es un problema para diseñar Fase 8
ahora (Fase 3 no está construida), pero quien implemente Fase 3 después tiene que saber
que este enganche existe y migrarlo, no dejarlo huérfano.

### 5.2 Recuperación — sin ampliar el diseño anónimo de `widget_eventos` más de lo justo

Los dos disparos de §5.1 tienen una propiedad crítica que cambia todo el diseño de la
recuperación: **ambos ocurren solo cuando la visitante ya está autenticada** (`socia`
resuelta) — `booking_started` requiere haber pasado login (§1), y el `useEffect` de
`?compra=cancelada` solo tiene sentido tras un intento de compra que, aunque
`checkout_started` en sí no exige login (§1), en la práctica la mayoría de compras de
plan sí vienen de alguien que ya se identificó en algún punto del flujo. Es decir:
**no es una visitante anónima genérica** — es una socia real, con email real en
`socios`, que ya empezó algo y no lo terminó.

Esto cambia la pregunta de "¿cómo recupero a alguien de quien no sé nada?" (imposible
sin dark patterns: cualquier intento de identificar a un visitante anónimo para
perseguirlo es justo el patrón oscuro que el brief prohíbe) a "¿aviso a una socia real
de que dejó algo a medias?" — igual de legítimo que un email de "tu bono caduca" que
este repo ya envía.

**Decisión de esquema**: añadir `socio_id text references public.socios(id) on delete
set null` a `widget_eventos`, **nullable, poblada solo en los eventos donde la
visitante ya está identificada** (`booking_started`, `checkout_started`,
`booking_completed`, `booking_abandoned` — los mismos cuatro que ya son
mayoritariamente de gente logueada). El resto de eventos (`widget_loaded`,
`class_list_viewed`, etc.) se quedan sin tocar, siguen siendo 100 % anónimos. Esto
**no rompe** el invariante "anónimo por diseño" del comentario original de la tabla
(`eventos.ts:19-24`/migr `20260814124844`) — lo matiza para los eventos que, por
construcción del propio flujo, ya no son anónimos (la socia ya inició sesión antes de
que se disparen). La RLS de lectura no cambia (sigue siendo `PROPIETARIO`/`MANAGER`,
mismo nivel de confianza que ya tienen sobre `reservas`/`socios` completos).

⚠️ **Riesgo residual, para que `tentare-seguridad` lo revise antes de construir**:
`/api/public/evento` es un endpoint sin JWT (fire-and-forget, `rate-limit` a 120/min).
Si `socioId` viaja en el body tal cual lo manda el cliente, alguien podría enviar el
`socioId` real de OTRA persona junto a `tipo: 'booking_abandoned'` para que reciba un
email que no le corresponde — un vector de spam/molestia menor (no de dinero, no de
datos: el email ya lo tiene igualmente el estudio), mitigado por el rate limit ya
existente y porque el efecto es "una plantilla de recordatorio", no una acción
irreversible. Documentado explícitamente en vez de resuelto aquí: la alternativa
(exigir JWT en este endpoint) mezclaría el mecanismo de auth de "analítica anónima" con
el de "socia autenticada" en un mismo handler — el propio repo ya evita eso a propósito
en otro punto (`docs/self-claim`/`mi-disponibilidad` vs `/api/public/disponibilidad`,
`.claude/tentare-os.md`: "mecanismos de auth distintos, no se mezclan en un mismo
handler aunque comparten lógica de negocio"). Que `tentare-seguridad` decida si el
riesgo residual es aceptable tal cual o si merece resolver el JWT opcional de todos
modos.

**Mecanismo de envío — reutiliza el Notification Engine, sin cron**: cuando
`/api/public/evento` recibe `tipo: 'booking_abandoned'` con `socioId` presente,
`registrarEventoWidget` (tras el insert) llama **inline**, en el mismo request
fire-and-forget, a un nuevo evento del catálogo `RESERVA_ABANDONADA`
(`lib/notifications/catalog.ts`, canal `EMAIL` únicamente, audiencia
`socia-del-evento`) — mismo patrón que `emitirReserva`/`emitirReservaPendienteAprobacion`
ya usan desde `lib/db/supabase-data-admin.ts`, nunca desde un cron. **Cero cron nuevo**,
coherente con "Inngest sigue al ~84 % del plan free, nunca un cron nuevo"
(`.claude/tentare-os.md`). `dedupKey` = `sesionClaseId:socioId:fecha` (una vez por
clase/socia/día) para que reabrir el modal y volver a cerrarlo no mande dos correos.

**Sin dark patterns, explícito**:
- Un solo intento de contacto por clase/día (el `dedupKey` de arriba lo garantiza en el
  motor, no solo en la intención).
- El texto del email es informativo ("dejaste sin confirmar tu plaza en X"), no un
  contador de urgencia falso ("¡solo quedan 2 plazas!" cuando no es cierto) ni un
  descuento inventado para forzar la conversión.
- Nunca se auto-inscribe a nadie en lista de espera ni se le carga nada — ver el punto
  siguiente.

### 5.3 "Aviso cuando haya hueco" — reutilizar la lista de espera ya existente, con opt-in explícito

No es una feature nueva: `lista_espera_plazo_aceptacion_minutos` (Fase 2b, ya en
`main`) es exactamente "avisar cuando se libera un hueco", con oferta y plazo ya
resueltos en SQL. Lo único que falta es **ofrecer el botón** en el momento del
abandono cuando el motivo fue aforo lleno: si `closeBooking` se dispara con
`gateError` mostrando "clase llena" (el mismo `evaluarGate`/mensaje que ya existe), el
modal, en vez de cerrarse sin más, muestra un botón explícito "Avísame si se libera un
hueco" que llama al mismo `addReserva` que ya resuelve a `LISTA_ESPERA` cuando el aforo
está lleno (`booking-logic.ts`, sin RPC ni endpoint nuevo). **Nunca automático** — es un
clic de la propia socia, no una inscripción hecha en su nombre, que es la línea exacta
que separa esto de un dark pattern.

### 5.4 Captura de lead

Ya resuelto por `lead_started`/`lead_completed` (§1, §1.1) — "captura de lead" en el
contexto de `booking_abandoned` es simplemente: si quien abandona **no** tiene cuenta
todavía (nunca llegó a `booking_started` porque el gate de login la paró antes), el
paso natural es el magic link que ya existe (`handleEnviarEnlace`), no una feature
nueva. No hay nada que construir aquí aparte de que §1.1 quede conectado.

---

## 6. Explícitamente fuera de esta fase

- **Theme Builder / Experience Builder (Fase 6/7)**: cualquier personalización visual
  de cómo se ve el embudo, el quiz o los avisos de abandono en el widget en sí (colores,
  layout, copy editable por la propietaria) — esta fase asume que se pinta con los
  mismos tokens/componentes que ya existen (`reservar-publico-tokens.ts`), no diseña
  ningún sistema de theming nuevo para las piezas de CRO.
- **API pública (Fase 9)**: nada de exponer `widget_eventos` ni el embudo vía una API
  externa consumible por la propietaria fuera del panel — la pantalla de §3 es
  panel-only.
- **Checkout embebido (Fase 3)**: no se construye aquí. §5.1 deja documentado el punto
  de coordinación (el hook de `booking_abandoned` en checkout vive hoy en el redirect
  hospedado) para quien implemente Fase 3 después.
- **Un especialista `CRO` nuevo en Decision OS** para insights agregados de embudo a la
  propietaria: descartado en §4.3 por no ser lo que pide el brief, no porque no tenga
  sentido — candidato legítimo para una fase futura, con diseño propio.
- **Recuperación de visitantes 100 % anónimos** (nunca autenticados, nunca dejaron
  email): fuera de alcance por diseño, no por pereza — cualquier intento de
  identificarlos para perseguirlos después es el patrón oscuro exacto que el brief
  prohíbe. El único abandono recuperable es el de alguien que el estudio ya conoce.
- **`checkout_completed` en el catálogo de eventos**: no se añade un tipo nuevo — la
  confirmación de compra de plan sigue viniendo del webhook de Stripe / `recibos`, nunca
  del cliente (regla de dinero de este repo). La fila "compra de plan" del embudo
  (§3.3) cruza con esa fuente en vez de inventar un evento que el cliente no puede
  confirmar honestamente.

---

## 7. Riesgos y spikes recomendados antes de implementar

1. **Migración de `widget_eventos` con `socio_id` nueva** (§5.2): comprobar en vivo con
   `execute_sql`+`ROLLBACK` que el `ON DELETE SET NULL` no deja huérfanos raros y que
   el índice existente `(studio_id, tipo, creado_en desc)` sigue sirviendo para la
   query del cron... no hay cron (§5.2), así que este riesgo es menor de lo que
   parecía al escribir el brief — pero sí verificar el `FK` contra `socios` no rompe el
   insert fire-and-forget existente (mismo criterio que ya tiene con `studios`/
   `sesiones`: error `23503` se ignora en silencio, `registrarEventoWidget:1373`).
2. **`RESERVA_ABANDONADA` en el catálogo de notificaciones**: revisar con quien mantenga
   `lib/notifications/` que `audiencia: 'socia-del-evento'` resuelve el email correcto
   cuando `socioId` viene de un endpoint público sin JWT (no del flujo interno que
   normalmente alimenta ese resolver) — spike corto antes de dar por buena la firma de
   `emitirReservaAbandonada`.
3. **Riesgo de seguridad de §5.2** (socioId ajeno en el body): que `tentare-seguridad`
   lo revise explícitamente antes de mergear, no como parte de un barrido genérico
   posterior — el propio diseño ya lo señala como abierto.
4. **Verificación visual del embudo**: como en fases anteriores del Decision OS, este
   documento no puede confirmar en un navegador autenticado que los números cuadren
   contra datos reales (sin credenciales de sesión de prueba en este entorno) — recomendado
   verificar los primeros números reales contra un `count()` manual en Supabase antes de
   confiar en la pantalla.

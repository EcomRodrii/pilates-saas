# Fase 7 — Widget Experience Builder: diseño técnico

> Estado del repo auditado: worktree `claude/widget-experience-builder`, creado limpio
> desde `origin/main` (17 ago 2026), que ya incluye Fases 0-5 y Fase 8 (CRO/Analytics)
> mergeadas. Fotografía para decisión, no código — la implementación es un paso posterior.
>
> Continúa `docs/booking-engine-architecture.md` (Fase 0) y coexiste con
> `docs/cro-analytics-widget-diseno.md` (Fase 8, en `main`), que ya deja escrito
> explícitamente (su §6) que la personalización de "cómo se ve el embudo, el quiz o los
> avisos de abandono" es territorio de esta fase, no de la suya.
>
> **Fase 6 (Theme del widget) fue descartada por el usuario en esta sesión sin llegar a
> diseñarse** — este documento no la reabre. Todo lo que huela a color/tipografía/fondo del
> widget queda fuera explícitamente (§2).

## 0. Qué pide el nombre, y qué dice el código real

"Widget Experience Builder" suena a un editor visual tipo Wix — arrastrar bloques, elegir
temas, previsualizar en vivo. Investigado el código real, esa lectura es **incorrecta para
lo que falta por construir**, por dos motivos que hay que separar:

1. **Gran parte de "qué se ve y en qué orden" en `/reservar/[slug]` YA es un builder
   completo**, y no es esta fase la que lo creó: PR `360f41c0`
   ("feat(apariencia): /reservar se une al Theme Builder — motor de bloques, editor
   unificado y catálogo propio", ya en `main`) generalizó el Theme Builder del panel
   (`lib/theme-schema.ts`, `components/theme/portal-bloques-editor.tsx`) a la pantalla de
   reservas. Hoy la propietaria YA puede reordenar/ocultar/insertar bloques de catálogo
   (banner, texto, CTA, FAQ, galería, vídeo, testimonios) sobre `/reservar`, con arrastre,
   deshacer y vista previa en vivo — exactamente el tipo de "builder" que el nombre de esta
   fase evoca. Repetirlo sería reinventar algo que ya existe y está en producción.
2. **Lo que de verdad falta es mucho más pequeño y concreto**: dos huecos operativos
   señalados por su propio comentario en el código como "la fase siguiente" (§1.2), y un
   parámetro ya construido que el panel nunca expone en su UI (§1.3). Ninguno de los dos
   necesita un editor visual nuevo — los dos encajan en la infraestructura de campos que
   el Theme Builder ya tiene.

**Conclusión de alcance, dicha ya aquí**: esta fase NO construye un editor nuevo. Añade dos
campos de configuración al bloque de sistema `reservarHorario` (que hoy tiene
`campos: []`, ver §1.2) usando el motor de campos ya existente, y expone en
`tab-api.tsx` un parámetro de URL que el código público ya sabe leer pero que la propietaria
no puede activar sin editar el snippet a mano. Coherente con el mismo criterio que ya aplicó
Fase 8 al recortar su alcance tras investigar (`docs/cro-analytics-widget-diseno.md`).

---

## 1. Hallazgos de la investigación

### 1.1 La estructura de `/reservar/[slug]` — qué es fijo por código y qué no

`app/reservar/[slug]/page.tsx:225-235` define las 5 pestañas del widget como un array
estático:

```ts
type Tab = 'clases' | 'citas' | 'misreservas' | 'estudio' | 'cuenta';
const TAB_IDS: readonly Tab[] = ['clases', 'citas', 'misreservas', 'estudio', 'cuenta'];
```

y `page.tsx:1264` las pinta TODAS, siempre, sin condición de negocio:

```ts
const tabs = [['clases', 'Clases'], ['citas', 'Citas'], ['misreservas', 'Mis reservas'], ['estudio', 'El estudio'], ['cuenta', 'Mi cuenta']] as const;
```

La pestaña "Citas" se muestra aunque el estudio no tenga ningún servicio de cita 1:1
configurado (`citas_servicios`, `page.tsx:1747-1767`, `CitasPublica` recibe
`servicios={citasServicios}` sin ningún guard que oculte la pestaña si ese array está
vacío). Lo mismo pasa con "Mis reservas"/"Mi cuenta" para un estudio que solo vende por
mostrador y nunca espera que nadie use el widget para gestionar su propia cuenta. No es un
bug — es simplemente una decisión no tomada todavía: nadie decidió nunca qué pestañas
tienen sentido para un estudio concreto.

El **orden y la visibilidad de SECCIONES** (no pestañas) de la página sí es ya
configurable, vía `bloquesReservar` (`page.tsx:1285-1300`, `orden()`/`seccionVisible()`
sobre `posicionSeccion`). Pero las 6 secciones de sistema que existen hoy
(`lib/portal-home-bloques.ts:61`: `reservarPortada`, `reservarHorario`, `reservarBonos`,
`reservarSobre`, `reservarCifras`, `reservarContacto`) tratan **todo el bloque de pestañas +
calendario como una sola sección** (`reservarHorario`). El builder ya deja
mover/ocultar "Horario y reservas" como un todo frente a "Bonos" o "Sobre nosotros" — pero
no entra DENTRO de esa sección para decidir cuáles de las 5 pestañas mostrar. Esa
granularidad no existe en ningún sitio.

### 1.2 El hueco ya está señalado en el propio código, como "la fase siguiente"

`lib/portal-home-bloques.ts:901-935` define los 6 bloques de sistema de `/reservar` con
`campos: []` y este comentario explícito, escrito al generalizar `/reservar` al motor de
bloques:

> "/reservar (Fase 1 de su generalización a bloques): las 6 secciones de siempre, SIN
> campos propios todavía — sus textos siguen viviendo en el tema
> (reservarTitular/reservarSobreTexto/…, theme-editor.tsx) exactamente como hoy. Esta fase
> solo generaliza el motor de orden/visibilidad; darles campos editables aquí es la fase
> siguiente, no esta."

Es decir: el propio autor de esa migración ya dejó dicho, en el código, que dar
`campos` editables a estos bloques es un trabajo posterior y separado. Esta fase 7 es,
literalmente, esa "fase siguiente" — al menos para `reservarHorario`.

Hay precedente de que el patrón "declarar `campos`, sin consumidor todavía" ya existe en
este repo sin ser un error: `CAMPOS_LISTADO_CLASES`
(`lib/portal-home-bloques.ts:692`, usado por el bloque `listadoClases` de la pantalla
`clases`) no tiene ningún caller hoy (`grep -rn CAMPOS_LISTADO_CLASES` → un único resultado,
su propia declaración) — el motor de campos está pensado para crecer bloque a bloque, no
todos a la vez.

### 1.3 El Inspector del editor YA renderiza campos de bloques de sistema genéricamente

Confirmado en `components/theme/portal-bloques-editor.tsx:122-126` y `:791-800`: el panel
de configuración de un bloque seleccionado no distingue "sistema" de "catálogo" para pintar
sus campos — solo distingue si `def.campos.length === 0`:

```ts
const def = getDefinicionBloque(bloque.kind === 'sistema' ? bloque.sistemaId : bloque.kind);
if (bloque.kind === 'sistema' && (!def || def.campos.length === 0)) {
  return <p ...>{labelDe(bloque)} se alimenta de los datos de tu estudio — aquí solo puedes reordenarlo u ocultarlo.</p>;
}
return <ConfigForm bloque={bloque} onChange={...} />;
```

Esto significa que **dar `campos` a `reservarHorario` no necesita ni una línea de UI
nueva**: en cuanto el schema tenga entradas, `ConfigForm` (que ya soporta `booleano`,
`opciones`, `select`, etc. — `lib/theme/campos.ts:126-129`) las pinta solo, en el mismo
Inspector que ya usa la propietaria para el resto del editor de `/reservar`
(`components/theme/reservar-editor.tsx`, unificado en `theme-editor-fullscreen.tsx`).

### 1.4 Un parámetro ya construido, nunca expuesto en el panel

`lib/reservar/apariencia-widget.ts:30` ya define `soloPestana: boolean` ("Enseñar SOLO la
pestaña que pide `?tab=`, sin la barra de las otras") y `page.tsx:1475` ya lo respeta:

```ts
{(apariencia.soloPestana ? tabs.filter(([t]) => t === tab) : tabs).map(([t, label]) => (...
```

Se activa por querystring (`?solo-pestana=1`, `resolverApariencia`,
`apariencia-widget.ts:110`). **Pero `components/configuracion/tab-api.tsx` — la única
pantalla donde la propietaria genera el código para pegar en su web — nunca añade este
parámetro a ninguno de los 5 `<iframe>` que genera** (`tab-api.tsx:217`,
`const src = ...&tab=${widget.tabParam}${sesionQuery}`, sin rastro de `solo-pestana`). El
resultado real, medible en el propio código: cuando una propietaria copia el widget
"Horario y reserva de clases" para pegarlo en su web, el iframe que se incrusta enseña
TAMBIÉN las pestañas Citas / Mis reservas / El estudio / Mi cuenta — cosas que probablemente
no quería mezclar con el resto de su web, y no tiene ninguna forma de evitarlo sin editar el
código HTML a mano (que la pantalla ni siquiera documenta que existe).

Esto es el hallazgo más concreto y de menor riesgo de todo el documento: el mecanismo ya
está construido, probado (implícitamente, por Modo A general) y en producción — solo falta
un checkbox en una pantalla de configuración que ya existe.

### 1.5 Qué NO toca esta fase (confirmado por lectura directa)

- **Modo B** (`app/widget-bundle/main.tsx`) no tiene pestañas — monta `<ReservaCalendario>`
  directo (`main.tsx:23,178`), sin `Tab`/`tabs` de ningún tipo. Nada de esta fase le aplica.
- **`textosReservar`** (`lib/studio-context.tsx:301`: `titular`, `subtitulo`, `cta`,
  `avisoQuiz`, `vacioTitulo`, `vacioTexto`, `confirmacion`, `listaEspera`, `ayuda`,
  `comoFunciona`, `sobreTitulo`, `sobreTexto`) — el copy editable de la página YA existe y
  ya se edita desde el mismo Theme Builder de `/reservar` (`theme-editor.tsx`). No hay nada
  que añadir aquí; ya está resuelto por trabajo previo a esta fase.
- **El Discovery Quiz en sí** (`components/reserva/discovery-quiz.tsx`) — su lógica de
  filtrado (nivel/objetivo/horario/día) no cambia. Lo único que falta es poder
  **desactivarlo entero** para un estudio que no lo quiera (algunos estudios muy pequeños,
  con 2-3 tipos de clase, no tienen nada que "descubrir" — el quiz es ruido). Hoy solo se
  puede descartar el banner por sesión de navegador (`descartarQuizBanner`,
  `page.tsx:410-413`, `sessionStorage`), nunca apagarlo del todo desde el panel.
- **Colores, tipografía, fondo, radio de esquinas del widget** — todo eso vive en
  `AparienciaWidget` (`apariencia-widget.ts:20-40`) y es, literalmente, la Fase 6 descartada.
  No se propone ningún control nuevo para `fondo`/`fuente`/`radio`/`texto` aquí, aunque
  técnicamente esos campos también estén "sin exponer en el panel" igual que
  `soloPestana` — **se dejan fuera a propósito** porque tocan justo el territorio que el
  usuario descartó esta sesión, no porque falte trabajo de investigación.

---

## 2. Decisión de alcance

### 2.1 Incluido

**(A) Checkbox "Solo esta pestaña" en `tab-api.tsx`** (mayor valor, menor riesgo).

Un toggle nuevo, junto al ya existente "Ancho: Compacto/Ancho completo"
(`tab-api.tsx:335-357`), que añade `&solo-pestana=1` al `src` del iframe cuando está
activado. Reutiliza el parámetro y la lógica de render que ya existen — cero cambios en
`page.tsx`/`apariencia-widget.ts`.

- **Por defecto DESACTIVADO** para todos los widgets — no cambia el comportamiento de
  ningún snippet ya pegado en la web de un estudio real (esos iframes no se regeneran
  solos; solo afecta a código nuevo que se copie después de este cambio).
- Se oculta para el widget `embed-script` (Modo B no tiene pestañas, §1.5) y para
  `misreservas`/`estudio` cuando el propio widget ya ES una sola pestaña sin más contexto
  con el que confundirse — en la práctica, el checkbox tiene sentido real en `clases`,
  `citas` y `clase-concreta` (los tres que más suelen incrustarse junto a contenido propio
  de la web del estudio, según describe el propio `desc` de cada entrada en `WIDGETS`,
  `tab-api.tsx:42-47`).

**(B) `campos` nuevos en el bloque de sistema `reservarHorario`** — dos ajustes, mismo
mecanismo que la sección 1.2/1.3 ya deja construido:

1. **Qué pestañas existen** (afecta a la vista "completa" del widget: visita directa a
   `/reservar/[slug]`, o cualquier snippet embebido SIN "Solo esta pestaña" activado).
   Cuatro campos `booleano` — `mostrarCitas`, `mostrarMisReservas`, `mostrarEstudio`,
   `mostrarCuenta` — todos con `porDefecto: true` (el comportamiento de hoy no cambia para
   nadie que no toque el ajuste). **"Clases" no lleva checkbox**: es la pestaña por defecto
   y el propio propósito de la página (`TAB_IDS.includes(tabInicial as Tab) ? ... : 'clases'`,
   `page.tsx:451-452`) — quitarla dejaría el widget sin destino al que caer.
2. **Si se ofrece el Discovery Quiz** — un campo `booleano` `mostrarQuiz`, `porDefecto:
   true`. En `false`, ni el banner ("¿Primera vez...?") ni el botón "Cambiar" aparecen —
   el calendario se muestra sin ningún filtro asistido, tal cual estaba antes de que el
   quiz existiera.

No se añade un campo "pestaña por defecto": el mecanismo para elegir CON QUÉ pestaña abre
un embebido concreto ya existe y es mejor (`tabParam` por widget, `tab-api.tsx:42-48`) —
un segundo mecanismo que decida lo mismo a nivel de estudio competiría con el primero sin
necesidad. La única pestaña "por defecto" real es `clases`, que ya es el `fallback` fijo del
código y no necesita configuración.

### 2.2 Descartado explícitamente

- **Cualquier editor visual nuevo** (drag & drop de pestañas, previsualización especial) —
  el Inspector genérico ya existente (§1.3) es suficiente para 5 checkboxes; construir una
  UI dedicada sería la abstracción prematura que este repo evita.
- **Colores/tipografía/fondo del widget** (`fondo`, `fuente`, `radio`, `texto` de
  `AparienciaWidget`) — territorio de la Fase 6 descartada. No se exponen en `tab-api.tsx`
  aunque técnicamente estén en la misma situación de "construido pero sin UI" que
  `soloPestana` — la línea se traza por CONTENIDO (qué se ve/qué pestañas hay), no por
  "¿tiene UI ya o no?".
- **Ocultar automáticamente "Citas" si el estudio no tiene servicios de cita configurados**
  — se consideró como alternativa a un checkbox manual. Se descarta: el resto de
  `bloquesReservar` funciona con visibilidad SIEMPRE manual (nunca inferida de si hay datos
  o no, `lib/portal-home-bloques.ts` entero), y mezclar "manual" con "automático según
  datos" en el mismo builder es la clase de inconsistencia que ya le costó una migración de
  UI a la Ficha Clínica en otra fase de este repo. Un estudio puede querer anunciar que
  "próximamente habrá citas 1:1" con la pestaña visible aunque vacía — su decisión, no del
  motor.
- **Plantillas de "tipo de experiencia" (p. ej. "Estudio boutique" vs "Cadena grande" con
  un preset de pestañas)** — no hay ningún patrón de plantillas reutilizables en este repo
  para configuración de estudio (mismo criterio ya aplicado y documentado en Fase 1 de
  reglas de reserva, `.claude/tentare-os.md`: "Sin plantillas reutilizables... si se
  quiere, es una entidad nueva de verdad"). Cinco checkboxes no lo necesitan.
- **Tocar Modo B** (`widget.js`) — no tiene pestañas, nada que configurar (§1.5).
- **Un campo "pestaña por defecto" a nivel de estudio** — redundante con `tabParam` por
  snippet, según se explica en 2.1(B).

---

## 3. Diseño técnico

### 3.1 `lib/portal-home-bloques.ts`

Nuevo schema, siguiendo el mismo patrón que `CAMPOS_LISTADO_CLASES`/`CAMPOS_BANNER` etc.:

```ts
export const CAMPOS_RESERVAR_HORARIO = [
  { tipo: 'booleano', id: 'mostrarQuiz', etiqueta: 'Ayuda a elegir clase (quiz)', porDefecto: true,
    ayuda: 'El banner "¿Primera vez? Te ayudamos a encontrar tu clase" y su filtro guiado.' },
  { tipo: 'booleano', id: 'mostrarCitas', etiqueta: 'Pestaña "Citas"', porDefecto: true },
  { tipo: 'booleano', id: 'mostrarMisReservas', etiqueta: 'Pestaña "Mis reservas"', porDefecto: true },
  { tipo: 'booleano', id: 'mostrarEstudio', etiqueta: 'Pestaña "El estudio"', porDefecto: true },
  { tipo: 'booleano', id: 'mostrarCuenta', etiqueta: 'Pestaña "Mi cuenta"', porDefecto: true },
] as const satisfies readonly CampoSchema[];
export type ReservarHorarioConfig = ConfigDe<typeof CAMPOS_RESERVAR_HORARIO>;
```

y en `BLOQUES_SISTEMA` (línea 911-915), cambiar solo `campos: []` → `campos:
CAMPOS_RESERVAR_HORARIO`. **Aditivo**: `resolverConfig` (`lib/theme/campos.ts`) rellena las
claves ausentes con `porDefecto` para cualquier estudio que ya tenga `reservarHorario`
guardado sin `config` — cero migración de datos, el jsonb existente sigue siendo válido tal
cual (mismo criterio que ya documenta el comentario de `BloqueHome.config` en
`portal-home-bloques.ts:356-358`: "guardado antes de que existieran estos campos se lee
igual que siempre").

**Sin migración SQL** — `bloquesReservar` ya es la columna `jsonb` existente
(`studios.home_bloques` o equivalente ya usado por `updateStudio`/`fetchAllStudioData`), y
`config` en un bloque de sistema es un campo opcional ya soportado por el tipo `BloqueHome`.

### 3.2 `app/reservar/[slug]/page.tsx`

- Leer el bloque `reservarHorario` de `bloquesReservar` (mismo array que ya se usa en
  `posicionSeccion`/`seccionesVisibles`, `page.tsx:1285-1292`) y resolver su `config` con
  `resolverConfig(CAMPOS_RESERVAR_HORARIO, bloque?.config ?? {})`.
- Filtrar `tabs` (línea 1264) contra esa config antes de renderizar la barra
  (`page.tsx:1475`) — `clases` siempre presente, las otras 4 condicionadas a su booleano.
- Si `tabInicial` (línea 442, `searchParams.get('tab')`) apunta a una pestaña que la config
  del estudio tiene desactivada, caer a `'clases'` en vez de a una pestaña fantasma sin
  botón en la barra — mismo `?? 'clases'` que ya existe en `page.tsx:451-452`, solo que la
  comprobación de "pestaña válida" pasa a mirar también la config, no solo `TAB_IDS`.
- Envolver el bloque completo del quiz (`page.tsx:1524-1574`, las tres ramas
  `quizAbierto`/`quizCompletado`/`bannerQuizVisible`) en `mostrarQuiz &&`. Con `mostrarQuiz:
  false`, el calendario se pinta directo, sin banner ni filtros del quiz — el resto de
  filtros (`RailFiltros`, nivel/horario/sala/instructor de toda la vida) no se tocan.

### 3.3 `components/configuracion/tab-api.tsx`

- Estado nuevo `soloEstaPestana` (booleano, análogo a `anchoCompleto` ya existente,
  `tab-api.tsx:190`), con un toggle visual igual al de "Ancho" (`tab-api.tsx:335-357`) —
  mismo patrón de dos botones tipo pill, no un `<input type=checkbox>` suelto que
  desentonaría con el resto de la pantalla.
- Visible solo para `widget.modo !== 'script'` (Modo B no tiene pestañas) — igual que el
  bloque de "Ancho" ya se oculta con esa misma condición (`tab-api.tsx:335`).
- `src` (línea 217) gana `${soloEstaPestana ? '&solo-pestana=1' : ''}`.
- Un texto de ayuda breve bajo el toggle, mismo tono que el resto de la pantalla: "Enseña
  solo esta pestaña, sin las otras cuatro — para cuando el widget va dentro de una sección
  de tu web y no quieres que la visitante se vaya a Mi cuenta sin querer."

### 3.4 El editor de Theme Builder (`components/theme/*`)

**Cero cambios de código** más allá del schema de §3.1 — confirmado en §1.3: el Inspector ya
renderiza cualquier `CampoSchema` de un bloque de sistema con `campos.length > 0`
genéricamente. El único trabajo aquí es verificar visualmente que los 5 checkboxes salen
bien agrupados (usar `grupo: 'Pestañas'` en los 4 de visibilidad, dejar `mostrarQuiz` sin
`grupo` para que aparezca arriba del todo — mismo criterio de agrupación que ya usa
`CAMPOS_ESTILO`, `portal-home-bloques.ts:253-305`).

---

## 4. Riesgos y verificación

1. **`resolverConfig` con un bloque `reservarHorario` guardado hace tiempo sin `config`** —
   spike corto con `execute_sql` (o equivalente local) comprobando que un estudio real con
   `bloquesReservar` ya publicado sigue viendo las 5 pestañas tras el deploy (los 4
   booleanos deben resolver a `true` por `porDefecto`, no a `undefined`/falsy). Es
   exactamente el caso que motiva el comentario de `BloqueHome.config` citado en §3.1 — bajo
   riesgo, pero el primer estudio real que lo vea es la prueba que de verdad importa.
2. **Que `tabInicial` de una URL vieja (`?tab=citas` ya compartido/guardado en algún sitio)
   deje de resolver a nada si el estudio apaga esa pestaña después** — cubierto por el
   fallback a `'clases'` de §3.2, pero conviene un test explícito (`e2e/reservar-...spec.ts`)
   que fuerce `mostrarCitas: false` + `?tab=citas` y compruebe que el widget no queda en
   blanco ni con una pestaña activa sin botón visible.
3. **`soloEstaPestana` en `tab-api.tsx` no debe filtrarse a los widgets que ya no tienen
   sentido con él** (`embed-script`) — cubierto por la condición de §3.3, pero conviene un
   test de que cambiar de widget activo resetea o esconde el toggle correctamente (mismo
   tipo de bug que ya tuvo `anchoCompleto` si no se acota bien a `widget.modo`).
4. **Verificación visual en navegador real, no solo lectura de JSX** — como en fases
   anteriores del Decision OS/portal, no se pudo abrir un navegador autenticado en este
   entorno para confirmar que los 5 checkboxes se ven bien agrupados en el Inspector real.
   Recomendado: abrir Configuración → Apariencia → Reservar → "Horario y reservas" tras
   implementar, y confirmar que el grupo "Pestañas" no rompe el layout de 272px del rail
   (mismo límite ya documentado para listas anidadas, `portal-home-bloques.ts:349-351`).
5. **Cero impacto en widgets ya embebidos** — por diseño (`porDefecto: true` en los 4
   booleanos de visibilidad, `soloEstaPestana` nace en `false`), pero vale la pena un
   recordatorio explícito en el PR: nadie necesita volver a pegar código en su web para que
   esta fase no le cambie nada.

Verificación estándar del repo: `npx tsc --noEmit` + `node --test` (el schema de campos es
puro y sin I/O, cubierto por los tests ya existentes de `lib/theme/campos.test.ts` si el
nuevo array pasa por el mismo `resolverConfig`/`ConfigDe`); `npm run lint` por el React
Compiler (mismo tipo de falso positivo ya documentado en memoria de sesión al derivar
variables de un hook).

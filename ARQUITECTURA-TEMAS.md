# Arquitectura del sistema de temas de Tentare

Referencia analizada: **Shopify Horizon 4.1.3** (467 ficheros; 95 `blocks/`, 42
`sections/`, 138 `snippets/`, 124 `assets/`, 13 `templates/`). No se copia su
diseño, su marca ni su maquetación: se copia **por qué está organizado así**.

Este documento es la fuente de verdad del rediseño. Cada afirmación sobre
Horizon está medida sobre el ZIP, no recordada.

---

## 1. La brecha, medida

| | Horizon | Tentare (2026-08-06) |
|---|---|---|
| Bloques / secciones | 95 + 42 | 18 |
| Ajustes declarados | **1.999** | **47** |
| Ajustes condicionales (`visible_if`) | **631 — el 32 %** | **0** |
| Cabeceras de grupo en el panel | 320 | 16 |
| Tipos de campo | 24 | 12 |
| CSS custom properties | **761** | 33 |
| Plantillas | 13 | 3 pantallas |
| Presets por componente | 100 de 135 los traen | 1 default fijo por tema |
| Profundidad de anidamiento usada | 3 niveles | **0 — construido, sin un solo consumidor** |

El número que importa no es 1.999 contra 47: eso es volumen y se llena con el
tiempo. Es el **0 en condicionales y el 0 en anidamiento**. Las dos capacidades
están construidas y probadas en `lib/theme/campos.ts` desde hace 13 PRs y no las
usa nadie. En Horizon son la columna vertebral: sin `visible_if` un panel de 55
ajustes (`sections/header.liquid`) sería inusable.

---

## 2. Las siete decisiones de Horizon que hay que adoptar

### 2.1 El orden vive en un array aparte, no en el array de datos

Horizon guarda **`sections` (mapa `id → instancia`) + `order` (array de ids)**, y
repite el patrón recursivamente en cada nivel con `blocks` + `block_order`.

```jsonc
{ "sections": { "main": {...}, "form": {...} }, "order": ["main", "form"] }
```

Un id que está en el mapa pero **no** en `order` no se renderiza: así funciona su
papelera. Tentare guarda un **array plano** (`BloqueHome[]`), donde identidad y
posición son la misma cosa.

**Por qué importa aquí:** con mapa+orden, ocultar, duplicar y reordenar son
operaciones sobre `order`, no sobre los datos; y "restaurar" es volver a meter un
id. Con array plano, borrar pierde la configuración.

### 2.2 «Fijo» es una marca en la instancia, no una regla global

Horizon materializa el bloque estático dentro del JSON con `"static": true`, lo
excluye de `block_order` y lo localiza por id desde la plantilla. El usuario
puede configurarlo pero no borrarlo ni moverlo.

Tentare decide qué es fijo con una constante global,
`BLOQUES_FIJOS_POR_PANTALLA`, aplicada **en tiempo de lectura**.

⚠️ **Esa diferencia causó un bug real el 2026-08-06**: el render aplicaba
`conFijos` (servidor) y el editor no, así que la propietaria veía el bloque en su
portal y en la vista previa pero no podía ni seleccionarlo. Si el «fijo» viviera
en el dato, los dos caminos de lectura no podrían discrepar. Ver
`lib/api-client.ts` y el commit de #765.

### 2.3 Un preset se materializa entero y se congela

Al añadir un bloque, el editor de Shopify copia el preset **y resuelve TODOS los
defaults del schema**, no solo los que el preset menciona. Comprobado: el preset
de `blocks/text.liquid` solo fija `text`, y `templates/404.json` guarda los 16
ajustes completos. Cambiar un `default` en el schema **no** afecta a las
instancias ya creadas.

Tentare hace justo lo contrario: `resolverConfig` rellena los ausentes **en
lectura**, así que un campo nuevo es retroactivo sin migración.

**Las dos son defendibles y son opuestas.** La nuestra es más cómoda (un campo
nuevo llega a todos los estudios gratis) y más peligrosa (cambiar un `porDefecto`
altera portales vivos en silencio). La suya es predecible y exige migraciones.

**Decisión: mantener la nuestra**, porque ya está documentada como propiedad
buscada y porque nuestro parque de estudios es pequeño y compartido — pero
**añadir un aviso explícito** en el schema: cambiar un `porDefecto` de un campo
ya publicado es un cambio de producto, no un retoque.

### 2.4 El comodín `@theme` es lo que hace explotar la reutilización

Un contenedor declara `"blocks": [{"type": "@theme"}]` = «acepto cualquier bloque
público». 29 usos. Sin él habría que enumerar 70 tipos en cada contenedor y
ningún bloque nuevo sería usable sin editar a mano todos los padres.

Tentare tiene `hijos: { admite: readonly BloqueTipoCatalogo[] }` — lista
explícita. Falta el comodín, y es una línea.

Y responde a la pregunta que llevaba 13 PRs abierta —**qué bloque debe aceptar
hijos**: el **contenedor** (`blocks/group.liquid`, 42 ajustes, acepta
`@theme`+`@app`). No hay que decidir bloque por bloque: se crea *un* bloque
contenedor y acepta todo.

### 2.5 Un fichero puede ofrecerse varias veces en el catálogo

`blocks/text.liquid` aparece dos veces en el picker —«Texto» y «Título»— con el
mismo código y distinto `default`. Un preset es «una entrada del catálogo», no «un
componente». 117 presets sobre 135 componentes.

Barato, y multiplica el catálogo percibido sin escribir un componente más.

### 2.6 Un bloque estático renderizado en bucle: una configuración, N tarjetas

El patrón más potente del tema. `sections/collection-links.liquid` instancia el
mismo bloque con el mismo id dentro de un `for`, pasándole un objeto distinto por
iteración (`closest.collection`). Resultado: **editas una tarjeta y cambian las
24**, porque no hay 24 configuraciones, hay una.

Tentare no tiene nada así, y es exactamente lo que hace falta para que una
propietaria diseñe «la tarjeta de clase» una vez.

### 2.7 El panel se estructura con pseudo-ajustes, y casi todo es condicional

El array `settings` es **plano**; la jerarquía visual la dan `type: "header"`
(320) y `type: "paragraph"` (42), que no persisten valor. Y `visible_if` (631)
esconde lo que no aplica.

Su orden canónico de grupos, idéntico en todos los contenedores:
`Layout → Size → Appearance → Borders → Padding`.

**Aquí lo nuestro es mejor y se queda**: nuestro `visibleSi` es una condición
**serializable y tipada** (`{ campo, igual }`, `{ todas: [...] }`), no un string
con Liquid dentro que hay que parsear e interpretar con la precedencia de Liquid.
Y nuestro `grupo` va en el campo, así que no puede desincronizarse. Lo único que
falta de ellos es poder declarar una cabecera **sin** campos propios.

---

### 2.8 El color no se elige: se calcula

**Horizon ha eliminado los `color_scheme`.** Cero apariciones en todo el tema
fuera de cadenas de traducción huérfanas. En su lugar: **una paleta global**
(`type: "color_palette"`) más un `background_color` opcional por sección o
bloque, y el texto **se deduce**:

1. si hay color de texto explícito, gana;
2. si no, el texto global **si contrasta ≥ 4.5** (WCAG AA);
3. si no, el extremo más claro o más oscuro de la paleta.

Se emite como custom properties sobre una clase `color-custom-{id}`, y **el
anidamiento sale gratis por cascada**: sección oscura → grupo claro → tarjeta
oscura funciona sin una línea de código extra, porque cada nivel redeclara
`--color-foreground`/`--color-background` para su subárbol y todos los
componentes leen `var(--color-foreground)`.

Detalle que vale su peso: las **rampas de opacidad cambian según el brillo del
fondo** (`--opacity-35-55` vale 0.35 sobre claro y 0.55 sobre oscuro). Diez
líneas que arreglan el problema clásico de «los bordes sutiles desaparecen en
oscuro».

**Dónde estamos**: ya calculamos contraste (`foregroundParaFondo`,
`validarContrasteTheme`), pero solo como **gate al publicar el tema**. Falta
hacerlo **por superficie al renderizar**, que es lo que permite que
`EstiloBloque.fondo` no rompa nunca la legibilidad.

### 2.9 La escala tipográfica fluida se DERIVA, no se escribe

Horizon no escribe `clamp()` a mano. Ordena los tamaños configurados y, para
cada uno ≥48px, genera un `clamp()` cuyo mínimo es **el siguiente tamaño más
pequeño de la propia escala**. Con `h1 = 56` sale
`clamp(3rem, 5.6vw, 3.5rem)`.

Esto responde directamente a la pregunta de hoy sobre nuestros rótulos de 24 y
30px sin criterio: **el problema no es qué número poner, es que hay números en
vez de una escala**. Con `--font-size--3xs…6xl` fija y presets por elemento
(`--font-h2--size/--family/--line-height/--letter-spacing`), la incoherencia
24-vs-30 no puede existir.

Y el espaciado no usa `clamp()` sino un **factor**: `--spacing-scale: 0.7` en
móvil, `1.0` en escritorio, con `max(20px, calc(var(--spacing-scale) * Npx))`.
Un valor que edita la propietaria, dos breakpoints, cero duplicación.

### 2.10 Motion, capas y accesibilidad, tokenizados

- **Duración y easing compuestos en un token**:
  `--animation-values: var(--animation-speed) var(--animation-easing)`.
- **Springs con `linear()`**, nombrados por duración percibida y rebote
  (`--spring-d300-b0-easing` + su `-duration`, que van siempre en pareja).
- **`--layer-*` semánticos** (`--layer-sticky: 8`, `--layer-overlay: 16`) en vez
  de `z-50` / `z-[9999]`.
- **`prefers-reduced-motion: no-preference` como puerta de entrada (opt-in)**, no
  `reduce` como salida. 28 usos. Con esta convención una animación nueva no puede
  olvidarse de respetar la preferencia: si no la declara, no anima.
- **El contraste no se confía, se calcula**; `--minimum-touch-target: 44px`;
  `.visually-hidden` con la excepción de foco dentro del propio selector.

Los **breakpoints son lo único NO tokenizado** de todo el tema (233 usos de
`min-width: 750px` escritos a mano), porque las custom properties no funcionan
dentro de una media query. Es justo el hueco que Tailwind cubre bien, así que
ahí no copiamos: usamos los suyos.

---

## 3. Lo que NO se copia, y por qué

1. **`/themes` leído en tiempo de ejecución.** Shopify sirve ficheros por tienda;
   Next.js empaqueta en build y en serverless no hay disco donde copiar nada. Un
   `import()` con ruta variable no se resuelve. Equivalente correcto: **registro
   generado en build por glob** sobre `themes/*/manifest.ts`. Cumple lo pedido
   —copiar la carpeta y que aparezca, sin tocar código— y además deja cada tema
   en su propio chunk.

2. **Temas con `providers/`, `stores/` o `services/` propios.** Ahí viven el
   dinero, la RLS y la sesión de la socia. Un tema con acceso a datos propio es
   una superficie de seguridad nueva por tema, y en un marketplace sería código
   de terceros contra la base de datos de un estudio. **Los temas son solo
   presentación**: reciben datos por props/contexto y no saben que existe
   Supabase. Todo lo demás de la estructura pedida (tokens, sections, blocks,
   schemas, animations, locales, assets, icons, fonts) encaja tal cual.

3. **Valores de ajuste que son plantillas.** Horizon guarda
   `"background_color": "{{ settings.color_palette.background }}"` y lo evalúa al
   renderizar. Es potente y es un intérprete más que mantener, con su superficie
   de inyección. Equivalente sin intérprete: nuestro `colorHeredado`/
   `numeroHeredado` — `null` significa «hereda», y la herencia la resuelve el
   render. Ya lo tenemos y es más seguro.

4. **`type: "liquid"` (HTML/código libre del usuario).** No, mientras el portal
   sirva datos de salud y cobros.

5. **Su capa de JavaScript entera.** Horizon construye a mano lo que React ya nos
   da: 75 Web Components sobre una clase base propia, refs por atributo
   (`ref="foo[]"`), eventos delegados con `on:click="/metodo"`, un morphdom
   propio de 24 KB (`morph.js`) para actualizar secciones sin perder estado, y un
   *import map* de 32 entradas con code splitting escrito a mano en condicionales
   de plantilla. Todo eso existe porque **no tienen bundler ni framework**.
   Nosotros tenemos reconciliación, estado y code splitting por ruta de serie —
   copiarlo sería construir un React peor dentro de React.

   Lo que sí se copia de esa capa es la **disciplina**: `fetchpriority="low"` en
   todo lo diferible y `high` solo en la imagen LCP (85 usos),
   `content-visibility: auto` + `contain-intrinsic-size` en pies y listas largas
   (25 usos), y `sizes` **calculado desde el layout real**, no adivinado.

---

## 3.bis Los tres paquetes reales de Oliva/Bloom/Noir — lo que revelan

El fundador entregó los tres temas como paquetes completos (119 ficheros cada
uno, 14 carpetas, `manifest.json` con 16 claves, `$schema` propio en
`tentare.app`). Medido fichero a fichero:

| | Bloom vs Noir | Bloom vs Oliva |
|---|---|---|
| Ficheros idénticos byte a byte | **101 de 119** | **101 de 119** |
| Distintos en `sections/` | **0** | **0** |
| Distintos en `blocks/` | **0** | **0** |
| Distintos en `snippets/`, `components/`, `templates/`, `schemas/`, `layouts/`, `animations/` | **0** | **0** |

Los 18 que cambian son: `tokens/`, `theme.json`, `manifest.json`,
`config/settings_*`, `assets/theme-config.js`, `assets/fonts.css`, el arte
SVG de relleno, la miniatura y el README.

**Conclusión, y es grande: «cada tema es un paquete completamente
independiente» no describe lo que estos tres temas son.** Son **una sola
implementación más tres juegos de tokens y flags**. La independencia es de
*empaquetado*, no de código — y eso es exactamente el modelo que Tentare ya
tiene (`ThemeConfig` + `variantes` + `bloquesHome`).

Esto **cambia el plan**: no hay que reescribir el portal en tres juegos de
componentes. Hay que (a) profundizar los tokens, (b) empaquetar la
configuración por tema con su manifest, y (c) cerrar los huecos de schema. El
renderizador sigue siendo uno y compartido, que es además lo único sostenible
con RLS y datos de salud de por medio.

### El token que corrige una decisión ya tomada

`typography.scale` es **un token por tema**, con siete pasos semánticos
(`section`, `screenTitle`, `greeting`, `heroTitle`, `welcome`, `passNumber`,
`timer`):

| | Bloom | Noir | Oliva | Tentare hoy |
|---|---|---|---|---|
| `typography.scale.section` | **20** | **17** | **17** | **24 y 30**, según el bloque |
| `typography.scale.welcome` | 33 | 40 | 46 | — |
| `typography.display.family` | Poppins | Instrument Sans | Outfit | — |

⚠️ El 2026-08-06 recomendé «una sola escala para todos los estudios» y se
aprobó con esa recomendación. **Los tokens que llegaron después la
contradicen**: la escala es identidad del tema, no una constante del producto —
Noir y Oliva titulan a 17 y Bloom a 20. Lo correcto es `typography.scale` como
token del tema, con un valor por defecto compartido para quien no tenga tema de
esta tanda. Corregido antes de escribir código.

De los 49 tokens, **24 son iguales en los tres** (la base común) y 25 cambian
(la identidad). Ese 24/25 es la línea exacta entre «motor» y «tema».

---

## 4. Arquitectura objetivo

```
themes/
  <id>/
    manifest.ts        nombre, autor, versión, preview, capacidades, i18n
    tokens.ts          la ÚNICA fuente de color/tipografía/espaciado/motion
    presets.ts         presets con nombre (≠ un único default)
    sections/          composición de pantalla
    blocks/            piezas; cada una: schema + componente + variantes
    assets/            iconos, fuentes, imágenes propias del tema
    locales/           textos del tema
  registro.generado.ts  ← glob en build; NADIE lo edita a mano

lib/theme/            el MOTOR, que no conoce ningún tema concreto
  campos.ts             tipos de campo, condiciones, resolución (existe)
  registro.ts           descubrimiento + import dinámico por tema
  tokens.ts             tokens → CSS custom properties
  documento.ts          mapa+orden, materializar preset, mover/duplicar/ocultar
components/theme/     el EDITOR, que solo habla de manifest/schema/tokens
```

**El editor nunca importa un tema.** Hoy ya casi cumple: el Inspector se genera
del schema. Lo que falta es que el catálogo, la miniatura y los ajustes globales
salgan también del manifest en vez de `THEME_DEFINITIONS`.

**Rendimiento**: un `dynamic import()` por tema ⇒ un chunk por tema, y el portal
de una socia solo descarga el suyo. Es la única forma de que «cientos de temas»
no engorde a nadie.

---

## 5. Orden de trabajo

Cada etapa es verde en `tsc` + `node --test` + e2e, y ninguna cambia el aspecto
de un estudio existente salvo donde se diga.

| # | Etapa | Por qué primero |
|---|---|---|
| 1 | **Usar `visibleSi` y `grupo`** ✅ | Cero código nuevo: estaba construido y sin usar. Se aplicó donde la condición es REAL (el panel de estilo), no en los 18 — los bloques de catálogo tienen 2-4 campos y agruparlos sería ruido. Las condiciones de verdad llegarán con el vocabulario de campos (etapa 7). |
| 2 | **Bloque contenedor + comodín `@catalogo`** ✅ | Activa el anidamiento, que llevaba 13 PRs construido y sin consumidores. ⚠️ NO era "una entrada en el registro" como escribí: el modelo estaba, pero ni el render ni el editor sabían de `hijos`. Hubo que construir los dos. |
| 3 | **`estatico` en la instancia** (sustituye `BLOQUES_FIJOS_POR_PANTALLA`) | Mata por construcción la clase de bug que ya nos costó un fix hoy. |
| 4 | **Documento = mapa + orden** | Habilita duplicar y restaurar, imposibles con array plano. Requiere migración de lectura tolerante (ya tenemos el patrón). |
| 5 | **Escala tipográfica y de espaciado** — `--font-size--*` fija + presets por elemento + `clamp()` derivado; `--spacing-scale` por breakpoint | Arregla los rótulos de 24-vs-30px de raíz: el problema no es qué número poner, es que hay números sueltos en vez de una escala. |
| 6 | **Contraste por superficie** (`<Superficie fondo>` que emite las vars y decide el texto) | Hoy solo validamos al publicar. Esto hace que `EstiloBloque.fondo` no pueda romper la legibilidad, y el anidamiento sale gratis por cascada. |
| 7 | **Vocabulario de campos**: `rango` (min/max/step/unidad), `alineacion`, `richtext`, selectores de recurso (clase, tipo de clase, instructora, plan) | `range` es el 2.º tipo más usado de Horizon (548) y no lo tenemos. |
| 8 | **`themes/<id>/` + manifest + registro por glob** | El cambio estructural. Se hace cuando 1-7 ya han estabilizado el modelo. |
| 9 | **Resto de tokens** (motion compuesto, springs, `--layer-*`, rampas de opacidad por brillo) | 33 → objetivo ~150. Requiere el paso 8 para que cada tema traiga los suyos. |
| 10 | **Presets con nombre por tema** | `settings_data.json` separa `current` de `presets`; nosotros solo tenemos `defaults`. |
| 11 | **Bloque estático en bucle** («edita una tarjeta, cambian las 24») | Necesita 3 y 4. |

Etapas 1-3 no tocan el esquema persistido. La 4 sí, y es la única que necesita
migración de datos. Las etapas 5 y 6 **sí cambian el aspecto de estudios ya
publicados** — la 5 con el visto bueno ya dado (bajar la escala para todos), la
6 solo donde hoy hay un fondo de bloque que no contrasta.

---

## 6. Lo que ya teníamos bien

No todo era deuda. Estas decisiones de Tentare son **mejores** que su equivalente
en Horizon y no se tocan:

- **Condiciones serializables y tipadas** en vez de un string con Liquid.
- **`grupo` en el campo** en vez de una lista aparte que puede perder campos.
- **`colorHeredado`/`numeroHeredado`** en vez de plantillas dentro de los valores.
- **Lectura tolerante** (`resolverBloque`): un `kind` desconocido se descarta en
  vez de tumbar la pantalla de la socia.
- **Gate de contraste al publicar** (`validarContrasteTheme`). Horizon no tiene
  nada equivalente: puedes publicar un tema ilegible.

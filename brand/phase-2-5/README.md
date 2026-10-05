# Fases 2 a 5 · aplicadas en el repo (5-oct-2026)

> Continúa `phase-1/README.md`. Mismas reglas: lo que el paquete no define es **OPEN DECISION** (`implementation-plan.md` §D) y no se inventa.
> Restricción del primer tramo (#2537): **no se tocaba `--brand`** (el color de cada estudio y su oliva por defecto), ni el anillo de foco (OPEN DECISION 13). Las fases 4 y 5 entran solo en lo que no depende de eso.

## Fase 2 · Typography — hecha, en el panel

| Qué | Dónde |
|---|---|
| Schibsted Grotesk (400/500/600) y DM Mono (400/500), servidas desde el repo como las demás (`next/font/local`, latin + latin-ext, OFL al lado) | `app/_fuentes/fuentes-panel.ts`, `app/_fuentes/schibstedgrotesk/`, `app/_fuentes/dmmono/`. Se bajan con `node scripts/descargar-fuentes.mjs schibstedgrotesk dmmono` |
| Se sirven con su **nombre real** (`font-family` en `declarations`), así `--t-font-sans` y `--t-font-mono` de `tokens.css` resuelven tal cual, sin copiar el token | `fuentes-panel.ts` |
| Ámbito `.marca-panel`: `font-sans`, `font-heading` y `font-mono` pasan a los tokens de la marca dentro del panel; fuera siguen siendo Jakarta y la mono del sistema | `app/globals.css` (`--fuente-sans`/`--fuente-mono`), `app/(dashboard)/layout.tsx` |
| Lo que el panel abre en un portal a `body` (diálogos y tooltips de base-ui) también la lleva: `body` tiene la clase mientras el panel está montado | `components/layout/marca-en-portales.tsx` |
| Pesos de la marca: `font-synthesis-weight: none`, así `font-bold` (615 usos) y `font-extrabold` (60) caen al 600 sin negrita sintética | `.marca-panel` |

**Por qué solo el panel.** `font-heading` lo usa sobre todo la app de la alumna (26 sitios): cambiar el `@theme` para todo el sitio le habría cambiado la letra. La app de la alumna, `/reservar`, la landing y `/ayuda` siguen con la suya (OPEN DECISIONS 16 y 17). Verificado en el navegador: la landing no pide ni un woff2 de las fuentes nuevas.

**Qué no se ha hecho de la fase 2.**
- **Tamaños base de `h1`–`h3`**: hay 17 títulos del panel sin clase de tamaño que crecerían de golpe. La escala (`--t-fs-*`) se aplica componente a componente en las fases 6–14.
- **Interlineado del `body`**: la marca da 26/16 para cuerpo, pero el panel es casi todo `ui`/`small` (20/14, 18/13). Heredar 1,625 a todo lo haría más alto que la propia guía. Se queda en 1,5 hasta que cada componente use su rol.
- **Retirar Jakarta y Plex Mono**: no se puede mientras la landing, la app de la alumna y `/reservar` las usen.

## Fase 3 · App shell — hecha

La geometría ya era la de la marca (la marca se sacó del propio repo):
- sidebar de 64 / 224 / 288;
- radio 28 y `surface-nav`;
- topbar de 56;
- contenido de 1320 como máximo.

Cambia el desenfoque del topbar al token de glass ligero (`backdrop-blur-(--t-glass-light-blur)`, 12 px). El fondo sigue siendo `bg-background/80`, que en claro es exactamente `--t-glass-light-bg`; el glass en oscuro no está definido.

## Fase 4 · Navigation — parcial (sin `--brand`)

- **Rótulos de grupo** (OPERACIÓN · EQUIPO · NEGOCIO · ESTUDIO) en `.t-label`: mono 12/16, +8 % y en mayúsculas. Va en el menú de escritorio y en el cajón «Más». El del cajón sube de `white/25` (≈2,2:1) a `white/50`, como el de escritorio.
- **Ítems**: icono de 17. El alto se queda en ~36 y no en los 40 de la guía: con 40, a 1440×900, «Configuración» quedaba bajo el pliegue del menú (OPEN DECISION 18).
- **Fondo del menú de escritorio: NO se ha migrado.** Se probó `var(--sidebar)` (Ink 950 por el puente), pero en oscuro vale lo mismo que el lienzo (`#12161B`) y el menú desaparecía contra él. Sigue en `#0A0A0A` hasta decidir `surface-nav` en oscuro (OPEN DECISION 2), junto con su degradado inferior.
- **Contador**: con las medidas del Badge (20 de alto, 12/500). El de error, «si pide acción», ya lo era.
- **Lanzador**: en píldora, 440 de ancho como máximo, con ⌘K en mono por la fase 2.
- **Fuera:**
  - el ítem activo, que ya es `--brand`, como pide la guía;
  - la barra inferior móvil (OPEN DECISION 14).

## Fase 5 · Primitives — parcial (sin `--brand` ni foco)

- **Button:**
  - peso 500 en todas las variantes;
  - texto 13 / 14 / 15;
  - 160 ms con la curva de la marca (y quieto con `prefers-reduced-motion`, porque `--t-dur-micro` pasa a 0);
  - variante nueva `primary`, la acción principal de la guía, en Ink. El valor por defecto sigue siendo `--brand`: cambiarlo es la migración del brand slot.
- **IconButton**: 36 × 36.
- **Label**: 13 / 500.
- **Badge:**
  - en píldora, con los tonos `info`, `success`, `warning` y `attention` (más `destructive`, que es error);
  - en claro llevan fondo 100 y texto 700 de la marca, todos ≥ 4,65:1;
  - en oscuro, los semánticos de siempre (OPEN DECISION 1).
- **Tooltip** (e InfoTip, que comparte aspecto):
  - glass oscuro (`.t-glass-dark`), radio 8, ancho de 240 y 400 ms;
  - es oscuro en los dos modos, así que ya no depende de que el portal caiga dentro de `.dark`.
- **Fuera:**
  - el anillo de foco (OPEN DECISION 13) y el Toggle (OPEN DECISION 15);
  - Select, Textarea, Checkbox, Radio, Avatar y Tabs, que no tienen primitiva compartida en `components/ui` (cada pantalla escribe la suya): crearlas sin nadie que las use sería código muerto, y su adopción es el trabajo de las fases 6–14.

## Hallazgos técnicos

- ⚠️ **El glass de `tokens.css` no desenfocaba en Chrome ni en Firefox.** Las tres `.t-glass-*` declaraban `backdrop-filter` y DESPUÉS `-webkit-backdrop-filter` con el mismo valor. LightningCSS, el que usa Next, junta las dos y se queda solo con la última, así que el CSS servido llevaba solo la prefijada (medido en el navegador: `backdrop-filter: none`). Corregido en `tokens.css`: prefijada primero, orden estándar, sin cambiar ningún valor. Lo vigila un test.
- ⚠️ **Las utilidades de `tokens.css` (`.t-label`, `.t-glass-*`, `.t-data`…) van sin capa y ganan a cualquier utilidad de Tailwind**, por específica que sea (lo de `@layer utilities` siempre pierde contra lo que no tiene capa). Se combinan solo con clases que no toquen sus propiedades: `t-label text-white/50` sí; `t-label text-[14px]` no hace nada.
- **Los diálogos de `components/ui/dialog.tsx` portalean a `body`**, fuera del contenedor del tema: en modo oscuro salen con los tokens claros (`bg-popover` blanco). Es anterior a este cambio y no se toca aquí; el anfitrión del panel (`lib/panel-portal.ts`) existe para esto, pero cambiar el `container` de los portales de base-ui movería el anidamiento de los popovers dentro de los diálogos y merece su propia verificación.

## Guardas (`lib/brand-tokens.test.ts`)

Además de las de la fase 1:
- **Familias:** las de `fuentes-panel.ts` son la primera familia de `--t-font-sans` y `--t-font-mono`. Si no coinciden, el panel cae a la del sistema sin avisar.
- **Pesos:** solo se cargan los que define la marca.
- **Ámbito:** `.marca-panel` solo la ponen el layout del panel y `MarcaEnPortales`.
- **Trinquete de colores retirados en el panel:**
  - cuenta los neutros antiguos y la familia oliva escritos a mano;
  - el tope está fijado por fichero y solo puede bajar;
  - quedan fuera la web comercial, la app de la alumna y `components/marca/`.

## Fases 4 y 5 · segunda parte: el brand slot (5-oct-2026)

El fundador pidió seguir con las fases 4 y 5 **migrando `--brand`**.

**Medido antes de tocar nada (producción):**
- Hay 10 estudios. 7 no tienen tema publicado y están en el preset `original`, es decir, el oliva de fábrica.
- 1 publicó ese mismo tema sin cambiar los colores, y 2 eligieron color propio.
- `/api/theme` devuelve `DEFAULT_THEME` (oliva) a quien no tiene tema y `PanelThemeProvider` lo escribe en línea, así que cambiar el `--brand` del CSS no lo habría visto nadie.

**Qué cambia:**
- **Estudio con el tema de fábrica (8 de 10):** el panel deja de escribir el oliva en línea (`lib/panel-marca.ts`) y manda el valor por defecto de la marca en `.marca-panel`:
  - `--brand` es Sand y `--brand-foreground`, Ink 900, los del paquete;
  - `--brand-medio` es Blue 700: Sand no llega a 4,5:1 como texto y es el enlace de la marca;
  - `--accent` es `surface-sunken`, el hover de la guía.
- **Estudio con su color:** lo conserva igual que antes. Gana `--brand-medio` calculado a partir de SU color y legible sobre la tarjeta (antes era el oliva para todos, contra la regla de marca blanca §3.10).
- **Button:** la acción principal (`default`) pasa a Ink (`primary` de la guía), y el color del estudio queda como variante `brand`.
- **`text-brand` → `text-brand-medio`** (25 usos). Con Sand, o con una marca clara como la de un estudio real (`#E9DAAF`), el texto en el color de marca no se leía.
- **Blanco fijo sobre la marca** → `text-brand-foreground` (4 botones y el `⌘K` del lanzador).
- **Indicadores pequeños con relleno de marca** (puntos de «sin leer», barras de 3–4 px) → `bg-brand-medio`.
- **`PanelThemeProvider`** calcula con la tarjeta oscura real (`#1B2027`) y no con la anterior.

**Sin cambios, a propósito:**
- `:root`: la landing, `/login` y el alta siguen con el oliva.
- `/reservar` y la app de la alumna (OPEN DECISION 21).
- El relleno en oscuro (OPEN DECISION 19).
- Los tintes y bordes de marca (OPEN DECISION 20).
- `--sidebar-primary` (la insignia «Nuevo» del menú).

**Verificación:**
- **Andamiaje e2e:** el panel ahora sirve el tema de fábrica. Así los barridos de contraste miden lo que ven 8 de cada 10 estudios.
- **Capturas** con el tema de fábrica, con un color propio oscuro y con uno claro.

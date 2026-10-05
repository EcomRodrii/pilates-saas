# Fase 1 · Global theme — informe

> **Estado:** FASE 1 CERRADA. Paquete final listo para que Claude Code lo aplique en `pilates-saas`.
> Desde aquí no puedo hacer commits en el repositorio: los archivos se entregan listos para copiar, con un único cambio de 3 líneas en `app/globals.css`. Para aplicarlo, sigue los pasos de la sección 8 o usa el prompt para Claude Code de la sección 9.
> **No se avanza a la Fase 2.**

## 0. Auditoría

| Pregunta | Respuesta (leído en el repo) |
|---|---|
| Dónde están los tokens | `app/globals.css`. Bloque `:root` (l.78–300): `--background`, `--brand*`, estados, `--sidebar*`, `--tenti-*`, paleta categórica, `--motion-*`, `--radius`. |
| Dónde está el theme | `app/globals.css`, con `.dark` en l.301, aplicado **al contenedor del panel, no a `<html>`**. La marca blanca del estudio la escribe `PanelThemeProvider`, que pone `--brand*` en línea. El portal usa `--portal-brand*`. |
| Dónde está Tailwind | Tailwind v4 dentro de `globals.css`: `@import "tailwindcss"`, `@custom-variant dark (&:is(.dark *))` y `@theme inline` (l.11–76), que mapea `--color-*` y la escala de radios a partir de `--radius: 1rem`. |
| Variables CSS | Todas en `globals.css` salvo las fuentes: `app/_fuentes/fuentes.css` + `fuentes.ts` (next/font: Plus Jakarta Sans e IBM Plex Mono → `--font-jakarta`, `--font-plex-mono`). |
| Sistema de componentes | shadcn (variante base-ui) + `class-variance-authority` + `tw-animate-css`, en `components/ui/*`. Botón, input y badge en píldora (`rounded-full` / `rounded-4xl`); Card en `rounded-3xl`. |

## 1. Archivos modificados
| Archivo | Cambio |
|---|---|
| `app/globals.css` | **Solo 3 líneas de `@import`**, después de `@import "shadcn/tailwind.css";`. No se cambia ningún valor ni ninguna regla existente (ver `globals.css.patch`). |

## 2. Archivos creados
| Archivo | Qué es |
|---|---|
| `brand/tokens.css` | Tokens nuevos, todos con el prefijo `--t-`: core, semantic, brand slot, tipografía, espacio, radios (marca y patrones de producto), bordes, sombras, glass, layout y motion. Base oscura. |
| `brand/tailwind-theme.css` | `@theme inline` con utilidades nuevas en el espacio de nombres `t-` (`bg-t-canvas`, `text-t-primary`, `rounded-t-card`, `font-t-mono`…). No pisa ninguna utilidad existente. |
| `brand/legacy-bridge.css` | Puente: los nombres de shadcn (`--background`, `--foreground`, `--border`…) pasan a apuntar a los tokens nuevos. Cada línea deja anotado el valor `[LEGACY …]` anterior. |
| `brand/phase-1/globals.css.patch` | El cambio exacto en `globals.css`. |
| `brand/phase-1/README.md` | Este informe. |

## 3. Tokens nuevos (194, prefijo `--t-`)
- **Core:**
  - Ink: 950, 900, 800, 700, 500, 400 y 300.
  - Cream, Paper, Stone, Sand, Line y Line Strong.
  - Blue y Magenta, cada uno en 100, 500 y 700.
  - Success, Warning y Error, cada uno en 100 y 700.
  - Degradados de logo y de progreso.
- **Semantic:**
  - `--t-surface-*`: canvas, raised, sunken, inverse y nav.
  - `--t-text-*`: primary, secondary, tertiary, disabled, inverse, link y accent.
  - `--t-border-*`: subtle, default, strong y focus.
  - `--t-selection` y `--t-attention`.
  - `--t-{success|warning|error|info}-{fg|bg}`.
- **Brand slot:** `--t-brand`, `--t-brand-foreground`, `--t-brand-strong`, `--t-brand-strong-foreground`. **Definidos, pero todavía sin conectar** al `--brand` del repo (ver conflicto 2).
- **Tipografía:**
  - `--t-font-sans` (Schibsted Grotesk) y `--t-font-mono` (DM Mono).
  - Pesos, y tamaños / interlineados / tracking desde display hasta caption, data y metric.
  - **Definidos, todavía sin aplicar:** la fuente se carga en la Fase 2.
- **Espacio:** `--t-space-0` … `--t-space-32` (base 4).
- **Radios:**
  - Escala de marca `--t-radius-none` … `--t-radius-full`.
  - Patrones de producto aprobados: `--t-radius-product-control` (full), **`--t-radius-product-card` = 24 px**, `--t-radius-product-nav` (28 px).
- **Bordes:** hairline 1, focus 2, schedule 1,5, progress 3.
- **Sombras:** card, dropdown, floating, modal y nav.
- **Glass:** light, marketing, solid y dark.
- **Layout:** grid, panel y sidebar.
- **Motion:** `--t-dur-*` y `--t-ease-standard`.
- **Tamaños:** controles, input, área táctil, iconos, avatares y badge.

## 4. Tokens LEGACY detectados
| Grupo | Tokens | Tratamiento en fase 1 |
|---|---|---|
| Superficies / texto / bordes | `--background` #EEEEE8 · `--card` · `--popover` · `--muted` #F5F5F1 · `--secondary` #F3F3EF · `--foreground` #1A1A1A · `--muted-foreground` · `--primary` #131313 · `--border` #C8C8BD · `--input` #83837A · `--ring` #6B7A3C · `--sidebar` #0F0F0F | **Puenteados** a `--t-*` |
| Estados (claro) | `--destructive` #A8442A · `--success` #2F6B4F · `--warning` #8F6215 · `--info` #3F5A7A | **Puenteados** (cambios mínimos de tono, todos mejoran o mantienen AA) |
| Estados (oscuro) | `--destructive` #E08a6B · `--success` #7FBE9C · `--warning` #E0B562 · `--info` #8FAAC9 | **Sin tocar** — OPEN DECISION |
| Marca / acento | `--brand` #343825 · `--brand-foreground` #D9C29E · `--brand-secondary` #5A6142 · `--brand-medio` #55622C · `--sidebar-primary` · `--accent*` · `--lime-*` (escala de acento) · `--portal-brand*` | **Sin tocar**, marcados LEGACY → fases 4/5 |
| Calendario | paleta categórica de 9 tonos (l.228–290) | **Sin tocar** — OPEN DECISION |
| Mascota | `--tenti-*` | Sin tocar. La ilustración está retirada del sistema; se elimina cuando se retire su uso |
| Motion | `--motion-fast` 120 · `normal` 180 · `medium` 240 · `slow` 320 · `ventana` 500 · `--motion-ease` (.16,1,.3,1) · `ease-ventana` · `ease-in` | **Sin tocar**; conviven con `--t-dur-*` — OPEN DECISION nº 10 |
| Radio | `--radius` 1rem y su escala `@theme` | Sin tocar |
| Radio de Card | todos los `rounded-3xl` de cards (= 38,4 px en este repo, por `--radius-3xl: calc(var(--radius) * 2.4)`) | **LEGACY.** El valor aprobado es 24 px (`--t-radius-product-card` / `rounded-t-card`). Se migran en la **fase 6 (Cards / tables)**; en la fase 1 no se toca ningún componente |
| Fuentes | `--font-jakarta`, `--font-plex-mono`, `--font-sans`/`--font-heading` → Jakarta | Sin tocar → Fase 2 |
| Hex en componentes | más de 60 usos sueltos de #1A1A1A, #0F0F0F, #131313, #F5F5F1, #EEEEE8, #F3F3EF (sobre todo `components/landing/*`, `components/funcionalidades/*`, `components/ayuda/*`, `components/comparativa/*`, `components/auth/*`) | **No se tocan**; el puente no les afecta. Pendiente de inventario completo (búsqueda limitada a ~400 archivos) |

## 5. Posibles conflictos
1. **Radio de card (RESUELTO).** El aprobado es **24 px** y queda definido en `--t-radius-product-card` / utilidad `rounded-t-card`. Las cards actuales siguen en `rounded-3xl` (38,4 px) hasta la fase 6. Mientras tanto convivirán dos radios: los componentes nuevos o migrados usan 24 px y los existentes, 38,4 px. **No redefinir `--radius-3xl`**: cambiaría a la vez todo lo que use `rounded-3xl`, incluidos elementos que no son cards.
2. **Marca blanca y oliva.** `--brand` sigue en oliva #343825 porque es el acento por defecto de los estudios sin tema y lo sobrescribe `PanelThemeProvider`. Cambiarlo a Sand es visible en todos los botones primarios, así que se deja para la fase de primitivas (4/5), con revisión aparte.
3. **El anillo de foco pasa a Blue 500 mientras el acento sigue en oliva.** Hasta las fases 4/5 convivirán un foco azul y botones oliva. Es intencionado para la accesibilidad, pero es un cruce visible.
4. **`.dark` va en el contenedor del panel, no en `<html>`.** Por eso el puente usa `.dark.dark` y la base oscura de `tokens.css` usa `.dark` además de `[data-theme="dark"]`. La app de socias no se ve afectada.
5. **Contraste.** `--muted-foreground` pasa a Ink 500 sobre Stone (4,8:1) y Cream (5,3:1): cumple AA. `--input` se mantiene oscuro (Ink 500) para que el contorno de los controles llegue a 3:1. Hay que volver a pasar el e2e `configuracion-contraste.spec.ts`.
6. **Orden de los `@import` en Tailwind v4.** Los imports de `/brand` van justo después de shadcn y antes del `@theme inline` del repo. El puente gana por especificidad, no por orden.
7. **Hex sueltos.** Las pantallas con colores escritos a mano (landing, ayuda, comparativa) **no cambian** y pueden verse mezcladas con el Cream nuevo (por ejemplo, `#EEEEE8` de la landing junto a `--background` Cream).

## 6. OPEN DECISIONS registradas (fuera de la fase 1)
- Estados del modo oscuro.
- Transformación de los 9 tonos actuales del calendario.
- Área de respeto del logo.
- Escala de motion legacy frente a `--t-dur-*`.

## 7. Pendiente para la Fase 2 (Typography)
- Añadir **Schibsted Grotesk** y **DM Mono** en `app/_fuentes/fuentes.ts` (next/font, subconjuntos latin y latin-ext como hoy) y exponerlas en `fuentes.css`.
- Conectar `--font-sans` / `--font-heading` del `@theme` a `--t-font-sans`, y `--font-mono` / `.lp-mono` a `--t-font-mono`.
- Aplicar la escala tipográfica a los estilos base (h1–h3, body) y las utilidades `t-label` / `t-data` / `t-metric`.
- Decidir si Jakarta y Plex Mono se retiran o se mantienen como fallback durante la transición.

## 8. Cómo aplicar
1. Copiar `/brand` a la raíz de `pilates-saas`.
2. Aplicar `brand/phase-1/globals.css.patch`, que son 3 líneas.
3. `npm run dev`. Revisar en claro y oscuro: Resumen, Centro de Control, Calendario, Clientas, Cobros, Configuración y `/reservar/[slug]`.
4. Pasar el e2e de contraste.
5. **Rollback:** borrar la línea `@import "../brand/legacy-bridge.css";`. Los tokens nuevos se quedan definidos, pero nadie los usa.

## 9. Prompt para Claude Code
> Lee `brand/README.md` y `brand/phase-1/README.md`. Aplica solo la Fase 1: copia `/brand`, aplica `brand/phase-1/globals.css.patch` y no modifiques ningún componente ni ningún otro valor. Ejecuta el build, `e2e/configuracion-contraste.spec.ts` y haz capturas en claro y oscuro de las pantallas del punto 8. Lista los hex sueltos de `app/` y `components/` que coinciden con los LEGACY de la sección 4, sin cambiarlos. No empieces la Fase 2.

## 10. Aplicado en el repo (5-oct-2026)

Copiado `/brand` tal cual y aplicado `globals.css.patch` (3 líneas). Los tokens no se han reescrito. Lo que encontró la aplicación y el informe de arriba no recogía:

| Hallazgo | Tratamiento |
|---|---|
| **`.t-label` ya existía** en la app de la alumna (`.student-app .t-label`, ~60 usos). La global de `tokens.css` le colaba `line-height: 16px`, que la suya no declaraba. | `student.css` fija `line-height: inherit` (lo que ya hacía): cero cambio visual. Un test falla si una utilidad global de la marca vuelve a colarse en una `.t-*` de la alumna (fase 2 añadirá más). |
| **`border-t-success`** (y `-primary`, `-secondary`, `-accent`, `-warning`, `-info`) pasa a emitir dos reglas: el espacio `t-` choca con el sufijo de lado de Tailwind. | Sin usos hoy. Test que lo vigila. **OPEN DECISION 11** en `implementation-plan.md`. |
| **Anillo de foco** Blue 500: 2,86:1 sobre Cream. | Se aplica como está aprobado. **OPEN DECISION 13**. |
| `tokens.css` (v1.1) define en oscuro `border-default`, `border-strong`, `text-inverse`, `selection` y `shadow-card`, que `design-tokens.json` (v1.0) no tiene. | Manda `tokens.css` por ser la decisión posterior. El test compara solo lo que fija el JSON. |
| `implementation-plan.md` citaba la Sesión 07 Home Redesign como base de la fase 17. | Retirada. **OPEN DECISION 12**. |
| `PanelThemeProvider` lleva escrito el `--card` oscuro antiguo (`#1E1E22`) para calcular `--brand-secondary`; con el puente la tarjeta es `#1B2027`. | No se toca (fase 4/5). La diferencia en el cálculo es despreciable. |
| `phase-1/globals.css.patch` no se versiona: el repo ignora `*.patch` (`.gitignore`, y `lib/repo-publico-guardia.test.ts` los vigila). | Su contenido son los 3 `@import` que ya están en `app/globals.css`; su orden lo fija `lib/brand-tokens.test.ts`. |
| Las fuentes no van por `next/font/google` sino por `next/font/local` desde `app/_fuentes/`. | Fase 2: Schibsted Grotesk y DM Mono se descargan con `scripts/descargar-fuentes.mjs`. |

**Guardas** (`lib/brand-tokens.test.ts`, entra en `npm test`): `tokens.css` contra `design-tokens.json` (core, semánticos en claro, marca blanca, base oscura, espacio, radios y motion); card de producto a 24 px sin redefinir ningún `--radius` del repo; orden de los `@import`; el puente solo toca superficies, texto, bordes y estados (ni `--brand*`, ni estados en oscuro); el tema y el puente solo apuntan a tokens que existen.

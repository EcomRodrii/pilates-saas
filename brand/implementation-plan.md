# TENTARE IMPLEMENTATION PLAN · v1.0

Cómo llevar la foundation a `pilates-saas` (Next.js + Tailwind v4 + base-ui + cva) **sin rediseñar 50 pantallas a la vez**.

## A. Arquitectura
```
/brand                      ← fuente de verdad (este paquete)
  brand-os.md
  design-tokens.json        ← origen de los valores
  tokens.css                ← generado desde el JSON
  component-guidelines.md
  ui-rules.md
  implementation-plan.md
app/globals.css             ← @import "../brand/tokens.css"; sin hex sueltos
components/ui/*             ← primitivas (cva) que consumen SOLO tokens semánticos
components/panel-theme      ← escribe --brand / --brand-foreground por estudio (ya existe)
```
**Capas:**
1. Core: hex.
2. Semantic: uso.
3. Brand slot: marca blanca.
4. `@theme inline`: utilidades de Tailwind.

Los componentes usan solo las capas 2 y 3. Cambiar un valor global = editar el JSON → regenerar el CSS.

**Guardarraíles:**
- Regla de lint (stylelint o eslint-plugin-tailwindcss) que prohíba hex y `px` arbitrarios fuera de `/brand`.
- Test que compare `tokens.css` con `design-tokens.json`.
- e2e de contraste (ya existe `configuracion-contraste.spec.ts`): ampliarlo a los tokens nuevos.

**Correspondencia con los tokens actuales** (para migrar sin romper):
| Actual | Nuevo |
|---|---|
| `--background` #EEEEE8 | `--surface-canvas` |
| `--card` | `--surface-raised` |
| `--foreground` #1A1A1A | `--text-primary` |
| `--muted-foreground` | `--text-tertiary` |
| `--border` #C8C8BD | `--border-default` |
| `--sidebar` #0F0F0F | `--surface-nav` |
| `--brand` / `--brand-foreground` | se mantienen (brand slot); su valor por defecto pasa a Sand / Ink |
| `--destructive` / `--success` / `--warning` / `--info` | `--error-fg` / `--success-fg` / `--warning-fg` / `--info-fg` |
| `--font-jakarta` | `--font-sans` (Schibsted Grotesk) + `--font-mono` (DM Mono) |

Durante la transición, los nombres antiguos se definen como alias de los nuevos.

## B. Migración por fases
Cada fase arranca solo si existen sus requisitos. Cada una se cierra con capturas antes y después, el e2e de contraste y una revisión con la checklist de la Sesión 10.

| # | Fase | Requisitos previos | Alcance |
|---|---|---|---|
| 1 | Global theme | `tokens.css` + alias de tokens antiguos | Colores de fondo, superficie, texto y borde. Nada más. |
| 2 | Typography | Fase 1 · fuentes con `next/font` (Schibsted, DM Mono) | `--font-sans`/`mono`, escala y clases `t-label`/`t-data`/`t-metric` |
| 3 | App shell | 1–2 · tokens de layout y glass | `dashboard-shell`, márgenes, topbar en glass ligero |
| 4 | Navigation | 3 · Badge, IconButton | Sidebar (sede, Esencial/Todo, grupos, contadores), topbar (lanzador, iconos), menú móvil |
| 5 | Primitives | 1–2 | Button, IconButton, Input, Select, Textarea, Checkbox, Radio, Toggle, Badge, Avatar, Tooltip, Tabs |
| 6 | Cards / tables | 5 | Card, Panel, Modal, Drawer, Divider, Table, Skeleton, Toast, Alert, Empty State |
| 7 | Calendar | 6 · schedule line (`t-schedule-line`, `t-now-dot`) | Clase, «Ahora», huecos, alertas, categorías por tono (resolver la OPEN DECISION de la paleta categórica) |
| 8 | Dashboard | 6–7 · KPI card, Class card | Resumen («Hoy en el estudio», Action Center), Centro de Control (veredicto, bandeja) |
| 9 | Clients | 6 · Client row | Listado, ficha, importador |
| 10 | Payments | 6 · Payment row | Cobros, Caja, recibos |
| 11 | Subscriptions / bonuses | 10 · Subscription card, Bonus card | Paquetes, cuotas, bonos |
| 12 | Instructors | 6 · Instructor row | Equipo, liquidaciones |
| 13 | Substitutions | 12 · Replacement workflow, Activity timeline | Sustituciones, aceptar sustitución |
| 14 | Analytics | 6 · Chart, KPI card | Informes, Cierre de año |
| 15 | Booking widget | 5 · Date/Time selector, Capacity indicator, Booking CTA, Waitlist, Confirmation | `/reservar/[slug]`, widget incrustable |
| 16 | Student app | 15 | App instalable de las alumnas |
| 17 | Marketing surfaces | Brand OS completo · motion de scroll | Landing (base: **OPEN DECISION 12** — la Sesión 07 Home Redesign está retirada), /precios, /funcionalidades, emails |

## C. Source of truth
Desde este momento:
1. **TENTARE BRAND OS** → `brand/brand-os.md`
2. **TENTARE DESIGN TOKENS** → `brand/design-tokens.json` + `brand/tokens.css`
3. **TENTARE COMPONENT GUIDELINES** → `brand/component-guidelines.md`
4. **TENTARE PRODUCT UI RULES** → `brand/ui-rules.md`
5. **TENTARE IMPLEMENTATION PLAN** → `brand/implementation-plan.md`

Ninguna decisión visual futura se toma fuera de estos documentos. Lo no definido se marca **OPEN DECISION**.

## D. OPEN DECISIONS (registro)
1. Colores de estado en modo oscuro.
2. `--surface-nav` en oscuro (#0D1014 propuesto).
3. Área de respeto del logo (propuesta: altura de la «e»; isotipo ¼).
4. Índice editorial fuera de la web (documentos, slides).
5. Correspondencia de la paleta categórica del calendario (9 tonos actuales) → tonos del sistema.
6. Línea de horario en rojo para clases con problema, o solo el borde.
7. Medio disco y remate en la app de alumnas.
8. Sesión de fotografía propia (shot list en la Sesión 05).
9. Verifacturación (Verifactu): solo se menciona en Confianza si se cumple.
10. Correspondencia de los tokens `--motion-*` actuales del repo con la escala 160/240/400/600.
11. Espacio de nombres `t-` de las utilidades: choca con el sufijo de LADO de Tailwind. `border-t-success` (y `-primary`, `-secondary`, `-accent`, `-warning`, `-info`) emite las dos lecturas a la vez: borde entero en `--t-success-fg` y borde de arriba en `--success`. Hoy no lo usa nadie y un test lo vigila (`lib/brand-tokens.test.ts`); renombrar el espacio es decisión del sistema.
12. Base visual de la fase 17 (Marketing): la propuesta de Home de la Sesión 07 está retirada y no forma parte del sistema aprobado. La Home será un proyecto aparte.
13. Anillo de foco: `--ring` → Blue 500 da 2,86:1 sobre Cream (3,14:1 sobre Paper). WCAG pide 3:1 para un indicador de foco; el oliva anterior daba 4,03:1. Afecta al `--ring` sólido; el `outline-ring/50` de la base ya estaba por debajo antes (1,85:1) y ahora queda en 1,64:1.
14. Barra inferior móvil del panel: la guía de glass la incluye, pero sus etiquetas son de 10 px en gris y, con glass, bajan a ~3,4:1 cuando pasa contenido oscuro por debajo. Decidir si va en glass (y con qué tinta) y cómo lleva sus etiquetas al mínimo de 13 px sin que no quepan cinco en 375 px. Hoy sigue sólida.
15. Toggle apagado: la guía pide pista en `border-default`, que da 1,69:1 contra la tarjeta (WCAG 1.4.11 pide 3:1 para el contorno de un control). El `Interruptor` actual da 5,82:1 (medido por `e2e/configuracion-contraste.spec.ts`) y no se ha tocado.
16. Tipografía de la app de alumnas: `ui-rules.md` §1 pone Schibsted + DM Mono como constante en todas las superficies, pero la app es marca blanca y el estudio elige su pareja tipográfica (Apariencia). Decidir si la marca de TENTARE entra ahí o la letra sigue siendo del estudio.
17. Superficies sin fase propia para la tipografía: login, alta/onboarding (`pantallas-valor` lleva Jakarta escrita a mano), `/interno` y `/ayuda`. Hoy siguen con Jakarta.
18. Alto del ítem de la sidebar: la guía dice 40. Con 40, a 1440×900 en modo Esencial «Configuración» queda bajo el pliegue del menú (antes se veía), y a 768 px de alto, peor. Se queda en ~36 hasta decidir si el ítem baja, si los grupos se compactan o si se acepta desplazar el menú.
19. Brand slot por defecto en modo oscuro: `tokens.css` no lo redefine y el producto anterior ya probó Sand como relleno en oscuro (sus tintes `bg-brand/5–10` volvían la pantalla sepia). Los estudios con el tema de fábrica siguen, en oscuro, con la salvia del bloque `.dark`.
20. Tintes y bordes de marca con la marca por defecto: `bg-brand/N` (79 usos) y `border-brand` (104) se pintan en Sand, que sobre Paper no llega a 3:1 como indicador de estado. La guía marca la selección con `selection` y la acción con Ink: se migran pantalla a pantalla en las fases 6–14.
21. Marca por defecto en las superficies de la alumna: el panel de un estudio con el tema de fábrica ya va en Sand/Ink, pero su `/reservar` y su app siguen con el oliva (`DEFAULT_THEME`) hasta las fases 15 y 16.

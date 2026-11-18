# Fase 3 — Shell del panel reabierto: auditoría y propuesta (18-nov-2026)

Decisión del fundador (18-nov): reabrir el shell. Esto es **auditoría del shell actual + propuesta de shell nuevo**.
No hay código tocado. El shell actual no se ha visto renderizado en esta sesión (el panel exige sesión de estudio);
lo de abajo sale de leer `components/layout/*` y `brand/`. Antes de implementar hace falta verlo en un estudio de prueba.

## 1. Shell actual (leído del código)
| Pieza | Hoy | Fichero |
|---|---|---|
| Sidebar | **Flotante**: `top-[104px] left-4 bottom-4`, `rounded-[28px]`, fondo `#0A0A0A` escrito a mano; en móvil cambia a barra superior horizontal `rounded-3xl` | `components/layout/sidebar.tsx` (888 líneas) |
| Ítems | Píldora `rounded-full`, 13 px, hijos con `pl-14`; «Configuración» pegada abajo (`sticky bottom-0`) | idem |
| Topbar | Solo escritorio, `h-14` sticky, fondo `bg-background`; el buscador es **una píldora en `bg-brand` (Sand)** «¿Qué quieres hacer o buscar?» + `⌘K`; a la derecha píldora de prueba, privacidad, iconos | `topbar.tsx` (141) |
| Contenido | `lg:pl-[var(--sidebar-w)]`, `max-w-[1320px]`, `px-6`, sin marco propio | `dashboard-shell.tsx` (538) |
| Móvil | Barra inferior con iconos de 10 px + cabecera `pt-14` | sidebar + shell |
| Carga | `PanelSkeleton` genérico solo en bienvenida/alta | `dashboard-shell.tsx` |

Deuda concreta encontrada:
- **Hex a mano en el sidebar** (`#0A0A0A`, `#171717`, `rgba(255,255,255,…)`) contra la regla de «solo tokens»
  (`brand/implementation-plan.md` §A y el trinquete de `lib/brand-tokens.test.ts`). `--surface-nav` existe (Ink 950 `#12161B`) y no se usa ahí.
- **La píldora de búsqueda es la marca de estudio (`bg-brand`)**: con el tema de fábrica queda Sand, y con un estudio
  de marca fuerte, el control más usado se vuelve el elemento más ruidoso de la pantalla. Es un hueco de jerarquía (`ui-rules` §1: en
  Tables/forms/Payments la marca baja al 20–30 %).
- **Doble cabecera**: topbar sticky + cabecera de cada pantalla (título de sección). Shopify las unifica (título en la propia barra).
- El hueco `top-[104px]` deja el sidebar **flotando bajo la topbar**: el logo vive fuera de la píldora oscura; se pierde altura útil.
- Estado «hijos» solo por indentación; no hay breadcrumb en pantallas hijas (ficha de clienta, ficha de clase, crear clase).

## 2. Dos señales que se contradicen (hay que elegir)
1. **Decisión 14-oct (Bonsai, aprobada con color):** «quiero que se vea así en cada sección», baldosas de color, botón con degradado
   del logo, «nunca más una versión sobria de marca sin color». Vive en `components/dashboard/vivo.tsx`, tras `PANEL_NUEVO`.
2. **Encargo de hoy (Shopify):** sin degradados, sin dashboard genérico de IA, «software europeo premium», control, claridad, sobriedad.
   Y `brand/ui-rules.md`: marca baja a 20–30 % en tablas/formularios/pagos; degradado solo en logo y progreso.

No son incompatibles del todo (el shell no lleva color de baldosa), pero **el shell sí decide el tono de todo lo demás**. Propongo que el
shell siga la 2.ª y que `vivo.tsx` se quede dentro del *contenido* de Resumen e Informes (cifras e iconos), sin degradado en controles.
Esto deroga en parte «aplicarlo a TODAS las secciones»: requiere tu OK explícito.

## 3. Shell propuesto: «marco + lienzo»
Tokens de `brand/design-tokens.json`, sin valores nuevos.

```
┌────────────────────────────────────────────────────────────┐
│ ▐ Ink 950 (surface-nav)                                    │
│ ▐ logo · sede ▾        [  ⌕  Buscar o hacer…   ⌘K  ]   ◔ ●  │  ← topbar integrada en el marco, h 56
│ ▐ ─────────────────────────────────────────────────────── │
│ ▐ Resumen   ┌──────────────────────────────────────────┐   │
│ ▐ Clases    │  Cream (surface-canvas), radio 16 (lg)   │   │
│ ▐ ▸ Clientas│  título · breadcrumb · acciones          │   │
│ ▐ Cobros    │  contenido, max 1320                     │   │
│ ▐ ⚙ Config  └──────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

| # | Cambio | Razón / token | Riesgo |
|---|---|---|---|
| S1 | Sidebar **a sangre** (sin flotar), `surface-nav`; el **logo entra en el marco**; topbar al mismo fondo oscuro | Gana altura, el marco enseña la marca una vez; quita `top-[104px]` | Medio: rompe offsets (`--panel-sticky-top`, `--panel-top`) que usan muchas pantallas |
| S2 | Contenido en **lienzo claro redondeado** (`radius-lg` 16, `surface-canvas`) dentro del marco | Es el patrón Shopify; el radio 28 se queda para el sidebar flotante **solo si se mantiene** (ver §4) | Medio |
| S3 | **Buscador en píldora neutra** (`surface-raised` sobre marco oscuro, texto `text-inverse`), centrado, `⌘K` en `label`; fuera `bg-brand` | Jerarquía: la marca del estudio deja de ser el control más ruidoso | Bajo |
| S4 | **Cabecera de página única** en el lienzo: título + breadcrumb en hijas + acciones; una acción primaria Ink por vista | Quita la doble cabecera | Alto: toca ~90 pantallas, por fases |
| S5 | Ítem activo = pastilla `surface-selected` (Ink 800) + barra fina; hijos con guía vertical en vez de `pl-14` | Legibilidad de la jerarquía | Bajo |
| S6 | **Esqueleto del marco entero** en el primer pintado | Brecha B8 | Bajo |
| S7 | **Configuración con columna propia** + «‹ Configuración» | Brecha B6 | Medio |
| S8 | **Avisos como popover** anclado (campana) sobre la bandeja única | Brecha B7 | Bajo |
| S9 | Móvil: barra inferior con etiquetas ≥ 13 px o 4 pestañas + «Más»; cierra OPEN DECISION 14 | `ui-rules` accesibilidad | Medio |
| S10 | Sustituir hex del sidebar por tokens; sube el trinquete | `brand-tokens.test.ts` | Bajo |

## 4. Choques con decisiones registradas
- **OPEN DECISION 18** (alto del ítem 36 vs 40 y «Configuración» bajo el pliegue): S1 la reabre; mantener ~36 y `sticky`.
- **`brand/design-tokens.json`: `radius.3xl` 28 «Sidebar flotante»** es un token aprobado. S1/S2 lo dejan sin uso en el shell:
  decidir si se mantiene el sidebar flotante (variante conservadora: solo S3–S10) o se retira el token.
- **Marca blanca (regla 10 de `ui-rules`)**: el marco oscuro es de TENTARE, no del estudio; `--brand` queda para acentos. Ya era así con Sand/Ink.
- **Tenti**: solo donde fija `donde-vive-tenti.test.ts`; el shell no añade sitios.
- **Botón de ayuda único (11-nov)**: no se añade un asistente flotante nuevo.
- **No bloquear a la propietaria**: aviso de prueba sigue siendo píldora, no overlay.

## 5. Cómo implementarlo sin romper el panel
1. Interruptor propio **`SHELL_NUEVO`** (patrón de `PANEL_NUEVO`: `estudios:<id>`), primero SOLO el estudio de prueba del fundador. Con él apagado, ni un píxel.
2. Orden: S10 → S3 → S6 → S5 (sin tocar layout) → **S1+S2** (la pieza arriesgada, con capturas antes/después en 375 / 1024 / 1440, claro y oscuro)
   → S7/S8 → S4 por pantallas → S9.
3. Cada paso: `e2e/panel-nuevo-secciones.spec.ts`, `e2e/menu-configuracion-visible.spec.ts`, `e2e/configuracion-contraste.spec.ts`, `tsc`, y verlo en navegador (criterio 14-oct: «nada está terminado hasta verlo»).
4. Un solo PR por tanda (cuota de Vercel): S10+S3+S6+S5 en el primero.
5. Entorno: `node_modules` compartido sin Capacitor — ver nota de `next dev`; no `npm install` en dev/o.

## 6. Decisiones que necesito del fundador
1. ¿Se aprueba que el shell siga la línea sobria (§2) y `vivo.tsx` quede solo dentro del contenido?
2. ¿Sidebar **a sangre** (S1, cambio grande) o **flotante conservador** (solo S3–S10)?
3. ¿Estudio de prueba para `SHELL_NUEVO`: el mismo `NuevoTentare`?

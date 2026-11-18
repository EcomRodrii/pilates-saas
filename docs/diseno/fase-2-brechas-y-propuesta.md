# Fase 2 — Shopify vs. Brand OS de Tentare: brechas y propuesta (18-nov-2026)

Entrada: `docs/diseno/benchmark-shopify-fase-1.md` + `brand/` (Brand OS, tokens, `ui-rules.md`, plan de 17 fases).
Esto es una **propuesta**, no cambios de código. Lo visual manda `brand/`: lo que no esté definido allí es
OPEN DECISION (`brand/implementation-plan.md` §D), no se improvisa.

## 1. Hallazgo principal
Tentare **ya tiene** un sistema de diseño ratificado y más estricto que el de Polaris en lo que importa
(tokens semánticos, brand slot de marca blanca, jerarquía de marca por superficie, línea de horario como dato).
Un «rediseño integral» desde cero lo pisaría y reabriría decisiones cerradas. La vía honesta es:
**tomar de Shopify solo las brechas de *patrón de interacción* y de *estructura*, expresadas con los tokens de `brand/`**,
y ejecutarlas dentro de las fases 3–17 que ya existen.

## 2. Qué ya cubre Tentare (no tocar)
| Principio observado en Shopify | Equivalente ya decidido en Tentare |
|---|---|
| Marco oscuro + lienzo claro | `--surface-nav` Ink 950 + `--surface-canvas` Cream; sidebar flotante radio 28 |
| Sombras apiladas muy suaves | `shadow.card/dropdown/floating/modal/nav` (ya suaves) |
| Botón principal sin color de marca | `brand-strong` = Ink sobre Cream; magenta solo CTA de alta y «ahora» |
| Pastilla activa en el menú | Píldora (tallo) para ítems de menú |
| Skeleton en carga | `Skeleton` (fase 6) |
| Toasts en glass | `glass.dark` para toasts (regla 9) |
| Una sola cifra protagonista | Hero metric (`metric`, una por card) |
| Motion corto sin rebotes | `motion.duration` 160/240/400, sin springs |

## 3. Brechas reales (Shopify lo hace y Tentare no lo tiene definido)
Ordenadas por valor/coste. «Fase» = dónde cabe en el plan de 17.

| # | Brecha | Qué propone Shopify | Propuesta Tentare | Fase | Estado |
|---|---|---|---|---|---|
| B1 | **Vacíos con intención** | 3 tipos: sin datos (ilustración + 1 CTA primario + 1 secundario), vacío por filtro («edita el segmento»), vacío bloqueado (explica el motivo) | Componente `EmptyState` con 3 variantes. Ilustración propia; **Tenti nunca en dinero**. Línea de horario punteada para agenda (ya en `ui-rules` 2.3) | 6 | Definido a medias (`Empty State` listado, sin variantes) |
| B2 | **Formulario de página de dos columnas** | Principal ancha + lateral estrecha («qué es» a un lado) + breadcrumb + divulgación progresiva (`+ SKU`) | Plantilla `FormPage`; opcionales como píldora `+ Añadir…`; unidad pegada dentro del input (`€`, `min`) | 5–6 | No definido |
| B3 | **Barra de guardado contextual** | Aparece arriba solo con cambios sin guardar, con «Descartar» | Ya existe `glass.solid` «Barras de guardar»: definir comportamiento (aparece al editar, aviso al salir) | 6 | Token sí, comportamiento no |
| B4 | **Búsqueda global ⌘K con filtros por tipo** | Diálogo con píldoras de tipo, vacío guiado, «Abrir ↵» | `⌘K` ya existe: añadir píldoras (Clientas, Clases, Cobros, Ayuda) y pista de teclado | 4 | Parcial |
| B5 | **Comando en lenguaje natural sobre listas** | «Describe tu segmento» sobre el buscador de clientes | Candidato fuerte para Clientas (segmentos) vía asistente existente. **Producto decide**, no diseño | 9 | Idea; requiere `tentare-producto` |
| B6 | **Navegación de Configuración propia** | Al entrar, el sidebar pasa a columna de ajustes con «‹ Configuración» y su buscador | Configuración ya es muy grande: columna propia con buscador de ajustes | 4 | No definido |
| B7 | **Alertas como popover anclado** | Campana → popover con filtro y «Marcar todas como leídas» | Centro de avisos como popover, no pantalla; reutiliza la bandeja única (`estado-estudio`) sin crear una segunda cifra | 4 | No definido |
| B8 | **Esqueleto del marco entero en carga** | Sidebar + lienzo esqueleto antes del contenido | Esqueleto del shell en el primer pintado del panel | 3 | No definido |
| B9 | **Móvil con acciones flotantes** | Sidebar → 2 botones flotantes (menú + asistente) | OPEN DECISION 14 ya cubre la barra inferior móvil; esta es una alternativa a evaluar, no a imponer | 4 | OPEN DECISION existente |
| B10 | **Tarjetas «siguiente paso» descartables** | Una acción por tarjeta con `×` | Encaja con el onboarding/activación ya diseñado (21-oct); no duplicar | 8 | Ya cubierto por onboarding |
| B11 | **Modal ancho 50/50 para decisiones de dinero** | Oferta izquierda, pago derecha | Solo para alta/suscripción de Tentare. Precio y renovación en el titular | 10 | Decidir con `tentare-stripe` |

## 4. Lo que NO se importa (y por qué)
- **Inter 13 px, botón negro sin más, radios Polaris**: chocan con Schibsted + DM Mono, Ink/Cream y la escala de radios aprobada.
- **Marco oscuro con lienzo flotante a pantalla completa**: Tentare ya tiene sidebar flotante radio 28; cambiar la composición del shell es decisión de la fase 3, con capturas antes/después.
- **Asistente como píldora flotante permanente sobre el contenido**: en Tentare ya existe el botón de ayuda único (11-nov, decisión del fundador). No añadir un segundo elemento flotante.
- **Reescribir páginas comerciales**: el copy público se propone, no se cambia. «Todo tu estudio. Bajo control.» es propuesta, no cambio hecho.
- **Degradados**: solo los 3 sitios decididos (logo, progreso/tiempo, destacados).

## 5. Qué no hace esta propuesta y dónde se decide
- **Fases 1, 2, 4 y 5 del plan están hechas «en lo que no toca `--brand` ni el foco»**; el resto aguarda. No se reordenan.
- **OPEN DECISION 13 (anillo de foco 2,86:1)** y **15 (toggle apagado 1,69:1)** son accesibilidad abierta; cualquier componente nuevo (B2, B4) debe resolverlas o heredar el riesgo.
- **Pruebas**: cada fase cierra con capturas antes/después, e2e de contraste y checklist (plan §B). Sin ellas no se da por hecha.

## 6. Orden recomendado de ejecución
1. **B1 + B8** (vacíos con variantes y esqueleto del shell): visibles, bajo riesgo, sin tocar dinero ni permisos.
2. **B4 + B7** (⌘K con píldoras y popover de avisos): una cifra de avisos, la bandeja única.
3. **B2 + B3** (plantilla de formulario y barra de guardado) aplicadas primero a UNA pantalla piloto (propuesta: «Crear clase» o «Alta de clienta»), con capturas.
4. **B6** (navegación de Configuración) tras medir cuánto se navega por ajustes.
5. B5, B9, B11 solo si producto/Stripe lo piden.

## 7. Pendiente de decidir (del fundador)
1. ¿Se parte del Brand OS existente (propuesta) o se quiere reabrir el shell completo (fase 3)?
2. ¿Pantalla piloto para B2/B3?
3. ¿B5 (segmentos en lenguaje natural) se explora como producto?

# Tentare — SEO + AI Search Masterplan

Fecha: 2026-08-13. Fase de auditoría/investigación/estrategia únicamente —
**cero cambios de código, metadata, URLs, schema, sitemap o contenido** se han
hecho para producir este documento. Todo lo afirmado sobre el producto o el
repositorio está verificado leyendo el código o producción; todo lo afirmado
sobre competidores o mercado cita su fuente o se marca UNKNOWN. Ningún resultado
se promete — el objetivo es construir las condiciones para competir, no un
número de tráfico.

**Documentos que acompañan a este**: `SEO-URL-INVENTORY.md`,
`SEO-KEYWORD-URL-MAP.md`, `SEO-COMPETITOR-ANALYSIS.md`,
`SEO-AI-SEARCH-QUERIES.md`. Este documento sintetiza los cuatro y añade las
secciones que ninguno cubre (AI search, autoridad externa, reviews, scorecard,
priorización, roadmap).

**Documento previo que ya ejecutó buena parte del trabajo de arquitectura**:
`docs/SEO-ARQUITECTURA-PLAN.md` (2026-08-11, 4 lotes, 17 URLs nuevas publicadas,
P0-P2 de esa fase cerrados). Este masterplan no repite ese trabajo — lo da por
hecho y construye encima.

---

## 1. Executive Summary

Tentare no parte de cero. Una sesión previa ya diseñó y ejecutó una arquitectura
SEO completa: **40 páginas públicas** registradas en una única fuente de verdad
(`lib/seo/paginas.ts`) con test de no-regresión, cubriendo home, precios, 15
páginas de funcionalidad, 7 comparativas 1-a-1, 7 guías, glosario, seguridad y
legales. Técnicamente el sitio está limpio: sitemap y robots derivados del mismo
registro, sin fragmentos duplicados, canonical correcto, JSON-LD amplio
(`Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`, `BreadcrumbList`,
`DefinedTermSet`), sin `aggregateRating` inventado.

Lo que este masterplan añade, porque no estaba en el alcance de esa sesión: (1)
**detección de deuda real** — 7 páginas de comparativa están vivas pero son thin
content sin un solo enlace interno en el cuerpo, y 12 de 40 páginas tienen
metadata que ya divergió de su "fuente única"; (2) **estrategia de AI search**,
inexistente hasta ahora; (3) **autoridad externa** — cero presencia en G2,
Capterra o Product Hunt, mientras los 7 competidores tienen al menos una; (4)
**contenido original — descartado**: la fuente que iba a ser el activo de
mayor valor (conversaciones con ~49 propietarias de estudios) resultó ser
grabaciones hechas sin su permiso, así que no es usable para contenido público
sin volver a pedir consentimiento explícito primero (ver §15); (5) un
**scorecard, priorización y roadmap 30/60/90** que no existían.

La tesis central no cambia respecto al plan previo: el foso de Tentare no es
volumen de contenido (Lorari tiene 67 artículos, bsport ~80) sino **especificidad
verificable** — sustituciones automáticas de instructoras, Veri\*Factu con firma
AEAT real, SEPA 19.14, planes por tipo de clase, ficha de salud operativa. Ningún
competidor de los 7 replica ese conjunto. La estrategia es hacer esa
especificidad legible por humanos, por Google y por LLMs — no fabricar volumen.

---

## 2. Current State

- **40 páginas públicas indexables**, todas en sitemap y robots de producción,
  verificadas en vivo (ver `SEO-URL-INVENTORY.md §1, §5`).
- **P0-P2 del plan de arquitectura previo, cerrados**: 17 URLs nuevas
  publicadas en 4 lotes entre julio y agosto 2026, con test de regresión,
  auditoría de HTML servido, 0 páginas huérfanas a nivel de registro, 2380 tests
  en verde.
- **Sin presencia externa medible**: 0 en G2/Capterra/Product Hunt, 0 en las
  muestras de SERP probadas para 9 queries comerciales, indexación real en
  Google no verificable en este entorno (sin Search Console).
- **Sin árbol en inglés** — decisión ya tomada y correcta dado el ICP actual
  (EUR, Veri\*Factu, SEPA, soporte y panel en español).
- **Sin contenido original propio** — las 7 guías citan fuentes de terceros
  (Statista, Eversports, NEJM, NCBI), nada de datos propios de Tentare.

## 3. URL Inventory Summary

Ver `SEO-URL-INVENTORY.md` completo. Resumen: 40 páginas registradas (16
grupo funcionalidades, 8 comparativa, 8 recursos, 4 legal, home, precios,
seguridad, glosario), + 1 registro de prefijos no-indexables que cubre
correctamente ~30 rutas de panel + rutas de un solo uso. No se encontraron
páginas indexables sin registrar (el test de regresión lo garantiza) ni
páginas registradas sin `page.tsx` real.

## 4. Technical SEO Audit

Ya en buen estado (heredado del plan previo, re-verificado en producción):
sitemap plano derivado del registro, robots.txt correcto y sincronizado,
canonical con host fijo (`www.tentare.app`), sin hreflang (correcto — mono-
idioma por diseño), `noindex` correcto en `/reservar/[slug]` y
`/portal-preview/*`, alt text descriptivo en imágenes hero de funcionalidades.

**Hallazgos nuevos de esta auditoría** (no en el plan previo):
- 16 de 40 páginas hardcodean su metadata en vez de importarla del registro
  "único"; 12 de esas 16 ya han divergido en texto real (home, las 7
  comparativas, seguridad, las 4 legales). Ver `SEO-URL-INVENTORY.md §4` para
  la lista exacta. No es un problema de indexación — cada título/descripción
  sigue siendo único y válido — es un problema de mantenibilidad silenciosa.
- Homepage meta description y JSON-LD no verificables con las herramientas de
  esta fase (limitación de la herramienta de fetch, no evidencia de ausencia).
- `site:tentare.app` en Google no verificado — se necesita Search Console.

## 5. Keyword Research

Ver `SEO-AI-MASTERPLAN` §14 (AI query set) y el documento completo
`SEO-KEYWORD-URL-MAP.md` para las tablas por categoría (core commercial,
comparison, problem/educational, feature-level, local/Spain). Sin acceso a
herramienta de volumen real — todo volumen es juicio direccional, marcado
explícitamente. Hallazgo relevante: en español, "software" / "programa" /
"app" / "sistema" fragmentan búsquedas reales distintas (confirmado porque
competidores distintos targetean cada variante) — no colapsar en un solo
término al escribir.

## 6. Keyword → URL Mapping

Ver `SEO-KEYWORD-URL-MAP.md` completo. Resumen de acciones: 24 KEEP, 9
OPTIMIZE (mayormente las comparativas), 3 CONSOLIDATE, 2 CREATE condicionales
de baja prioridad, 6 NO TARGET, 0 REDIRECT.

## 7. Search Intent

Distribución observada en el mapa de keywords: la arquitectura actual cubre
bien **Commercial Investigation** y **Comparison** (home, funcionalidades,
comparativas) y razonablemente **Problem-aware/Solution-aware** (7 guías). Está
más débil en **Informational puro de fondo de embudo alto** (p.ej. "cómo montar
un estudio de pilates") — deliberadamente, porque ese tráfico convierte peor y
no es prioridad mientras el árbol comercial no esté maduro.

## 8. Cannibalization

**Ya resuelta para los 4 pares reales** identificados en el plan previo
(sustituciones↔cubrir-baja-instructora, facturación↔Verifactu,
informes↔ocupación-valle, cancelaciones↔reducir-cancelaciones) con solape de
H2 medido en 25-29%, dentro de tolerancia y solo en encabezados estructurales.

**Hallazgo nuevo**: el hub `/comparativa` compara en su propia tabla solo contra
3 de los 7 competidores enlazados (bsport, Mindbody, Eversports) — Momence,
TIMP, Lorari y Bonsai quedan fuera de la tabla del hub y solo aparecen como
enlace. No es cannibalization en sentido estricto, pero es una inconsistencia
de cobertura dentro de la misma página que vale la pena corregir cuando se
optimicen las comparativas (Fase P0, ver §28).

## 9. Topical Authority

Mapa temático construido desde el producto real (no copiado de una plantilla
genérica), cruzando `SEO-ARQUITECTURA-PLAN.md §1` (funcionalidades verificadas)
con las categorías de keyword de `SEO-KEYWORD-URL-MAP.md`:

```
TENTARE — SOFTWARE PARA ESTUDIOS DE PILATES (España)
├── Reservas y ocupación
│   ├── reservas online, reglas por tipo de clase        → /funcionalidades/reservas-online
│   ├── lista de espera con plazo de aceptación           → /funcionalidades/lista-de-espera
│   ├── calendario, salas, aforo por reformer             → /funcionalidades/calendario-y-salas
│   └── cancelaciones, no-shows, penalización             → /funcionalidades/cancelaciones-y-politicas
├── Equipo
│   ├── disponibilidad, tarifas, liquidaciones            → /funcionalidades/gestion-de-instructoras
│   ├── sustituciones automáticas (foso real)             → /funcionalidades/sustituciones
│   └── control de asistencia y riesgo de plantón         → /funcionalidades/control-de-asistencia
├── Dinero
│   ├── bonos, cuotas, plazas fijas                       → /funcionalidades/bonos-y-membresias
│   ├── cobro recurrente, SEPA, impagos                   → /funcionalidades/cobros-recurrentes
│   └── facturación Veri*Factu (foso español)              → /funcionalidades/facturacion
├── Alumnas
│   ├── ficha/CRM + ficha de salud operativa               → /funcionalidades/ficha-de-clienta
│   ├── app de marca instalable (PWA)                      → /funcionalidades/app-para-alumnas
│   └── automatizaciones y avisos multicanal                → /funcionalidades/automatizaciones-y-avisos
├── Decisión
│   └── informes, margen por clase, Decision OS             → /funcionalidades/informes-y-rentabilidad
├── Escala
│   └── varias sedes / cadena                                → /funcionalidades/multi-centro
├── Elección de proveedor
│   ├── vs. 7 competidores concretos                        → /comparativa/*
│   └── glosario neutral del sector                          → /glosario
└── Cumplimiento y confianza
    ├── Veri*Factu explicado                                 → /recursos/facturacion-electronica-verifactu
    └── datos, RGPD, aislamiento por estudio                 → /seguridad
```

Cada rama tiene ya al menos una página real y verificada — no hay ramas
puramente aspiracionales en este mapa (a diferencia de la estructura de
ejemplo del encargo, que no se copió sin contrastar).

## 10. Commercial Architecture

Ver `SEO-ARQUITECTURA-PLAN.md §3-4` para el razonamiento completo de por qué
`/funcionalidades/<slug>` en vez de slugs planos, y por qué no existe
`/software-para-estudio-de-pilates` (canibalizaría la home). No reabrir esas
decisiones sin releer ese documento.

## 11. Competitor Analysis

Ver `SEO-COMPETITOR-ANALYSIS.md` completo. Resumen: Lorari y Bonsai son el
benchmark de contenido de comparación a batir (no los 4 grandes anglosajones);
Eversports tiene la mejor señal de reseña (4.8★/132 en Capterra); ninguno de
los 7 replica el motor de sustituciones de Tentare; un tercer grupo de
competidores locales (ViDay, DeporWeb, Sammy, AgendaPro, SyncroFitness) gana
hoy la búsqueda genérica española que ninguno de los 7 confirmados gana.

## 12. Keyword Gaps

- **"software gestión estudio pilates" genérico en español**: lo gana un tercer
  grupo de jugadores locales, no los 7 competidores con página de comparativa.
  La arquitectura actual (home + hub funcionalidades) debería competir aquí,
  pero no hay evidencia todavía de que lo esté haciendo (sin datos de
  ranking real).
- **VeriFactu/facturación electrónica**: cluster en alza hacia 2027, ya
  atacado agresivamente por TIMP y Virtuagym. Tentare tiene la página de
  producto y la guía — ambas necesitan revisión antes del pico de búsqueda,
  no después.
- Ver `SEO-KEYWORD-URL-MAP.md §F` para el cluster nuevo de preguntas
  AI-answerable, sin cubrir explícitamente hoy con formato de respuesta directa.

## 13. Content Gaps

1. **Contenido original de propietarias reales de estudios** — sigue siendo un
   gap real y de alto valor, pero la fuente que existía (49 llamadas grabadas
   sin permiso) no es utilizable (§15). Si se quiere cerrar este gap, requiere
   una recogida de datos nueva, con consentimiento desde el inicio — no es una
   tarea de contenido, es un proyecto de investigación propio, fuera de
   alcance de esta fase.
2. **Reseñas verificables** (G2/Capterra) — ver §17.
3. **Glosario pequeño** — 9 términos, con margen real de crecer sin diluir el
   tono (cada uno de los 15 conceptos de `/funcionalidades/*` podría generar
   un término propio: "aforo por reformer", "escalado de sustitución",
   "penalización por no-show", "plaza fija", etc.) — ver §22.
4. Las 7 comparativas están vivas pero delgadas — no es un gap de "falta
   página", es un gap de profundidad en páginas que ya existen (ver §14).

## 14. Comparison Strategy

Las 7 páginas `/comparativa/tentare-vs-*` **no se duplican, se optimizan**
(regla del encargo: nunca crear cuando ya existe la página adecuada). Estado
actual: 387-418 palabras, cero enlaces internos en el cuerpo, solo una tabla
✓/✗/≈ y 1-2 tarjetas de honestidad. Comparar con el patrón que sí funciona en
el mercado: Momence y Mindbody se enfrentan directamente en el mismo SERP con
sus propias páginas "vs", y Lorari/Bonsai construyen contenido de comparación
sustancialmente más largo.

Regla de honestidad ya presente en el sitio y que debe mantenerse: precios,
features y limitaciones de competidores solo si son verificables y con fuente
— nunca inventados. Los datos de `SEO-COMPETITOR-ANALYSIS.md` (pricing público
de cada uno, cuando existe) son el punto de partida verificado para actualizar
estas páginas cuando se implementen.

## 15. Original Data Strategy

**Descartado (2026-08-13) — no usable en su forma actual.** El founder
confirmó que las ~49 conversaciones con propietarias reales de estudios de
Pilates fueron **llamadas grabadas sin su permiso**. Esto cierra esta vía de
contenido tal como estaba planteada, no solo la retrasa:

- Grabar una llamada en la que se es parte puede ser lícito para uso privado
  en España, pero **publicar contenido derivado de ella (citas, estadísticas
  agregadas, incluso paráfrasis identificable) es un tratamiento nuevo de
  datos personales bajo RGPD que necesita su propia base legal** — la
  grabación sin avisar no la da.
- El universo de propietarias de estudios de Pilates en España es pequeño y
  concreto: una "cifra agregada anónima" de 49 llamadas sigue siendo
  potencialmente reidentificable dentro de ese sector, no es un anonimizado
  seguro por defecto.
- Si en alguna llamada se tocaron datos de salud de clientas de esos estudios
  (plausible, dado que el propio producto de Tentare trata ficha clínica),
  hay una capa adicional de dato sensible de un tercero que nunca fue parte
  de la conversación de consentimiento.

**No se recomienda ninguna vía de "anonimizar y publicar de todos modos".**
La única vía legítima hacia adelante sería **volver a contactar a esas
propietarias, informarles de que hubo una grabación, y pedir consentimiento
explícito y informado** para citarlas o usar datos derivados — con la opción
real de que digan que no. Alternativa más limpia: sustituir esta fuente por
una **encuesta o entrevista nueva, con consentimiento desde el inicio**,
dirigida a un número menor de estudios si hace falta. Ninguna de las dos
opciones se ejecuta en esta fase — quedan fuera de alcance de este masterplan
y no se ha construido contenido, esquema, ni plan de publicación que dependa
de las grabaciones existentes.

Esto elimina lo que era el candidato de mayor impacto de `SEO-CONTENT-STRATEGY`
(§23) y del top-10 P0/P1. El resto de la estrategia (comparativas, G2/Capterra,
glosario, VeriFactu) no depende de esta fuente y sigue en pie sin cambios.

## 16. AI Search Strategy

Prioridades, sin trucos: contenido rastreable y ya lo es (SSR confirmado en 6
páginas muestreadas); autoridad — el gap real está en cero presencia externa
(§17-18); claridad y respuesta directa — las páginas de funcionalidad tienen
buen contenido pero no siempre un párrafo de "respuesta en 2 frases" cerca del
H1, que es el formato que los AI Overviews citan más; entidades — el glosario
es el activo subexplotado más barato de ampliar; comparativas útiles — ya
existen, necesitan más cuerpo (§14); experiencia de primera mano — el gap de
§15 es exactamente esto.

Explícitamente fuera: keyword stuffing, texto oculto, schema falso
(`aggregateRating` sigue correctamente sin usar), reviews falsas, contenido
generado en masa, doorway pages, contenido duplicado, cifras inventadas
(volumen procesado por Stripe, número de estudios, etc. — el repo ya es
disciplinado en esto, mantenerlo). `llms.txt` **no se asume como requisito**
para AI Overviews — no hay evidencia de que Google lo use, y no se recomienda
como acción de esta fase.

## 17. Entity Strategy

Señales externas a construir, en orden de relevancia sobre volumen:

1. **G2 y Capterra** — Tentare es el único de los 8 (7 competidores + Tentare)
   sin presencia en ninguna de las dos. Crear el perfil es gratis y es la base
   para poder pedir reseñas reales después (§18). Sin esto, cualquier LLM que
   sintetice "mejores opciones" desde estas plataformas no puede citar a
   Tentare aunque el producto sea superior en un punto concreto.
2. **Directorios SaaS españoles del nicho** (los que usan AgendaPro/Sammy/TIMP
   — no identificados exhaustivamente en esta fase, requiere investigación de
   seguimiento).
3. **Product Hunt** — bajo esfuerzo, útil para un lanzamiento puntual, no
   para autoridad sostenida.
4. **Casos de estudio con estudios reales** — Tentare ya tiene datos sembrados
   de `studio-1` (ver memoria de proyecto) y clientas reales; un caso de
   estudio con permiso explícito de una propietaria real sería más fuerte que
   cualquier directorio.

No se recomienda comprar backlinks ni participar en redes de intercambio de
enlaces — irrelevante para el criterio de autoridad real que se pide.

## 18. Review Strategy

Cero reseñas reales hoy (§17). Estrategia:
- Crear perfiles en G2 y Capterra (acción operativa, no de contenido — el
  founder o quien gestione cuentas de producto debe hacerlo, fuera del
  alcance de "SEO de contenido" de este documento pero listado como
  dependencia P0).
- Pedir reseñas a clientas reales existentes **después** de un momento de
  valor claro (tras el primer cobro cobrado con éxito, tras una sustitución
  resuelta automáticamente) — nunca incentivadas de forma que incumpla las
  políticas de G2/Capterra (ambas prohíben incentivos condicionados al
  contenido de la reseña).
- No fabricar, no comprar, no autogenerar reseñas. `aggregateRating` en el
  JSON-LD del sitio permanece sin usar hasta que haya reseñas reales que
  agregar — la disciplina que el código ya tiene (TODO explícito) es correcta
  y debe mantenerse.

## 19. Internal Linking

Auditoría (`SEO-URL-INVENTORY.md §1`, columna "Internal links entrantes"):
- **Huérfanas de facto**: las 7 comparativas — solo reciben enlace del hub
  `/comparativa` y footer genérico, cero desde `/funcionalidades/*` o
  `/recursos/*`, y no tienen ningún enlace saliente en su propio cuerpo.
- **Footer inconsistente**: tres sistemas de navegación distintos conviven
  (landing `NAV_V5`/`PIE_V5`, páginas internas `SiteNav`/`SiteFooter`, legal
  con su propio layout) — ninguno cubre las 15 páginas de funcionalidad de
  forma completa desde el pie de página global.
- **3 guías de `/recursos` sin ningún enlace saliente** en el cuerpo
  (`checklist-elegir-software-estudio`, `reducir-cancelaciones-ultima-hora`,
  `estudios-pilates-de-exito`).

Diseño de clusters ya implementado y correcto en su forma (breadcrumbs de 3
niveles, bloque "relacionadas" por página) — el hueco es de **cobertura**, no
de arquitectura. Adaptación del patrón pedido en el encargo a lo que existe:

```
HOME
  ↓
FUNCIONALIDADES (hub) ←→ COMPARATIVA (hub) ←→ PRECIOS
  ↓                            ↓
15 páginas de función    7 comparativas 1-a-1   [huérfanas hoy]
  ↓                            ↓
RECURSOS (7 guías) ←──────────┘
  ↓
GLOSARIO
```

## 20. Structured Data

Ya amplio y correcto (§4). Sin acción P0. Único hueco real: las tablas de
comparación ✓/✗/≈ de las 7 páginas `/comparativa/tentare-vs-*` son HTML plano,
sin marcado `Table`/`ItemList` — bajo impacto, no se recomienda añadir schema
solo "porque ayuda" sin que represente contenido visible ampliado primero (si
se amplía el cuerpo de esas páginas en la Fase de implementación, entonces sí
vale la pena revisar si un `ItemList` de comparación aporta).

## 21. International SEO

Confirmado: quedarse en español, sin árbol `/en/`, es la decisión correcta
para esta fase — el ICP real de Tentare (EUR, Veri\*Factu, SEPA, soporte y
panel en español) no coincide con quien buscaría en inglés. Revisar esta
decisión sería un proyecto propio con `hreflang` real, no una traducción
automática — explícitamente fuera de alcance aquí, como ya documentaba
`SEO-ARQUITECTURA-PLAN.md §7 (R9)`.

## 22. Programmatic SEO

**NO RECOMENDADO**, con una única excepción parcial:

- Páginas por ciudad, por disciplina (más allá de lo ya evaluado para yoga),
  o cualquier variante mecánica de keyword → **NO RECOMENDADO**. Ya
  descartado en el plan previo como doorway.
- **Ampliar el glosario término a término** es la única forma de "programático"
  que se justifica aquí — pero no es realmente programático: cada término
  necesita una definición propia, verificada contra el código, sin plantilla
  de relleno. Se recomienda como contenido editorial incremental, no como
  generación masiva.

## 23. Content Strategy

Formato pedido: pillar → supporting → internal links → CTA comercial, no
calendario de volumen.

**Pillar existente**: `/funcionalidades` (hub) y `/comparativa` (hub) ya
cumplen ese rol. **Supporting pages existentes**: las 15 + 7 + 7 ya
publicadas. La estrategia de contenido de esta fase no es "escribir más
páginas" sino **profundizar las que ya existen y están delgadas** antes de
crear nuevas — ver tabla de priorización en §28.

| Pieza | Título tentativo | Keyword | Intent | URL destino | Formato | Objetivo | CTA | Enlaces internos | Evidencia necesaria | Prioridad |
|---|---|---|---|---|---|---|---|---|---|---|
| Ampliar 7 comparativas | (ya existen) | bsport vs tentare, etc. | Comparison | `/comparativa/tentare-vs-*` | Ampliar cuerpo + enlaces cruzados | Bottom-funnel, AI-citable | "Crear estudio" / "Ver precios" | funcionalidades relevantes, hub | Pricing/features verificados de `SEO-COMPETITOR-ANALYSIS.md` | **P0** |
| Estudio original propietarias reales | (pendiente de recogida de datos con consentimiento) | (branded, genera backlinks) | Informational, E-E-A-T | `/recursos/<nuevo>` (bloqueada) | Informe con datos, citable | Autoridad, backlinks, citas AI | Newsletter/demo | glosario, funcionalidades relacionadas | **Descartada la fuente existente (grabada sin permiso, §15); requiere investigación nueva con consentimiento** | P3 — no planificable hasta que exista una fuente de datos legítima |
| Ampliar glosario | (términos nuevos) | definiciones del sector | Informational, AI-answerable | `/glosario` | Términos cortos, `DefinedTermSet` | Citabilidad AI | — | funcionalidades | Ninguna — ya derivable del código | P1 |
| Refresco VeriFactu | (ya existe, actualizar) | VeriFactu 2027 | Informational | `/recursos/facturacion-electronica-verifactu` | Actualizar antes del pico regulatorio | Captar búsqueda en alza | `/funcionalidades/facturacion` | facturación | Fechas de mandato verificadas (2027) | P1 |

## 24. Conversión

Ruta ya bien formada en el sitio: página específica → `/funcionalidades/<x>` o
`/comparativa/<x>` → CTA "Crear estudio" (`/crear-estudio`, 14 días de prueba,
sin permanencia) → alta. No se detectó fricción de CTA en las páginas
muestreadas. Para las comparativas específicamente, el CTA debería reforzarse
con el mismo criterio de honestidad que ya usa el resto del sitio (nunca
prometer lo que la página de límites ya reconoce que no existe).

## 25. Performance

No medido en esta fase (regla del repo: no afirmar impacto sin medir, y no
hay acceso a Lighthouse/CWV de producción en este entorno). El plan previo ya
identificó el riesgo (`SEO-ARQUITECTURA-PLAN.md A12`: home es `'use client'`
completo) y mitigó construyendo las páginas nuevas como Server Components. No
se recomienda ninguna acción de performance sin medición previa real.

## 26. SEO Scorecard

Metodología: cada puntuación es una estimación cualitativa basada en la
evidencia de este masterplan, no un cálculo automatizado — se explica el
criterio de cada una para que sea auditable/discutible, no una cifra opaca.

| Dimensión | Puntuación | Por qué |
|---|---|---|
| Technical SEO | 85/100 | Sitemap/robots/canonical limpios y derivados de una fuente única, con test de regresión. Resta por: divergencia de metadata en 12 páginas, homepage/JSON-LD no verificado, sin Search Console conectado |
| Content | 65/100 | 40 páginas con contenido sustancial en su mayoría (funcionalidades 962-1471 palabras), pero 7 comparativas thin (387-418) y cero contenido original propio |
| Topical Authority | 70/100 | Mapa temático completo y verificado contra producto real (§9), pero glosario pequeño (9 términos) y sin el activo diferencial (§15) todavía publicado |
| Commercial Coverage | 80/100 | 15 páginas de funcionalidad cubren prácticamente todo el producto real; huecos menores en algún feature (p.ej. integraciones Kisi/Zoom/Google Calendar no tienen página propia, correctamente, por bajo volumen) |
| Comparison Coverage | 55/100 | Cobertura de competidores completa (7 de 7) pero profundidad muy débil — la nota más baja del scorecard es deliberada, refleja el hallazgo más accionable |
| Internal Linking | 60/100 | Arquitectura de breadcrumbs/relacionadas correcta donde existe, pero 7 páginas huérfanas de facto y navegación global inconsistente (3 sistemas distintos) |
| AI Search Readiness | 40/100 | Contenido rastreable y estructurado, pero sin estrategia de respuesta-directa explícita, sin presencia en fuentes que los LLMs citan (G2/Capterra), sin contenido original citable |
| External Authority | 15/100 | Cero en G2, Capterra, Product Hunt. Sin backlinks medidos (no verificable en esta fase, se asume bajo dado que el dominio no apareció en ningún SERP probado) |
| Conversion | 75/100 | CTA claro y consistente, pricing público y honesto (ventaja real sobre bsport que oculta precio), pero sin datos de conversión real medidos |
| **Overall** | **~60/100** | Media ponderada hacia abajo por Authority y AI Readiness, que son los dos ejes con más recorrido y menor coste de arranque |

## 27. Priorización

| Acción | Impacto | Esfuerzo | Riesgo | Dependencias | Prioridad |
|---|---|---|---|---|---|
| Ampliar cuerpo + enlaces internos de las 7 comparativas | Alto | Medio | Bajo | Ninguna | **P0** |
| Crear perfiles G2 + Capterra | Alto (AI/authority) | Bajo | Bajo | Acceso a cuentas de producto (operativo, no de contenido) | **P0** |
| Refrescar guía VeriFactu antes del pico 2027 | Medio-alto | Bajo | Bajo | Ninguna | **P0** |
| Sincronizar metadata hardcodeada con el registro (12 páginas) | Bajo (no afecta indexación) | Bajo | Bajo | Ninguna | P1 |
| Ampliar glosario (9 → objetivo ~20-25 términos) | Medio (AI readiness) | Medio | Bajo | Ninguna | P1 |
| Corregir tabla del hub `/comparativa` para incluir los 7 competidores, no solo 3 | Medio | Bajo | Bajo | Ninguna | P1 |
| Contenido original de propietarias reales | Alto (diferencial único) | Alto | **Alto si se usa la fuente existente (RGPD/privacidad, §15)** | Investigación nueva con consentimiento explícito, no las grabaciones actuales | P3, no viable con lo que hay hoy |
| Pedir reseñas reales a clientas existentes | Medio-alto | Medio (operativo) | Bajo | Perfiles G2/Capterra creados primero | P2 |
| `/soluciones/cambiar-de-software` | Medio | Alto | — | Ninguna | **Hecho (2026-08-13)** |
| `/sobre-tentare` (E-E-A-T) | Bajo-medio | Medio | Bajo | Ninguna | P2 |
| Árbol en inglés | — | Muy alto | Alto (ICP no coincide) | Decisión de negocio | P3, no recomendado por ahora |
| Páginas programáticas / por ciudad | — | — | Alto (doorway) | — | **No recomendado** |

## 28. P0 — alto impacto + necesario

1. Ampliar y enlazar internamente las 7 páginas `/comparativa/tentare-vs-*`.
2. Corregir la tabla del hub `/comparativa` para comparar contra los 7, no 3.
3. Crear perfiles G2 y Capterra (dependencia operativa, no de contenido).
4. Refrescar `/recursos/facturacion-electronica-verifactu` antes del pico
   regulatorio 2027, verificando fechas de mandato actuales.
5. ~~Confirmar datos de las 49 propietarias~~ — **descartado**: la fuente es
   una grabación sin consentimiento (§15), no usable. Si se quiere retomar
   contenido original de propietarias reales, es un proyecto de investigación
   nuevo con consentimiento desde el inicio, no una tarea de esta fase.

## 29. P1 — alto impacto

Sincronizar las 12 páginas con metadata divergente; ampliar el glosario;
revisar interlinking global (footer consistente entre los 3 sistemas de
navegación).

## 30. P2 — crecimiento

~~`/soluciones/cambiar-de-software`~~ — **hecho (2026-08-13)**: delimitada
frente a `/comparativa` por intención (esta habla del PROCESO de cambiarse —
qué se lleva, cómo funciona, qué no se lleva solo — no de features ni precio
frente a un competidor concreto, que sigue siendo terreno de `/comparativa`).
De paso se le puso interfaz al endpoint `/api/public/migracion-concierge`,
que ya existía desde antes sin ningún formulario que lo llamara. Quedan:
`/sobre-tentare`; pedir reseñas activas; 2-3 guías nuevas condicionadas a qué
tema resulta más buscado una vez haya datos reales de tráfico.

## 31. P3 — experimentos

Árbol en inglés (solo si cambia el ICP); páginas de disciplina adicional
(yoga) con contenido específico verificado, no buscar-y-reemplazar.

## 32. Roadmap 30/60/90 días

**0-30 días** (impacto estimado: MEDIUM, bajo esfuerzo)
- Crear perfiles G2 y Capterra.
- Aprobar o ajustar este masterplan.
- Empezar la ampliación de las 7 comparativas (contenido + interlinking).

**31-60 días** (impacto estimado: MEDIUM-HIGH)
- Publicar las 7 comparativas ampliadas.
- Corregir tabla del hub `/comparativa`.
- Refrescar guía VeriFactu.
- Ampliar glosario a ~20 términos.
- Sincronizar las 12 páginas con metadata divergente.

**61-90 días** (impacto estimado: MEDIUM)
- Empezar a pedir reseñas reales tras los primeros momentos de valor.
- Evaluar `/soluciones/cambiar-de-software` con delimitación de intención
  clara.

**90+ días**
- Revisar el scorecard con datos reales de Search Console/analítica (no
  disponibles en esta fase).
- Decidir sobre `/sobre-tentare`, disciplina yoga, y cualquier expansión de
  árbol condicionada a datos de tráfico real acumulados.

Ningún resultado de tráfico, posición o clientes se promete en ninguna fase.

## 33. Riesgos

Heredados y vigentes del plan previo (`SEO-ARQUITECTURA-PLAN.md §7`): thin
content detectable si se sigue una plantilla rígida al ampliar comparativas
(mitigación: cada página necesita al menos un bloque único, igual que ya se
hizo con las 15 funcionalidades); afirmaciones no verificables (mantener cero
cifras sin fuente); prometer módulos congelados o app nativa (vetos ya
documentados, siguen vigentes). **Riesgo confirmado y cerrado en esta fase**:
las 49 conversaciones con propietarias fueron grabadas sin su permiso — se
descarta esa fuente como base de contenido público (§15). No usar, no
anonimizar-y-publicar, no derivar estadísticas de ahí sin volver a pedir
consentimiento explícito primero.

## 34. Dependencies

- **Acceso a cuentas de producto** para crear perfiles G2/Capterra — operativo,
  no de contenido, pero es una dependencia real para empezar §17-18.
- **Search Console** — no disponible en este entorno, necesario para medir
  indexación real y cerrar el UNKNOWN de `SEO-URL-INVENTORY.md §5`.
- **Capturas reales del producto** — siguen sin existir (limitación ya
  documentada en `SEO-ARQUITECTURA-PLAN.md §11.5`); las páginas actuales usan
  diagramas derivados del código real en su lugar.

## 35. Information Needed From Founder

1. **Las 49 conversaciones quedan descartadas como fuente de contenido**
   (§15, confirmado 2026-08-13: fueron grabadas sin permiso de las
   entrevistadas). No hace falta compartir esos datos — no se van a usar. Si
   en el futuro se quiere retomar el ángulo de "voz real de propietarias",
   lo que hace falta no son esas grabaciones sino la decisión de montar una
   investigación nueva (encuesta/entrevistas) con consentimiento explícito
   desde el principio — un proyecto propio, no una tarea de contenido.
2. **Acceso o autorización para crear los perfiles de empresa en G2 y
   Capterra** (quién los gestiona, con qué cuenta de correo corporativo).
3. **Decisión de negocio sobre inglés** — si hay planes de expandir fuera de
   España en un horizonte de 12-24 meses, cambia la prioridad de §21; si no,
   se mantiene fuera de alcance sin revisar de nuevo.
4. **Cualquier captura de pantalla real del panel** (anonimizada) que se
   pueda compartir para sustituir los diagramas actuales — no bloqueante,
   pero mejora la credibilidad visual de las páginas de funcionalidad.

---

# RESUMEN EJECUTIVO (máx. 2 páginas)

Tentare ya tiene una arquitectura SEO sólida: 40 páginas indexables, fuente
única de verdad con test de no-regresión, técnica limpia (sitemap, robots,
canonical, JSON-LD amplio). Ese trabajo se hizo en una sesión previa y no hace
falta repetirlo. Lo que este masterplan encontró que falta no es "más
páginas" — es dos cosas concretas: (1) las 7 páginas de comparación
existentes están vivas pero delgadas y sin enlaces, y son probablemente las de
mayor intención comercial del sitio; (2) cero presencia externa verificable
(G2, Capterra, reseñas) en un mercado donde los 7 competidores tienen al menos
una señal. Una tercera vía que parecía prometedora — contenido original a
partir de 49 conversaciones con propietarias reales — se descartó al
confirmar que esas llamadas se grabaron sin su permiso: no es contenido
publicable sin volver a pedir consentimiento desde cero (§15).

## TOP 10 P0

1. Ampliar y enlazar internamente las 7 páginas `/comparativa/tentare-vs-*`.
2. Corregir la tabla del hub `/comparativa` para comparar contra los 7 (hoy
   solo 3).
3. Crear perfiles de empresa en G2 y Capterra.
4. Refrescar `/recursos/facturacion-electronica-verifactu` antes del pico
   regulatorio de 2027.
5. Verificar homepage meta description y JSON-LD directamente (curl/Search
   Console), no solo por herramienta de fetch.
6. Conectar Google Search Console para tener indexación real medida.
7. Sincronizar las metadata de las 12 páginas que divergen del registro
   (bajo impacto SEO, pero cierra deuda antes de que crezca).
8. No usar ni derivar contenido de las 49 llamadas grabadas sin permiso, bajo
   ninguna forma (ni anonimizada) — cerrado, ver §15.
9. Ampliar el glosario (9 → ~20-25 términos) como palanca barata de
   citabilidad AI mientras no hay contenido original nuevo.
10. No crear ninguna página nueva hasta cerrar los puntos 1-2 — el riesgo de
    diluir esfuerzo en contenido nuevo mientras el contenido bottom-funnel
    existente está desaprovechado es real.

## PÁGINAS EXISTENTES QUE DEBEMOS MEJORAR

Las 7 `/comparativa/tentare-vs-*` (contenido + interlinking), el hub
`/comparativa` (tabla incompleta), `/recursos/facturacion-electronica-verifactu`
(refresco regulatorio), `/glosario` (ampliar de 9 a ~20-25 términos), y las 12
páginas con metadata divergente del registro (`SEO-URL-INVENTORY.md §4`).

## PÁGINAS QUE DEBEMOS CONSOLIDAR

Ninguna — el trabajo de consolidación de keyword cannibalization ya se hizo en
la sesión previa (4 pares funcionalidad↔guía, con división de intención
declarada y solape de H2 medido). No se encontró ninguna duplicación nueva.

## PÁGINAS NUEVAS QUE REALMENTE FALTAN

Ninguna con urgencia P0. `/soluciones/cambiar-de-software` se publicó el
2026-08-13 (§30). Queda `/sobre-tentare`, candidata P2 sin fecha. Un informe
de contenido original con voz real de propietarias sigue siendo una idea con
potencial, pero no es una página "que falte" en este momento — depende de una
investigación nueva con consentimiento que todavía no existe (§15), así que
no se lista como pendiente de esta fase.

## TOP 20 KEYWORDS

| # | Keyword | Intent | URL actual | URL recomendada | Prioridad |
|---|---|---|---|---|---|
| 1 | software para estudios de pilates | Commercial Investigation | `/` | `/` | P0 |
| 2 | software gestión estudio pilates | Commercial Investigation | `/` | `/` | P0 |
| 3 | bsport vs tentare | Comparison | `/comparativa/tentare-vs-bsport` | misma (optimizar) | P0 |
| 4 | momence vs tentare | Comparison | `/comparativa/tentare-vs-momence` | misma (optimizar) | P0 |
| 5 | mejor software para pilates | Commercial Investigation | `/comparativa` | misma (optimizar tabla) | P0 |
| 6 | qué es VeriFactu | Informational | `/recursos/facturacion-electronica-verifactu` | misma (refrescar) | P0 |
| 7 | software de reservas para pilates | Commercial | `/funcionalidades/reservas-online` | misma | P0 |
| 8 | sustituciones de instructoras automáticas | Feature-specific | `/funcionalidades/sustituciones` | misma | P0 |
| 9 | precio software estudio pilates | Transactional | `/precios` | misma | P0 |
| 10 | lista de espera automática pilates | Feature | `/funcionalidades/lista-de-espera` | misma | P0 |
| 11 | alternativas a mindbody | Comparison | `/comparativa/tentare-vs-mindbody` | misma (optimizar) | P1 |
| 12 | CRM para estudios de pilates | Commercial Investigation | `/funcionalidades/ficha-de-clienta` | misma | P1 |
| 13 | cobro recurrente SEPA pilates | Feature | `/funcionalidades/cobros-recurrentes` | misma | P1 |
| 14 | app de marca para estudio pilates | Feature | `/funcionalidades/app-para-alumnas` | misma | P1 |
| 15 | cómo reducir cancelaciones pilates | Problem-aware | `/recursos/reducir-cancelaciones-ultima-hora` | misma | P1 |
| 16 | cómo subir ocupación clases valle | Problem-aware | `/recursos/ocupacion-clases-valle` | misma | P1 |
| 17 | software para cadena de centros pilates | Commercial | `/funcionalidades/multi-centro` | misma | P2 |
| 18 | cambiar de software de gestión gimnasio | Transactional | `/soluciones/cambiar-de-software` | misma (publicada 2026-08-13) | Hecho |
| 19 | qué software cumple VeriFactu | Commercial Investigation, AI-answerable | `/funcionalidades/facturacion` | misma | P0 |
| 20 | software para estudios de pilates españa | Commercial Investigation | `/`, `/funcionalidades/facturacion` | consolidar en ambas, no crear página nueva | P1 |

## TOP 10 COMPETITOR GAPS

1. Cero reseñas verificables (G2/Capterra) frente a las 7.
2. Las comparativas de Tentare son las más delgadas del set frente a
   Lorari/Bonsai/bsport.
3. El hub `/comparativa` no compara contra 4 de los 7 competidores en su
   tabla principal.
4. Sin marketplace de consumo (Eversports/Mindbody) — fuera de alcance de
   SEO, es decisión de producto.
5. Sin blog de volumen (Lorari 67, bsport ~80) — decisión consciente, no
   compensar con volumen sino con especificidad (§1).
6. Sin presencia de marca en el tercer grupo de competidores locales
   españoles que gana la búsqueda genérica hoy (ViDay, DeporWeb, Sammy,
   AgendaPro).
7. TIMP ya tiene una comparativa Verifactu 2026 publicada — Tentare necesita
   refrescar la suya antes, no después.
8. Ningún competidor de los 7 tiene sustituciones de instructoras
   integradas — ventaja real, subexplotada en contenido (solo 1 página a
   prioridad 1.0).
9. Precio público sin cotización oculta — ventaja real frente a bsport, ya
   comunicada mejor de lo que la mayoría de comparativas de competidores dan
   crédito.
10. Ninguno de los 7 tiene facturación Veri\*Factu con firma AEAT real — foso
    español genuino, actualmente subexplotado en contenido AI-answerable.

## TOP 10 AI SEARCH OPPORTUNITIES

1. Ampliar el glosario para cubrir más términos técnicos citables por LLMs.
2. Añadir un párrafo de "respuesta directa" cerca del H1 en cada página de
   funcionalidad (formato que los AI Overviews citan más).
3. Crear perfiles G2/Capterra — fuente que los LLMs citan al sintetizar
   "mejores opciones".
4. ~~Publicar el contenido original de las 49 propietarias~~ — descartado,
   fuente no consentida (§15). Sustituir por: si se hace investigación nueva
   con consentimiento en el futuro, esa sería la pieza de mayor citabilidad.
5. Reforzar contenido de VeriFactu antes del pico regulatorio de 2027 —
   pregunta AI-answerable de alto volumen esperado.
6. Ampliar comparativas con datos verificables citables ("¿cuál es la
   diferencia entre X e Y?" es un patrón de pregunta AI muy común).
7. Asegurar que `/funcionalidades/sustituciones` responde directamente a "qué
   software gestiona sustituciones automáticamente" — diferenciador único.
8. Verificar y, si falta, añadir JSON-LD `FAQPage` donde haya preguntas reales
   sin cubrir (algunas páginas ya lo tienen, confirmar cobertura completa).
9. Conectar Search Console para poder medir qué de esto realmente mueve la
   aguja, en vez de operar a ciegas.
10. Monitorizar el conjunto de 73 preguntas de `SEO-AI-SEARCH-QUERIES.md`
    manualmente cada mes contra ChatGPT/Perplexity/Gemini/Google AI Mode —
    no hay herramienta automatizada disponible en este entorno.

## INFORMACIÓN QUE NECESITAS DE MÍ

1. **Las 49 llamadas quedan fuera del plan** — no hace falta que las
   compartas, no se van a usar de ninguna forma por haberse grabado sin
   permiso. Si en el futuro quieres retomar la idea de "voz real de
   propietarias", lo que necesitaríamos discutir es montar una investigación
   nueva con consentimiento explícito desde el principio, no esos datos.
2. Acceso o autorización para crear los perfiles de empresa en G2 y Capterra.
3. Si hay planes de expandir fuera de España en 12-24 meses (afecta la
   decisión de mantener el inglés fuera de alcance).
4. Capturas reales del panel (anonimizadas), si están disponibles, para
   sustituir los diagramas actuales.

**Fin de la fase de auditoría. Esperando aprobación antes de implementar
cualquier cambio.**

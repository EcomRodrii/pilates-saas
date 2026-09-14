# SEO Audit — tentare.app

Fecha: 2026-09-10 · Herramienta: `claude-seo` v2.2.6 (`/seo audit`) · Tipo: SaaS de gestión para estudios de Pilates, con un componente de marketplace local (Tentare Network) añadido desde la última auditoría de este sitio.

**Alcance real de esta pasada**: 139 URLs en sitemap. Se auditaron a fondo ~35 páginas repartidas entre las 10 categorías; el resto se marca explícitamente UNKNOWN en vez de asumirse correcto. Sin credenciales de Google API (PageSpeed/CrUX/GSC/GA4) ni DataForSEO en este entorno — ninguna cifra de tráfico, posición real en buscador, o visibilidad en IA se ha medido; solo se reporta lo verificable directamente. Los 10 informes detallados por categoría están en `findings/*.md`.

---

## Executive Summary

### SEO Health Score: **67/100** (parcial — Imágenes no auditada esta pasada, ver nota)

| Categoría | Peso | Score | Base |
|---|---|---|---|
| Technical SEO | 22% | 78/100 | Base técnica sólida (HSTS, CSP, XFO, canonicals consistentes en la muestra, URLs limpias, SSR) lastrada por 1 bug crítico de canonical en otra página (ver On-Page) y la fragilidad del robots.txt |
| Content Quality | 23% | 62/100 | Varias páginas fuertes (E-E-A-T real, honestidad ante competidores) pero contenido delgado confirmado en 2-3 páginas y riesgo de plantilla sin verificar en 2 clusters grandes |
| On-Page SEO | 20% | 55/100 | El hallazgo más grave del audit vive aquí: contradicción de alcance geográfico en la home, más el bug de canonical |
| Schema/Datos estructurados | 10% | 78/100 | Limpio, honesto (cero ratings inventados), solo falta `ItemList` en el directorio |
| Rendimiento (CWV) | 10% | 60/100* | *Estimación parcial — LCP/INP/CLS reales sin medir (sin credenciales), solo TTFB. Un problema real y concreto encontrado |
| AI Search Readiness (GEO) | 10% | 70/100* | *Promedio de dimensiones medibles (~77) ajustado a la baja por 2 de 5 dimensiones desconocidas (multimodal, autoridad externa) |
| **Imágenes** | 5% | **No auditado** | Ningún subagente de imágenes se ejecutó esta pasada — excluido del cálculo, no se inventa una cifra. Ejecutar `/seo images tentare.app` como seguimiento |

*Score calculado repartiendo el 5% de Imágenes entre las 6 categorías restantes (no se infla el total omitiendo la categoría sin más).*

### Top 5 hallazgos críticos/altos

1. **🔴 CRÍTICO — La home dice "en Barcelona", el resto del sitio es nacional.** El `<title>`/H1/meta de la home dicen "Software de Gestión para Estudios de Pilates en Barcelona", mientras `/funcionalidades` (15 páginas), `/comparativa` (13 páginas) y el propio schema (`SoftwareApplication`, no `LocalBusiness`, sin dirección ni mapa) tratan el producto como nacional. Esto confunde en las dos direcciones: quien busca en Valencia/Madrid/Sevilla ve "en Barcelona" y duda del alcance; quien busca algo genuinamente local no encuentra las señales de confianza local (dirección, mapa, prueba social de la ciudad) que ese título promete. Confirmado independientemente por el agente SXO (severidad CRITICAL) y corroborado por los agentes de contenido y local. *(`findings/sxo.md` F1)*
2. **🔴 CRÍTICO — El canonical de la página de Barcelona del marketplace apunta a la home, no a sí misma.** `/network/instructoras/ciudad/barcelona` declara `<link rel="canonical" href="https://www.tentare.app">` en vez de su propia URL — esto puede suprimir la página por completo de los resultados para "instructoras pilates/yoga Barcelona", justo el tráfico que existe para captar. Las demás páginas de `/network` se autocanonicalizan correctamente; parece un bug de plantilla aislado a la ruta `ciudad/[slug]`. *(`findings/local.md`)*
3. **🟠 ALTO — Esa misma página está prácticamente vacía de contenido, y solo hay una ciudad.** 40 palabras extraídas, 1 instructora listada. Confirmado independientemente por 4 agentes (contenido, local, visual, SXO). Y la copia de la propia home ya nombra Madrid como próxima ciudad — el patrón de URL (`/network/instructoras/ciudad/<slug>`) está diseñado para escalar. **Antes de publicar Madrid**, conviene arreglar la plantilla de Barcelona y decidir un umbral mínimo de listados por ciudad — hacerlo con una página es mucho más barato que con diez. *(`findings/local.md`, `findings/content.md`, `findings/sxo.md` F2)*
4. **🟠 ALTO — `/network/instructoras` tarda 2,5-3,5x más en responder que el resto del sitio.** TTFB de ~450-640ms frente a ~185ms en home/comparativa — probablemente una consulta sin caché en el listado del directorio. Es el único hallazgo de rendimiento con datos reales medidos (LCP/INP/CLS reales no se pudieron medir sin credenciales de Google). *(`findings/performance.md`)*
5. **🟡 MEDIO, pero con mucho potencial — Sin activo propio para búsquedas amplias tipo "mejor software gestión pilates".** Esas búsquedas las dominan hoy listados de terceros (GetApp, Sammy, Fitune) y las 13 páginas de Tentare son todas 1-contra-1 (`tentare-vs-X`). Y en la búsqueda específica de Verifactu (una obligación legal real con fecha límite en 2026), dos competidores (TIMP, Viday) ya combinan la guía informativa con comparativa de proveedor en la misma página — Tentare tiene la guía pero no el ángulo comparativo. *(`findings/sxo.md` F3, F4)*

### Top 5 victorias rápidas (quick wins)

1. Arreglar el canonical de `/network/instructoras/ciudad/barcelona` — un cambio de una línea, impacto potencialmente grande (#2 arriba).
2. Decidir y ejecutar una de las dos salidas para el mismatch "en Barcelona" de la home — quitar la coletilla de ciudad es la opción de coste cero recomendada (#1 arriba).
3. Añadir `ItemList` schema a las páginas de listado/ciudad del marketplace — patrón correcto, sin inventar datos, bajo esfuerzo.
4. Dar a `/network` su propio H1 relevante al marketplace en vez de heredar el hero genérico del SaaS.
5. Poblar `lastmod` de forma real (o quitarlo) en las 37 URLs que hoy no lo llevan — barato, y evita que Google deje de fiarse del sitemap entero.

---

## Technical SEO

Ver `findings/technical.md` y `findings/sitemap.md` completos. Muestra auditada: 6 páginas a fondo (`/`, `/precios`, `/comparativa`, `/network`, `/ayuda`, `/network/instructoras`) + todo el sitemap.xml completo (139 URLs) para estructura/cobertura.

**Funciona bien**: HTTPS + HSTS (2 años), `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`, canonicals autoreferenciados y consistentes en `www`+`https` en las 6 páginas revisadas, viewport móvil presente, estructura de URL impecable en las 139 (sin barras finales, sin mayúsculas, sin parámetros, 100% `https://www.tentare.app`), sin cadenas de redirección, sin errores de consola, renderizado en servidor (no SPA) en todo lo muestreado, sitemap XML válido y bien formado.

**Hallazgos**:
- **Medio** — `robots.txt` tiene un `Disallow: /network/` general por debajo de 5 reglas `Allow:` más específicas. Hoy no bloquea nada (gana la regla más específica), pero es fráフgil: cualquier ruta nueva bajo `/network/` no cubierta por un `Allow` explícito caería bloqueada sin querer. Reestructurar a "denegar por defecto, permitir explícitamente las rutas públicas" en vez de la mezcla actual.
- **Medio** — 37 de 139 URLs (27%) sin `lastmod`, de forma inconsistente (algunos hermanos del mismo tipo de página sí lo llevan). Google puede dejar de fiarse del sitemap entero si detecta que `lastmod` no es fiable una parte significativa de las veces.
- **Bajo** — HSTS sin `includeSubDomains`/`preload`; sin `X-Content-Type-Options: nosniff`; 16 páginas de `/funcionalidades` comparten un timestamp idéntico al milisegundo (sello de despliegue, no de edición real).
- **Informativo** — Las 4 páginas `/reservar/<estudio>` (widgets públicos de reserva de clientas reales de Tentare) están indexadas sin excluir en robots.txt — no es necesariamente un error, pero merece confirmación de que es la postura de producto deseada, dado que este número crecerá con cada cliente nuevo.
- **Informativo** — `Access-Control-Allow-Origin: *` en la respuesta HTML de la home; probablemente un artefacto de configuración del CDN, no una vulnerabilidad de por sí, pero vale la pena que `tentare-seguridad` confirme que no se aplica también a respuestas de API autenticadas.

**No verificado en esta pasada**: canonicals/cabeceras/errores de consola en ~133 de las 139 URLs; validez de datos estructurados fuera de la home; adopción de IndexNow; comportamiento de redirección real de `http://`/no-`www`.

## Content Quality

Ver `findings/content.md` completo. Muestra: 8 páginas fetched a fondo, elegidas como representantes de sus respectivos clusters (con la extrapolación marcada explícitamente donde aplica).

**Funciona bien**: `/precios` con cifras exactas y falsables (nada de "planes flexibles" vago); `/recursos/estudios-pilates-de-exito` con fuentes externas citadas y fechadas, la página con mejor E-E-A-T de la muestra; `/comparativa/tentare-vs-bsport` inusualmente honesta (reconoce dónde gana bsport, fecha sus datos, renuncia a menosprecio de marca); `/funcionalidades/sustituciones` con escenarios operativos concretos y límites conocidos declarados explícitamente; `/glosario` neutral y bien enlazado; `/ayuda/empezar/crear-tu-cuenta` con autoría y fecha visibles.

**Hallazgos**:
- **Alto** — `/network/instructoras/ciudad/barcelona`: 40 palabras extraídas, prácticamente todo interfaz (nav, filtros), no contenido. Riesgo clásico de página fina/doorway, agravado porque es una plantilla diseñada para escalar por ciudad.
- **Medio** — `/soluciones/estudio-de-yoga`: 197 palabras, muy por debajo del mínimo razonable (~800) para una página de intención comercial, aunque el poco contenido que hay es honesto (declara qué no está construido aún en vez de inflar).
- **Medio** — `/comparativa/tentare-vs-bsport`: solo 214 palabras de prosa (el resto es tabla). **Extrapolación, no verificado**: si las otras 12 páginas de `/comparativa/*` siguen el mismo patrón, hay riesgo real de contenido casi duplicado a escala (mismo párrafo de descargo, misma estructura, solo cambia el nombre del competidor) — el texto que hay es de calidad, pero hay poco de él. Requiere verificar las 12 restantes antes de dar esto por bueno o por mal.
- **Medio, sin verificar** — El cluster de `/ayuda/*` (~60 artículos, solo 1 muestreado) parece bien dimensionado en el artículo revisado, pero no se ha confirmado que la profundidad escale con la complejidad del tema en el resto (facturación/Stripe, permisos, cancelaciones probablemente necesitan más que una guía de 3 pasos).

## On-Page SEO

Este es el epicentro de los dos hallazgos críticos del audit — ver el Executive Summary arriba para el detalle completo (#1 y #2), con evidencia completa en `findings/sxo.md` (F1) y `findings/local.md`. Adicionalmente: el H1 de `/network` es el hero genérico del SaaS ("Tu estudio, A OTRO NIVEL"), sin relación con el marketplace de instructoras que esa página en realidad es — diluye la señal temática justo donde más se necesita.

## Schema & Datos Estructurados

Ver `findings/schema.md` completo. Muestra: home, `/precios` (solo precios), `/funcionalidades` (hub+1), `/comparativa` (hub+1), `/glosario`, `/network/instructoras/judith-clemente-barcelona`.

**Funciona bien**: grafo JSON-LD rico y válido en la home (`SoftwareApplication`+`Offer`, `FAQPage`, `Organization`+`ContactPoint`, `WebSite`+`SearchAction`, `SiteNavigationElement`); **cero `aggregateRating`/`Review` inventados en todo el sitio** — la decisión correcta y honesta dada la ausencia de un corpus real de reseñas; precios en schema consistentes con lo visible; `/glosario` usa `DefinedTermSet`/`DefinedTerm` correctamente; el perfil de instructora usa `Person` real, sin credenciales inventadas, con dirección solo a nivel de ciudad (la decisión de privacidad correcta para una autónoma); `BreadcrumbList` presente y bien anidado en todo `/network`.

**Hallazgos**: falta `ItemList`/`CollectionPage` en las páginas de listado/ciudad del marketplace (Medio); `FAQPage` en la home ya no tiene beneficio en resultados de Google (Google retiró el rich result el 7 de mayo de 2026 para todos los sitios) — mantenerlo no hace daño, pero no invertir más en ampliarlo por ese motivo (Informativo, no recomendar quitarlo). **68% del sitio sin verificar** (`/recursos`, `/ayuda`, legales, 11 de 13 comparativas, 14 de 15 funcionalidades) — marcado UNKNOWN, no asumido correcto.

## Rendimiento (Core Web Vitals)

Ver `findings/performance.md` completo — **actualizado**: el primer intento de este agente se había dado por perdido (superó su límite de turnos dos veces) y se relanzó con alcance reducido para esa versión inicial del informe; pero el intento original en realidad siguió corriendo en segundo plano y terminó después, con un análisis bastante más completo (5 páginas en vez de 3, cabeceras de caché reales, conteo de fuentes, peso de JS) que sobrescribió la versión reducida. Esta sección refleja ya la versión completa.

**Limitación real de esta pasada**: sin credenciales de Google API (CrUX/PageSpeed) y con `unlighthouse`/Lighthouse fallando por restricciones del sandbox (memoria/Chrome), LCP/INP/CLS quedan **sin medir de verdad** en ninguna URL — no se han inventado cifras en ningún caso. Lo medido son TTFB reales (vía `curl`) y análisis estático de HTML/recursos (cabeceras de caché, prioridad de imágenes, peso de fuentes/JS).

**Funciona bien**: el candidato a LCP de la home es una `<img>` real y bien precargada (no el vídeo, que va más abajo con `preload="metadata"`); fuentes autoalojadas vía `next/font` con caché inmutable; cero scripts de terceros bloqueantes en las 5 páginas comprobadas; tamaño de DOM dentro de presupuesto en todas; imágenes con `width`/`height` explícitos donde importa (previene CLS).

**Hallazgos concretos** (con datos reales, no estimaciones):
- **Medio** — Los assets estáticos servidos directamente desde `public/` (vídeo del hero, pósters, piezas del logo) responden `cache-control: max-age=0, must-revalidate` — se revalidan en cada visita en vez de cachearse, a diferencia de `/_next/static/*` que sí es `immutable`. ~1,8 MB de vídeo revalidándose innecesariamente cada vez.
- **Medio** — La home precarga **17 ficheros `.woff2` de 9 familias tipográficas distintas** en el `<head>` — compite por el ancho de banda temprano que también necesita el LCP. Merece auditar cuáles hacen falta de verdad sobre el pliegue.
- **Bajo-Medio** — Patrón de arranque en frío confirmado con múltiples medidas: `/network/instructoras` pasa de ~1,96s (primera petición) a ~0,44-0,69s (peticiones repetidas); `/funcionalidades/sustituciones` de ~1,02s a ~0,12-0,33s. Una visitante que aterrice en frío en cualquiera de las dos vería ese primer golpe de ~1-2s de TTFB antes de que empiece a pintar nada — coherente con un cold start serverless o un cache-miss de borde en la ruta del listado del marketplace.
- **Bajo** — La `<img>` del hero no lleva `fetchPriority="high"` en el propio tag (solo el `<link rel="preload">` lo tiene) — impacto pequeño, arreglo barato.
- **Bajo** — Payload de JS de la home ~1,48 MB sin comprimir en 22 chunks propios, todos `async` (no bloquean), pero peso relevante para el tiempo de interacción — marcado como dato a vigilar, no como problema confirmado de INP.

## AI Search Readiness (GEO)

Ver `findings/geo.md` completo. **Importante**: esta categoría mide preparación estructural, no visibilidad real en ChatGPT/Perplexity/Google AI Overviews — eso no es medible con las herramientas disponibles en este entorno, y el informe lo deja explícito en vez de inventar un "AI visibility score".

**Funciona bien**: los rastreadores de IA (GPTBot, ClaudeBot, PerplexityBot, etc.) están permitidos por la regla general de robots.txt, sin bloqueos específicos; home renderizada en servidor con JSON-LD rico; `/glosario` cerca del formato ideal de cita (definiciones cortas, autocontenidas, neutrales); ausencia de `llms.txt`/RSL marcada correctamente como Baja/Informativa (Google Search los ignora, no es un requisito real).

**Hallazgos**: párrafos de respuesta directa más cortos que el rango óptimo de citación (134-167 palabras) o enterrados en tablas en vez de prosa extraíble; encabezados en su mayoría declarativos, no en forma de pregunta; **señales de marca fuera del sitio (YouTube, Reddit, Wikipedia, LinkedIn) sin verificar** — dado que YouTube es la señal individual con mayor correlación con citación de IA de todas las estudiadas, esto merece una comprobación de una hora antes de invertir más presupuesto en ajustes on-page.

## Backlinks

Ver `findings/backlinks.md` completo. Solo Common Crawl disponible (sin Moz/Bing configurados). **Resultado: tentare.app no aparece en el grafo de Common Crawl** — esperable para un dominio que abrió al público el 19 de agosto de 2026, no evidencia de cero enlaces reales, solo ausencia en este dataset gratuito concreto. Sin datos suficientes para un score numérico — se reporta así explícitamente en vez de forzar una cifra. Sin hallazgos negativos (nada tóxico, nada sospechoso) — solo un hueco de visibilidad a cubrir opcionalmente con Moz free tier o Bing Webmaster Tools.

## Visual / Móvil

Ver `findings/visual.md` completo. 10 capturas (desktop/laptop/tablet/mobile) en home, `/precios`, `/comparativa`, `/network/instructoras`.

**Funciona bien**: above-the-fold de la home en móvil correcto (H1+subhead+CTA+WhatsApp visibles sin scroll); jerarquía de precios en desktop clara con el plan del medio promocionado; la tabla de 14 columnas de `/comparativa` se adapta bien en móvil con un aviso explícito de "desliza"; filtros de `/network/instructoras` colapsan correctamente en móvil.

**Hallazgos**: la marca decorativa "T" de dos tonos en el hero se solapa con el subtítulo (y roza el CTA) en desktop/laptop/tablet — peor en 1366px — reduciendo el contraste del texto ahí (Medio); en `/precios` móvil ninguna de las tres tarjetas de precio es visible sin scroll (Bajo); `/network/instructoras` muestra "1 instructora" con una interfaz de filtros completa alrededor — no es un bug visual, pero desperdicia la inversión de diseño (ver también Content/Local).

---

## Metodología y limitaciones (léase antes de actuar sobre este informe)

- **Sin credenciales de Google API** (PageSpeed, CrUX, Search Console, GA4, Indexing API) en este entorno — cero datos reales de usuario, cero posición real en buscador, cero tráfico orgánico verificado en todo el informe.
- **Sin DataForSEO** — cero datos de SERP en vivo, cero verificación de menciones/citas en IA, cero volumen de palabra clave real.
- **WebSearch (usado por el agente SXO) es una foto fija de este momento, no un rank tracker** — "no apareció en esta captura" nunca significa "no posiciona", se marca UNKNOWN explícitamente en cada caso.
- **Categoría Imágenes no auditada** esta pasada (ningún subagente de imágenes se lanzó) — excluida del cálculo del Health Score en vez de rellenarse con una cifra inventada.
- **Cobertura parcial del sitio**: de 139 URLs, se comprobaron a fondo ~35 (25%). Los clusters grandes (13 comparativas, ~60 artículos de ayuda, futuras ciudades del marketplace) se muestrearon con 1-2 páginas cada uno y los hallazgos de esos clusters están marcados explícitamente como extrapolación, no verificación exhaustiva.
- Varios subagentes de este audit se quedaron sin turnos en su primer o segundo intento y tuvieron que relanzarse con alcance reducido — el contenido final es correcto y verificado, pero la cobertura de cada categoría es la que cada informe declara explícitamente, no más.

Ver `ACTION-PLAN.md` para el plan priorizado y `audit-data.json` para los datos estructurados de este informe.

# Plan de Acción — tentare.app

Derivado de `FULL-AUDIT-REPORT.md` y los 10 informes en `findings/`. Ordenado Critical → High → Medium → Low. Cada ítem cita su fuente para poder verificar el hallazgo original antes de actuar.

## 🔴 Critical — arreglar ya

| # | Acción | Por qué | Esfuerzo | Fuente |
|---|---|---|---|---|
| 1 | Fijar el canonical de `/network/instructoras/ciudad/barcelona` a su propia URL, no a la home | Puede suprimir la página entera de resultados para "instructoras pilates/yoga Barcelona" | Bajo (1 línea, probablemente un bug de plantilla) | `findings/local.md` |
| 2 | Decidir y ejecutar una salida para el mismatch "en Barcelona" de la home: **(recomendado)** quitar la coletilla de ciudad del `<title>`/H1/meta y dejar que `/network/instructoras/ciudad/barcelona` posea la intención local; o, si es una apuesta deliberada, construir de verdad las señales de página local (`LocalBusiness`, estudios de Barcelona nombrados, mapa) | Confunde en las dos direcciones: búsqueda nacional ve "Barcelona" y duda; búsqueda local no encuentra señales de confianza local reales | Bajo si se elige quitar la coletilla; Medio-Alto si se construye la página local de verdad | `findings/sxo.md` F1 |

## 🟠 High — próxima semana

| # | Acción | Por qué | Esfuerzo | Fuente |
|---|---|---|---|---|
| 3 | Antes de publicar la página de Madrid (o cualquier ciudad nueva): pasar el test de intercambio de doorway y la comprobación de 60%+ de contenido único contra la plantilla de Barcelona; decidir un umbral mínimo de listados por ciudad (p. ej. 5+) antes de indexar | La plantilla ya está diseñada para escalar (Madrid ya nombrado en la copia de la home) — arreglar la plantilla con 1 página es mucho más barato que con 10-30 | Medio | `findings/local.md`, `findings/sxo.md` F2 |
| 4 | Ampliar el contenido de `/network/instructoras/ciudad/barcelona` (hoy 40 palabras) o, si no hay suficiente inventario todavía, considerar no indexarla hasta tener 5+ instructoras | Confirmado por 4 agentes independientes como el punto más débil del sitio en profundidad de contenido | Medio (depende de crecimiento de oferta, no solo de copy) | `findings/content.md`, `findings/local.md`, `findings/sxo.md` F2 |
| 5 | Investigar el patrón de arranque en frío en `/network/instructoras` (~1,96s frío → ~0,44-0,69s caliente) y `/funcionalidades/sustituciones` (~1,02s → ~0,12-0,33s) — probablemente cold start serverless o cache-miss de borde en la consulta del listado | Medido con múltiples peticiones reales; una visitante que aterrice en frío ve ~1-2s de TTFB antes de que empiece a pintar nada | Medio | `findings/performance.md` |
| 5b | Servir los assets estáticos de `public/` (vídeo del hero, pósters, piezas del logo — ~1,8 MB) con cabeceras de caché de larga duración en vez de `max-age=0, must-revalidate` | Se revalidan en cada visita repetida en vez de leerse de caché local | Bajo | `findings/performance.md` |

## 🟡 Medium — este mes

| # | Acción | Por qué | Esfuerzo | Fuente |
|---|---|---|---|---|
| 6 | Poblar `lastmod` real (desde el timestamp de edición de contenido, no de build) en las 37 URLs que no lo tienen, o quitar el campo del generador si no se puede hacer bien | Google puede dejar de fiarse del sitemap entero si detecta lastmod poco fiable con frecuencia | Bajo | `findings/sitemap.md` |
| 7 | Verificar el contenido real de las 12 páginas restantes de `/comparativa/tentare-vs-*` (solo se comprobó 1 de 13) — confirmar que la sección de diferencias específicas está genuinamente diferenciada por competidor, no solo la plantilla con el nombre cambiado | Riesgo de contenido casi duplicado a escala si las 13 comparten estructura+descargo idénticos | Medio (auditoría) + Alto si hay que reescribir | `findings/content.md` |
| 8 | Ampliar `/soluciones/estudio-de-yoga` (197 palabras) con casos de uso específicos de yoga, o bajarle prioridad/noindex si es un placeholder intencional mientras el producto pivota | Página fina compitiendo por intención comercial sin la profundidad que esa intención necesita | Medio | `findings/content.md` |
| 9 | Reestructurar `robots.txt` para que las rutas nuevas de `/network/*` no caigan bloqueadas por defecto (denegar solo lo privado explícitamente, en vez de permitir explícitamente sobre un disallow general) | Frágil para rutas futuras; funciona hoy solo porque las reglas más específicas ganan | Bajo | `findings/technical.md`, `findings/sitemap.md` |
| 10 | Dar a `/network` su propio H1 relevante al marketplace (hoy hereda el hero genérico "Tu estudio, A OTRO NIVEL" del SaaS) | Diluye la señal temática en la página que más la necesita | Bajo | `findings/local.md` |
| 11 | Añadir `ItemList` schema a `/network/instructoras` y a las páginas de ciudad, usando solo datos ya visibles (sin inventar posición/rating) | Patrón correcto para una página de directorio; conviene tenerlo antes de escalar | Bajo | `findings/schema.md`, `findings/local.md` |
| 12 | Verificar presencia real de marca en YouTube/Reddit/Wikipedia/LinkedIn (búsqueda simple, ~1h) antes de decidir invertir en un canal nuevo | YouTube es la señal individual con mayor correlación con citación de IA de todas las estudiadas — decide si el hallazgo aplica | Bajo (investigación) | `findings/geo.md` |
| 13 | Evaluar una página propia tipo "mejor software para gestión de estudios de pilates" (formato ranking/checklist con criterios, no 1-contra-1) para captar la búsqueda amplia que hoy dominan listados de terceros — confirmar primero si `/recursos/checklist-elegir-software-estudio` ya cubre esta intención | Las búsquedas amplias ("software gestión estudio pilates") las gana hoy contenido de terceros, no ningún vendor | Medio-Alto (contenido nuevo, si hace falta) | `findings/sxo.md` F3 |
| 14 | Añadir un ángulo comparativo ligero a `/recursos/facturacion-electronica-verifactu` (o enlazarla explícitamente a `/comparativa/tentare-vs-timp` y `/comparativa/tentare-vs-viday`) | Dos competidores ya combinan la guía de Verifactu con comparativa de proveedor en la misma página y están ganando esa búsqueda | Bajo-Medio | `findings/sxo.md` F4 |
| 15 | Añadir un párrafo de 130-170 palabras de respuesta directa bajo el H1/H2 de `/glosario` y de cada `/funcionalidades/*`, antes de la tabla | Las tablas son difíciles de extraer como pasaje citable para motores de IA; el rango 134-167 palabras correlaciona con mayor tasa de citación | Bajo-Medio (copywriting) | `findings/geo.md` |
| 16 | Arreglar el solape de la marca decorativa "T" con el subtítulo del hero en desktop/laptop/tablet (peor en 1366px) | Reduce el contraste del texto principal de la home en varios anchos de pantalla | Bajo | `findings/visual.md` |

## 🟢 Low — cuando haya hueco

- Añadir `includeSubDomains`/`preload` a HSTS y `X-Content-Type-Options: nosniff` (`findings/technical.md`).
- Confirmar con `tentare-seguridad` que `Access-Control-Allow-Origin: *` en la home no se aplica también a respuestas de API autenticadas (`findings/technical.md`).
- Confirmar si el listado de `/reservar/<estudio>` en el sitemap es una decisión de producto deliberada y si debe seguir creciendo 1:1 con cada cliente nuevo (`findings/technical.md`, `findings/sitemap.md`).
- Convertir 5-10 H2 de páginas clave a forma de pregunta para IA (`findings/geo.md`).
- Añadir `additionalProperty` (verificación) al schema `Person` del perfil de instructora, cuando haya más de un perfil (`findings/local.md`).
- Mover el precio/CTA de `/precios` más arriba en móvil para que no requiera scroll (`findings/visual.md`).
- Spot-check 3-5 artículos más de `/ayuda/*` en temas complejos (facturación, permisos) para confirmar que la profundidad escala con la complejidad (`findings/content.md`).

## No accionable ahora mismo (requiere acceso que no existe en este entorno)

- Configurar credenciales de Google API (PageSpeed/CrUX/Search Console/GA4) para tener LCP/INP/CLS reales y datos de tráfico/posición verdaderos — es el mayor hueco de este audit y precondición para varias decisiones de arriba.
- Confirmar en Search Console si `/comparativa/tentare-vs-mindbody` y `/recursos/facturacion-electronica-verifactu` tienen impresiones reales para sus búsquedas objetivo (`findings/sxo.md` F5).
- Ejecutar `/seo images` — la categoría Imágenes no se auditó en esta pasada.

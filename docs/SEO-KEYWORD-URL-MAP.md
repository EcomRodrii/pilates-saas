# SEO Keyword → URL Map — tentare.app

> **Revisión del 7-oct-2026 (vigente).** Arriba, el mapa actual con los datos
> reales de Search Console (3 meses hasta el 7-oct) y lo que se cambió ese día.
> Debajo se conserva el mapa del 13-ago como histórico: donde se contradigan,
> manda esta revisión.

## Regla de oro

Una intención = una URL primaria. Antes de crear una URL nueva se comprueba si
una existente ya la cubre. El 7-oct se evaluaron y **descartaron** cinco URLs
nuevas que se proponían (`/software-para-estudios-de-pilates`,
`/software-reservas-pilates`, `/software-pilates-reformer`, una de pagos y una
de app): cada intención ya tenía su página, y la home ya posiciona en la 2 para
«software gestión pilates» y en la 8,7 para «software para estudios de pilates»
con todo el enlazado interno y externo del dominio. Duplicarlas habría sido
canibalizar la página con más autoridad.

## Mapa vigente (7-oct-2026)

Posición = media de Search Console, últimos 3 meses. «—» = sin impresiones aún.

| Cluster | Búsquedas que cubre | URL primaria | Posición hoy | Qué se hizo el 7-oct |
|---|---|---|---|---|
| Software Pilates (core) | software / programa / sistema de gestión para estudios y centros de Pilates, gestión pilates | `/` | 2,2 («software gestión pilates»), 8,7, 9,8; 45 («gestión pilates») | Title con «de gestión» y marca; h1 «…de Pilates y yoga»; la búsqueda dentro de cada h2; «¿Qué es Tentare?»; sección «¿Ya usas otro programa?» que enlaza las comparativas; nota de G2 bajo el botón; FAQ visible en el HTML |
| Pilates reformer | software Pilates reformer, reservas por máquina, aforo reformer, plazas, lista de espera reformer | `/soluciones/estudio-de-pilates-reformer` | — | Página rehecha: respuesta directa, capturas reales, calculadora de plazas vacías, tabla reformer/mat |
| Yoga | software para estudios de yoga, reservas yoga, bonos y mensualidades yoga, talleres | `/soluciones/estudio-de-yoga` | 7 | Página rehecha con semántica propia de yoga |
| Reservas | software / sistema / app de reservas para Pilates | `/funcionalidades/reservas-online` | 41 (consultas de consumidora) | H1 con la búsqueda |
| Lista de espera | lista de espera clases de Pilates | `/funcionalidades/lista-de-espera` | 3,9 | H1 con la búsqueda |
| Bonos y cuotas | gestión / control / vencimiento de bonos, cuotas, membresías | `/funcionalidades/bonos-y-membresias` | 12,6 | Title «Gestión de bonos y cuotas…» y H1 |
| Pagos | cobros automáticos, pagos online, SEPA, impagos | `/funcionalidades/cobros-recurrentes` | 6,3 | Title «Cobros automáticos y SEPA…» y H1 |
| Alumnas / CRM | CRM estudio Pilates, gestión de alumnas, ficha | `/funcionalidades/ficha-de-clienta` | 8,4 | H1 con la búsqueda |
| Asistencia | control de asistencia Pilates/yoga | `/funcionalidades/control-de-asistencia` | 6 | Title y H1 |
| Profesoras | gestión de instructoras / profesores, horarios, tarifas | `/funcionalidades/gestion-de-instructoras` | 7,7 | Title con «instructoras y profesores» |
| Sustituciones | sustituciones de instructoras, cubrir clases | `/funcionalidades/sustituciones` | 6,8 | H1 con la búsqueda |
| App | app para estudios de Pilates / yoga, app con tu marca | `/funcionalidades/app-para-alumnas` | 4,5 | Title «App para estudios de Pilates y yoga…» |
| Varias sedes | software varios centros / cadena | `/funcionalidades/multi-centro` | 7,2 | H1 con la búsqueda |
| Precio | precio / cuánto cuesta software de Pilates | `/precios` | 6 | H1 con la búsqueda |
| Comparativa (hub) | comparativa software Pilates, precios de programas | `/comparativa` | 8,5 | Title e H1 con intención propia (precios de 14 programas); enlaza a la lista editorial |
| Mejor software (lista) | mejor software / programa para estudios de Pilates | `/recursos/mejor-software-para-estudios-de-pilates` | 10,5 | Ya no compite con `/comparativa` (antes los dos decían «13 comparados») |
| Competidor X | X precios, ¿X merece la pena?, alternativa a X, X opiniones | `/comparativa/tentare-vs-X` | lorari 5,7 · timp 7,8 · bsport 7,6 | Title «¿X merece la pena? Precios y alternativa para Pilates», H1 «X: precios, funciones y la alternativa…», resumen con respuesta directa, análisis propio en 7 |
| Cambiar de programa | migrar desde bsport/TIMP…, cambiar de software | `/soluciones/cambiar-de-software` | 8,6 | Enlazada desde cada comparativa y cada solución |

### Lo que NO se ha hecho a propósito

- **Sin páginas por ciudad** («software pilates madrid»): serían doorways.
- **Sin «opiniones» en los títulos de las comparativas**: la página no recoge
  reseñas de usuarios del competidor y el título no puede prometer lo que no hay.
- **Sin `aggregateRating`** en el JSON-LD: solo con reseñas reales y suficientes.

---

## Histórico: mapa del 13-ago-2026


Fecha: 2026-08-13. Ninguna acción de este documento se ha ejecutado — es mapa,
no cambio. Volúmenes son **juicio direccional**, no datos medidos (no hay acceso
a una herramienta real de volumen de búsqueda en esta fase) — marcados
LOW/MEDIUM/HIGH en relativo dentro del nicho, nunca como cifra.

Acciones: **KEEP** (ya cumple) · **OPTIMIZE** (existe pero puede mejorar) ·
**CONSOLIDATE** (compite consigo misma) · **REDIRECT** (debería desaparecer) ·
**CREATE** (no existe página adecuada) · **NO TARGET** (no merece página propia).

Regla aplicada en cada fila `CREATE`: se documenta qué URL existente se
consideró primero y por qué no basta, antes de proponer una nueva.

---

## A. Core commercial

| Keyword | Intent | Funnel | URL actual | Mejor URL | Acción | Prioridad |
|---|---|---|---|---|---|---|
| software para estudios de pilates | Commercial Investigation | TOFU/MOFU | `/` | `/` | KEEP | P0 |
| software gestión estudio pilates | Commercial Investigation | MOFU | `/` | `/` | KEEP | P0 |
| software de reservas para pilates | Commercial | MOFU | `/funcionalidades/reservas-online` | misma | KEEP | P0 |
| pilates studio software (EN) | Commercial Investigation | TOFU | ninguna (sin árbol EN) | — | NO TARGET *(por ahora)* — ver §21 masterplan | P3 |
| pilates management software (EN) | Commercial Investigation | TOFU | ninguna | — | NO TARGET *(por ahora)* | P3 |
| programa para gestionar estudio pilates | Commercial Investigation | MOFU | `/` | `/` | KEEP | P1 |
| precio software estudio pilates | Transactional | BOFU | `/precios` | misma | KEEP | P0 |
| cuánto cuesta un software de gestión pilates | Transactional | BOFU | `/precios` | misma | OPTIMIZE — confirmar que la FAQ de `/precios` responde textualmente a esta frase | P1 |
| software pilates sin permanencia | Transactional | BOFU | `/precios` | misma | KEEP (ya es un punto de venta explícito del plan) | P1 |
| CRM para estudios de pilates | Commercial Investigation | MOFU | `/funcionalidades/ficha-de-clienta` | misma | KEEP | P1 |
| software gestión bonos clases | Feature | MOFU | `/funcionalidades/bonos-y-membresias` | misma | KEEP | P2 |
| control de aforo pilates software | Feature | MOFU | `/funcionalidades/calendario-y-salas` | misma | KEEP — ya absorbida a propósito, no crear página aparte (decisión previa) | — |

## B. Comparison

| Keyword | Intent | Funnel | URL actual | Mejor URL | Acción | Prioridad |
|---|---|---|---|---|---|---|
| bsport vs tentare | Comparison | BOFU | `/comparativa/tentare-vs-bsport` | misma | **OPTIMIZE** — 387-418 palabras, cero enlaces internos salientes en las 7 páginas; ver hallazgo de arquitectura en `SEO-AI-MASTERPLAN.md §8` | **P0** |
| momence vs tentare | Comparison | BOFU | `/comparativa/tentare-vs-momence` | misma | OPTIMIZE (mismo motivo) | P0 |
| alternatives to bsport | Comparison | BOFU | `/comparativa/tentare-vs-bsport` | misma | OPTIMIZE — página existe pero en español; volumen EN puede no convertir sin árbol inglés — evaluar tras medir tráfico real | P2 |
| mindbody alternatives | Comparison | BOFU | `/comparativa/tentare-vs-mindbody` | misma | OPTIMIZE | P1 |
| mejor software para pilates | Commercial Investigation | MOFU | `/comparativa` (hub) | misma | OPTIMIZE — el hub solo compara contra 3 de los 7 competidores enlazados (bsport/Mindbody/Eversports) en su propia tabla; Momence/TIMP/Lorari/Bonsai no aparecen en la tabla del hub | P1 |
| mejor software gestión pilates españa | Commercial Investigation | MOFU | `/comparativa`, `/` | `/comparativa` | KEEP, con la mejora de arriba | P1 |
| comparativa software gestión pilates | Comparison | MOFU | `/comparativa` | misma | KEEP | P1 |
| software para pilates gratis | Commercial Investigation (price-sensitive) | MOFU | ninguna | `/precios` (sección) | OPTIMIZE — no hay plan gratis en Tentare (a diferencia de Lorari/Bonsai que sí ofrecen tier free); esto es honestidad de producto, no un hueco de contenido — no fabricar un "gratis" que no existe | — |
| lorari vs timp / timp vs sammy / bonsai vs gesyoga | Comparison | BOFU | ninguna | — | NO TARGET — no son comparaciones donde Tentare es parte; escribir sobre rivales ajenos sin involucrarnos no aporta valor comercial | — |

## C. Problem / Educational (español)

| Keyword | Intent | Funnel | URL actual | Mejor URL | Acción | Prioridad |
|---|---|---|---|---|---|---|
| cómo gestionar sustituciones pilates | Problem-aware | TOFU | `/recursos/cubrir-baja-instructora` | misma | KEEP | P1 |
| cómo reducir cancelaciones pilates | Problem-aware | TOFU | `/recursos/reducir-cancelaciones-ultima-hora` | misma | KEEP | P1 |
| cómo subir ocupación clases valle | Problem-aware | TOFU | `/recursos/ocupacion-clases-valle` | misma | KEEP | P1 |
| cómo elegir software para mi estudio | Solution-aware | MOFU | `/recursos/checklist-elegir-software-estudio` | misma | KEEP | P1 |
| VeriFactu qué es / facturación electrónica obligatoria | Informational (regulatorio, en alza 2026-2027) | TOFU | `/recursos/facturacion-electronica-verifactu` | misma | **OPTIMIZE — refrescar antes del pico de búsqueda de 2027** (mandato para autónomos), ver §5 competidores (TIMP y Virtuagym ya atacan esto agresivamente) | **P0** |
| cómo montar un estudio de pilates | Informational (top-of-funnel, más amplio que software) | TOFU | ninguna | — | CREATE, condicional — solo si se decide invertir en TOFU puro; hoy es P3, no justifica una guía nueva mientras el árbol comercial no esté maduro | P3 |
| cómo gestionar bonos pilates | Problem-aware | TOFU | `/funcionalidades/bonos-y-membresias` cubre parcialmente | — | CONSOLIDATE — no crear guía nueva; añadir un párrafo/FAQ a la página de funcionalidad existente antes de fragmentar en una guía nueva | P2 |
| cómo retener alumnas pilates | Informational | TOFU | ninguna directa (`/recursos/estudios-pilates-de-exito` roza el tema) | — | CREATE, condicional — evaluar tras ver qué guía de las 7 actuales performa peor; no añadir una 8ª sin dato de qué falta de verdad | P2 |
| cómo automatizar estudio pilates | Solution-aware | MOFU | `/funcionalidades/automatizaciones-y-avisos` | misma | KEEP | P1 |

## D. Feature-level

| Keyword | Intent | Funnel | URL actual | Mejor URL | Acción | Prioridad |
|---|---|---|---|---|---|---|
| pilates waitlist software / lista de espera pilates | Feature | MOFU | `/funcionalidades/lista-de-espera` | misma | KEEP | P0 |
| pilates instructor management / gestión instructoras | Feature | MOFU | `/funcionalidades/gestion-de-instructoras` | misma | KEEP | P1 |
| software domiciliación SEPA pilates | Feature | MOFU | `/funcionalidades/cobros-recurrentes` | misma | KEEP — SEPA 19.14 es diferencial real frente a competidores anglosajones, verificar que la página lo nombra explícitamente | P1 |
| app propia estudio pilates marca blanca | Feature | MOFU | `/funcionalidades/app-para-alumnas` | misma | KEEP, con la limitación de "no es app de tienda" ya declarada en la página (correcto, no tocar) | P1 |
| software gestión reformer pilates | Feature | MOFU | `/funcionalidades/calendario-y-salas` | misma | KEEP | P2 |
| substitute instructor software (EN) | Problem-aware | MOFU | ninguna (sin árbol EN) | — | NO TARGET *(por ahora)* | P3 |

## E. Local / Spain

| Keyword | Intent | Assessment | Acción | Prioridad |
|---|---|---|---|---|
| software pilates españa | Commercial Investigation | Intención real y distinta — todos los competidores construyen páginas ES dedicadas (AgendaPro, TIMP, Sammy, GesYoga, Bonsai) | **CONSOLIDATE dentro de `/`, `/precios` y `/funcionalidades/facturacion`** — el diferenciador real de "España" no es un slug con "españa" pegado, es Veri\*Factu/SEPA/IVA, que ya se cubre en esas páginas. No crear `/españa` como página propia | — |
| software para estudios pilates españa | Commercial Investigation | Mismo cluster que arriba | CONSOLIDATE (mismo motivo) | — |
| software reservas pilates españa | Commercial Investigation | Weak — muy probablemente el mismo buscador que "software reservas pilates", con "españa" reflejo | NO TARGET como página propia — es el ejemplo de trampa de SEO local descrita en el encargo | — |
| programa gestión pilates españa | Commercial Investigation | Weak, mismo patrón | NO TARGET | — |

**Conclusión de la sección Local/Spain**: no crear páginas locales por
ciudad/región (ya descartado en el plan previo como doorway) ni una landing
genérica "/españa" — el ángulo España real y defendible es regulatorio
(Veri\*Factu, SEPA, IVA, gestoría), que ya vive en `/funcionalidades/facturacion`,
`/funcionalidades/cobros-recurrentes` y `/recursos/facturacion-electronica-verifactu`.

## F. AI-search specific (nuevo — no estaba en el plan previo)

| Keyword/pregunta tipo | Intent | URL actual | Mejor URL | Acción | Prioridad |
|---|---|---|---|---|---|
| "¿qué software gestiona sustituciones automáticamente?" | Feature-specific, AI-answerable | `/funcionalidades/sustituciones` | misma | OPTIMIZE — asegurar un párrafo de respuesta directa y citable cerca del H1 (patrón "respuesta en 2 frases, luego detalle") | P0 |
| "¿qué es VeriFactu y qué software lo cumple?" | Informational + Commercial, AI-answerable | `/recursos/facturacion-electronica-verifactu` + `/funcionalidades/facturacion` | ambas, cruzadas | OPTIMIZE | P0 |
| "¿hay alguna alternativa española a Mindbody/bsport?" | Comparison, AI-answerable | `/comparativa` | misma | OPTIMIZE — el hub debe nombrar explícitamente "alternativa española" si es honesto (Tentare es española, verificar `LEGAL`) | P1 |
| "¿qué significa lista de espera automática en un software de reservas?" | Definitional, AI-answerable | `/glosario` | misma | OPTIMIZE — ampliar el glosario (hoy 9 términos) es la palanca más barata de citabilidad AI (ver Fase 13 del masterplan) | P1 |

---

## Resumen de acciones por tipo

- **KEEP**: 24 de las combinaciones anteriores — la arquitectura de 40 páginas ya
  cubre la mayoría de la intención core commercial, feature-level y comparison en
  español.
- **OPTIMIZE**: 9 — mayoritariamente las 7 páginas comparativa (contenido fino,
  sin enlaces) y el hub `/comparativa` (tabla incompleta frente a 4 de 7
  competidores).
- **CONSOLIDATE**: 3 — evitar fragmentar en páginas nuevas lo que ya cabe en una
  página de funcionalidad existente ampliada.
- **CREATE**: 2, ambas condicionales/P2-P3 — ninguna urgente.
- **NO TARGET**: 6 — sobre todo inglés (fuera de alcance) y comparaciones entre
  terceros donde Tentare no es parte.
- **REDIRECT**: 0 — no se encontró ninguna página real duplicando intención de
  otra hoy (el trabajo de consolidación ya se hizo en el plan previo, §5 de ese
  documento).

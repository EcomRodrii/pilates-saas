# SEO URL Inventory — tentare.app

Fecha: 2026-08-13. Auditoría de solo lectura — cero cambios de código, metadata,
URLs o schema en este documento. Fuentes: `lib/seo/paginas.ts` (registro único que
alimenta `app/sitemap.ts` y `app/robots.ts`), lectura directa de cada `page.tsx`
registrado, `https://tentare.app/sitemap.xml` y `https://tentare.app/robots.txt`
en producción, y `docs/SEO-ARQUITECTURA-PLAN.md` (plan previo, ya ejecutado en 4
lotes entre 2026-07 y 2026-08-11 — ver ese documento para el histórico completo
de por qué cada página existe).

**No repetir esta auditoría desde cero en el futuro**: `lib/seo/paginas.ts` es la
fuente única y `lib/seo/paginas.test.ts` falla si una página pública nueva no se
registra ahí. Cualquier cambio a esta lista debería empezar por leer ese fichero,
no por rastrear `app/` a mano.

---

## 1. Páginas públicas indexables (registro `lib/seo/paginas.ts`)

Confirmadas en `lib/seo/paginas.ts`, sitemap de producción (verificado en vivo,
~41-42 URLs) y `robots.txt` de producción (todas permitidas). `Metadata fuente`
indica si el `page.tsx` real importa `paginaDe()` del registro (✅ sincronizado) o
tiene su título/descripción escritos a mano (⚠️ puede divergir — ver §4 para la
lista exacta de divergencias encontradas).

| URL | Grupo | Título (registro) | H1 real | Metadata fuente | Prioridad sitemap | Última actualización | Internal links entrantes |
|---|---|---|---|---|---|---|---|
| `/` | home | Tentare — Software para estudios de Pilates \| Reservas, cobros y sustituciones | "Software para estudios de Pilates" / "Tu estudio. Bajo control." | ⚠️ hardcoded en `app/layout.tsx`, diverge del registro | 1.0 | — | Todas (punto de entrada) |
| `/precios` | software | Precios de Tentare — Software para estudios de Pilates desde 29€/mes | Precios | ✅ `paginaDe()` | 0.9 | 2026-08-11 | Nav, footer, comparativa, funcionalidades |
| `/funcionalidades` | funcionalidades | Funcionalidades de Tentare para estudios de Pilates \| Tentare | "Todo lo que hace Tentare, sin adjetivos." | ✅ `paginaDe()` | 0.9 | 2026-08-11 | Nav, footer, home, las 15 hijas |
| `/funcionalidades/reservas-online` | funcionalidades | Software de reservas para estudios de Pilates \| Tentare | — | ✅ `paginaDe()` | 0.9 | 2026-08-11 | hub, home, calendario, lista-de-espera, app-para-alumnas |
| `/funcionalidades/lista-de-espera` | funcionalidades | Lista de espera automática para clases de Pilates \| Tentare | — | ✅ `paginaDe()` | 0.9 | 2026-08-11 | hub, reservas, cancelaciones, calendario |
| `/funcionalidades/calendario-y-salas` | funcionalidades | Calendario de clases, salas y aforo por reformer \| Tentare | — | ✅ `paginaDe()` | 0.9 | 2026-08-11 | hub, reservas, control-de-asistencia, instructoras |
| `/funcionalidades/gestion-de-instructoras` | funcionalidades | Gestión de instructoras: disponibilidad, horas y tarifas \| Tentare | — | ✅ `paginaDe()` | 0.9 | 2026-08-11 | hub, sustituciones, calendario, informes |
| `/funcionalidades/sustituciones` | funcionalidades | Sustituciones de instructoras automáticas \| Tentare | "La baja se cubre sola" | ✅ `paginaDe()` | **1.0** (única funcionalidad a máxima prioridad) | 2026-08-11 | home, hub, instructoras, `/recursos/cubrir-baja-instructora` |
| `/funcionalidades/bonos-y-membresias` | funcionalidades | Bonos, cuotas y plazas fijas para tu estudio \| Tentare | — | ✅ `paginaDe()` | 0.9 | 2026-08-11 | hub, cobros, reservas, ficha-de-clienta |
| `/funcionalidades/cobros-recurrentes` | funcionalidades | Cobro recurrente y recuperación de impagos \| Tentare | — | ✅ `paginaDe()` | 0.9 | 2026-08-11 | hub, facturación, bonos, precios |
| `/funcionalidades/facturacion` | funcionalidades | Facturación con Veri\*Factu para estudios de Pilates \| Tentare | — | ✅ `paginaDe()` | 0.9 | 2026-08-11 | hub, cobros, `/recursos/facturacion-electronica-verifactu`, seguridad |
| `/funcionalidades/ficha-de-clienta` | funcionalidades | CRM y ficha de alumna para estudios de Pilates \| Tentare | — | ✅ `paginaDe()` | 0.9 | 2026-08-11 | hub, automatizaciones, bonos, seguridad |
| `/funcionalidades/automatizaciones-y-avisos` | funcionalidades | Automatizaciones y avisos por WhatsApp y email \| Tentare | — | ✅ `paginaDe()` | 0.9 | 2026-08-11 | hub, ficha-de-clienta, lista-de-espera, cobros |
| `/funcionalidades/informes-y-rentabilidad` | funcionalidades | Informes de rentabilidad y ocupación de clases \| Tentare | — | ✅ `paginaDe()` | 0.9 | 2026-08-11 | hub, instructoras, calendario, bonos |
| `/funcionalidades/cancelaciones-y-politicas` | funcionalidades | Política de cancelación y no-shows para tu estudio \| Tentare | — | ✅ `paginaDe()` | 0.9 | 2026-08-11 | hub, reservas, lista-de-espera, cobros |
| `/funcionalidades/app-para-alumnas` | funcionalidades | App de marca para las alumnas de tu estudio \| Tentare | — | ✅ `paginaDe()` | 0.9 | 2026-08-11 | hub, reservas, ficha-de-clienta, bonos |
| `/funcionalidades/control-de-asistencia` | funcionalidades | Control de asistencia y no-shows en tu estudio \| Tentare | — | ✅ `paginaDe()` | 0.8 | 2026-08-11 | hub, cancelaciones, calendario, ficha-de-clienta |
| `/funcionalidades/multi-centro` | funcionalidades | Software para cadenas con varios centros de Pilates \| Tentare | — | ✅ `paginaDe()` | 0.8 | 2026-08-11 | hub, instructoras, precios, seguridad |
| `/comparativa` | software | Comparativa: Tentare vs bsport, Mindbody y Eversports | "Tentare frente a bsport, Mindbody y Eversports." | ⚠️ hardcoded (coincide hoy, pero no importa el registro) | 0.8 | — | precios, funcionalidades, seguridad |
| `/comparativa/tentare-vs-mindbody` | software | Tentare vs Mindbody: comparativa para estudios de Pilates en España | "Tentare frente a Mindbody." | ⚠️ hardcoded, descripción diverge del registro | 0.7 | — | **Solo** hub `/comparativa` + footer genérico. **Cero enlaces entrantes desde funcionalidades o recursos.** |
| `/comparativa/tentare-vs-bsport` | software | Tentare vs bsport: comparativa para estudios de Pilates en España | — | ⚠️ ídem | 0.7 | — | ídem — orphan de facto (§3 de la auditoría) |
| `/comparativa/tentare-vs-momence` | software | Tentare vs Momence: comparativa para estudios de Pilates en España | — | ⚠️ ídem, verificado divergencia exacta en §4 | 0.7 | — | ídem |
| `/comparativa/tentare-vs-timp` | software | Tentare vs TIMP: comparativa para estudios de Pilates en España | — | ⚠️ ídem | 0.7 | — | ídem |
| `/comparativa/tentare-vs-eversports` | software | Tentare vs Eversports: comparativa para estudios de Pilates en España | — | ⚠️ ídem | 0.7 | — | ídem |
| `/comparativa/tentare-vs-lorari` | software | Tentare vs Lorari: comparativa para estudios de Pilates en España | — | ⚠️ ídem | 0.7 | — | ídem |
| `/comparativa/tentare-vs-bonsai` | software | Tentare vs Bonsai: comparativa para estudios de Pilates en España | — | ⚠️ ídem | 0.7 | — | ídem |
| `/recursos` | recursos | Centro de Recursos — Guías para tu estudio de Pilates \| Tentare | — | ⚠️ hardcoded en `app/recursos/layout.tsx` (`page.tsx` es `'use client'`) | 0.8 | — | glosario, funcionalidades, las 7 guías |
| `/recursos/cubrir-baja-instructora` | recursos | Cómo cubrir una baja de instructora sin hacer una llamada | — | ✅ `paginaDe()` | 0.7 | 2026-07-01 | recursos, `/funcionalidades/sustituciones` |
| `/recursos/facturacion-electronica-verifactu` | recursos | Facturación electrónica para estudios en España | — | ✅ `paginaDe()` | 0.7 | 2026-07-01 | recursos, `/funcionalidades/facturacion` |
| `/recursos/precios-reformer-mat` | recursos | Reformer vs. mat: cómo poner precio a cada clase | — | ✅ `paginaDe()` | 0.7 | 2026-07-01 | recursos únicamente — sin salientes |
| `/recursos/estudios-pilates-de-exito` | recursos | Qué puedes aprender de los estudios de Pilates que más crecen | — | ✅ `paginaDe()` | 0.7 | 2026-08-06 | recursos únicamente — sin salientes |
| `/recursos/ocupacion-clases-valle` | recursos | Cómo subir la ocupación de tus clases valle | — | ✅ `paginaDe()` | 0.7 | 2026-08-06 | recursos, `precios-reformer-mat`, `/funcionalidades/informes-y-rentabilidad` |
| `/recursos/reducir-cancelaciones-ultima-hora` | recursos | Reduce las cancelaciones de última hora | — | ✅ `paginaDe()` | 0.7 | 2026-08-06 | recursos únicamente — sin salientes |
| `/recursos/checklist-elegir-software-estudio` | recursos | Checklist: cómo elegir el software de tu estudio | — | ✅ `paginaDe()` | 0.7 | 2026-08-06 | recursos únicamente — sin salientes |
| `/glosario` | recursos | Glosario del software de gestión para estudios de Pilates — Tentare | "Los términos del software de gestión para Pilates, explicados sin venderte nada." | ⚠️ hardcoded, coincide hoy | 0.8 | — | recursos, funcionalidades (5 de 9 términos enlazan a una guía) |
| `/seguridad` | recursos | Seguridad y protección de datos — Tentare | — | ⚠️ hardcoded, **diverge del registro** (título y descripción distintos — ver §4) | 0.6 | — | ficha-de-clienta, comparativa |
| `/legal` | legal | Aviso legal — Tentare | — | ⚠️ hardcoded, diverge (separador `·` vs `—`, descripción distinta) | 0.3 | — | Legal cross-links |
| `/privacidad` | legal | Privacidad — Tentare | — | ⚠️ hardcoded, diverge | 0.3 | — | Legal cross-links |
| `/terminos` | legal | Términos — Tentare | — | ⚠️ hardcoded, diverge | 0.3 | — | Legal cross-links |
| `/cookies` | legal | Cookies — Tentare | — | ⚠️ hardcoded, diverge | 0.3 | — | Legal cross-links |

**Total: 40 páginas registradas** (1 home + 1 precios + 16 grupo funcionalidades
+ 8 grupo comparativa + 8 grupo recursos + 1 glosario + 1 seguridad + 4 legal).
El sitemap de producción, verificado en vivo, contiene el mismo conjunto — sin
huecos entre registro y producción.

---

## 2. Páginas no indexables (deliberado, por `PREFIJOS_NO_INDEXABLES`)

Confirmado en `robots.txt` de producción — coincide exactamente con
`lib/seo/paginas.ts`. No son candidatas a "arreglar": están bloqueadas a propósito.

| Prefijo | Qué cubre | Motivo |
|---|---|---|
| `/api` | Todos los endpoints | Infraestructura, no contenido |
| `/login`, `/crear-estudio`, `/suscripcion`, `/invitacion`, `/clave-nueva` | Autenticación y alta | Zona de acceso, no landing |
| `/interno` | Backoffice de Tentare-empresa | No es cara pública del producto |
| `/instructora` | Alta freelance sin estudio | Flujo de alta, no contenido |
| `/demo` | Puerta temporal para grabar vídeo | No es contenido real |
| `/portal`, `/portal-preview` | Portal de socias por estudio | B2B primero — decisión de producto explícita: no miles de URLs por estudio |
| `/kiosk` | Check-in en tablet | Módulo **congelado** (`lib/frozen-features.ts`) |
| `/reservar` | Widget público de reserva por estudio | Decisión de producto: antes contradecía `robots.txt` (declaraba `index:true`), corregido — ahora coherente en no-index |
| `/i` | Enlace público de instructora freelance | Mismo motor que `/reservar`, misma decisión |
| `/aceptar-sustitucion`, `/confirmar-reserva`, `/disponibilidad`, `/no-puedo`, `/valorar` | Enlaces firmados de un solo uso | No son páginas de contenido, son acciones por token |
| 30 segmentos de `(dashboard)` (`/automatizaciones`, `/calendario`, `/centro-de-control`, `/chat`, `/cierre`, `/citas`, `/clientas`, `/cobros`, `/comunidad`, `/configuracion`, `/contenido`, `/dashboard`, `/equipo`, `/explorar-funciones`, `/facturas`, `/informes`, `/libreta`, `/marketing`, `/mensajeria`, `/mi-perfil`, `/migracion`, `/notificaciones`, `/ondemand`, `/pagos`, `/pos`, `/primeros-pasos`, `/productos`, `/socios`, `/sustituciones`, `/transacciones`) | Panel de gestión autenticado | Cerradura RLS + no-index — nunca contenido público |

Otras rutas de un solo uso encontradas en `app/` que caen dentro de estos
prefijos o no aplican SEO: `app/portal-tema-preview/[tema]`, `app/icono-estudio`,
`app/interno/*`.

---

## 3. Páginas web con intención comercial que NO existen todavía

Documentadas y descartadas o pospuestas en `docs/SEO-ARQUITECTURA-PLAN.md §4.4`
y `§14` (no repetir el debate sin releer ese documento):

| Página propuesta | Estado | Motivo |
|---|---|---|
| `/soluciones` (hub) + `/soluciones/cambiar-de-software` | **Pospuesta, sin fecha** (P1 del plan previo) | Migración/cambio de proveedor — intención transaccional real, conecta con `/migracion` (código real: importadores CSV, acta y rollback). Ver §7 de este documento. |
| `/soluciones/estudio-de-yoga` | **Pospuesta, sin fecha** (P1) | Mercado adyacente real (`DISCIPLINAS` incluye yoga en el código) pero riesgo alto de leerse como doorway si no se escribe con contenido específico de yoga |
| `/soluciones/centro-multidisciplinar` | **Pospuesta, sin fecha** (P2) | Diluye el posicionamiento vertical que es el foso de Tentare |
| `/soluciones/estudio-nuevo` | **Pospuesta, sin fecha** (P2) | Público con intención pero sin presupuesto — mejor como guía en `/recursos` |
| `/sobre-tentare` | **Pospuesta, sin fecha** (P2) | Hueco de E-E-A-T real para un SaaS que toca dinero y datos de salud. El footer de la home enlaza "Sobre Tentare" a `#top` — enlace muerto de facto |
| `/software-para-estudio-de-pilates` | **Descartada permanentemente** | Canibalizaría la home, que ya es esa página |
| `/reservas-pilates` como página separada de `reservas-online` | **Descartada permanentemente** | Misma intención de búsqueda |
| `/software-pilates-madrid`, `-barcelona`, etc. | **Descartada permanentemente** | Doorway pages sin contenido específico por ciudad |
| Árbol `/en/` en inglés | **Fuera de alcance de esta fase** | Precios en EUR, Veri\*Factu, SEPA español, soporte y panel solo en español — el ICP actual no es angloparlante. Ver §21 del masterplan |

---

## 4. Divergencias de metadata encontradas (registro vs. página real) — CERRADO (2026-08-13)

`lib/seo/paginas.ts` se documenta a sí mismo como "fuente única de verdad", pero
en el momento de esta auditoría solo 24 de 40 páginas la consumían
programáticamente (`paginaDe()`). Las otras 16 hardcodeaban su propio
`title`/`description`, y de esas, 13 ya habían divergido del texto que el
registro decía tener (no 12 — recuento corregido al cerrar esto: home + las 7
comparativas + seguridad + las 4 legales).

**Resuelto** en la fase de implementación (fuera de la Regla Absoluta #1, que
aplicaba solo a la auditoría inicial — el usuario aprobó pasar a implementación
antes de este cambio):

| Página | Qué se hizo |
|---|---|
| `/` | No se pudo enganchar a `paginaDe()` sin tocar `app/layout.tsx` (metadata raíz, radio de impacto alto). Se sincronizó el texto del **registro** para que coincida literalmente con lo que ya sirve `app/layout.tsx`, con un comentario explicando la excepción. |
| 7× `/comparativa/tentare-vs-*` | El registro pasó de una descripción-plantilla única a **la descripción real de cada página** (verificada línea a línea) — porque cada una es deliberadamente más precisa que una plantilla genérica (ej. Lorari/Bonsai no confirman alojamiento en la UE, así que su descripción no lleva esa cláusula). Las 7 páginas ahora importan `paginaDe()` para `title`/`description`; el `openGraph` corto y distinto de cada una se mantiene tal cual, es un teaser social intencional. |
| `/comparativa` (hub) | Convertida a `paginaDe()`. Título y descripción actualizados para reflejar los 7 competidores (antes solo nombraba a 3, inconsistencia que arrastraba desde el trabajo de ampliar las comparativas). |
| `/seguridad` | Registro actualizado para adoptar el texto real (más específico: Veri\*Factu/Stripe/backups) en vez del genérico anterior. Página convertida a `paginaDe()`. |
| `/legal`, `/privacidad`, `/terminos`, `/cookies` | **Hallazgo nuevo al arreglar esto**: las 4 no tenían `alternates.canonical` ni bloque `openGraph` — no solo divergían de texto, no tenían ninguno de los dos. Registro actualizado con el título real de cada página (más descriptivo que el genérico `${etiqueta} — Tentare`) y separador estandarizado a `—` (antes usaban `·`, el único sitio del site con ese estilo). Las 4 páginas ahora importan `paginaDe()` y llevan canonical + OG por primera vez. |

Verificado: `npx eslint` limpio en todos los ficheros tocados, `tsc --noEmit`
limpio en todo el repo, y los 15 tests de `lib/seo/paginas.test.ts` en verde
(uno de ellos falló primero por longitud de título/descripción del hub
`/comparativa` tras el cambio — corregido acortando el texto, exactamente el
tipo de fallo que ese test existe para cazar).

---

## 5. Verificación en producción (2026-08-13)

- **Sitemap** (`https://www.tentare.app/sitemap.xml`): plano, sin sub-sitemaps,
  ~41-42 URLs, coincide con el registro. `lastModified` presente solo donde
  `actualizado` está fijado en el registro (correcto — el propio código evita
  inventar fechas).
- **robots.txt**: coincide exactamente con `PREFIJOS_NO_INDEXABLES`. `Host` y
  `Sitemap` apuntan a `www.tentare.app`.
- **Renderizado**: las 6 páginas muestreadas (home, precios, funcionalidades hub,
  sustituciones, comparativa hub, tentare-vs-bsport, glosario) sirven contenido
  completo en el HTML (no shells vacíos) — buena señal técnica de base.
- **UNKNOWN, no verificable con las herramientas de esta fase**: indexación real
  en Google (Search Console no disponible aquí), Core Web Vitals de producción,
  meta description y JSON-LD del homepage por limitación de la herramienta de
  fetch (convierte HTML a markdown y puede perder el `<head>` — no es prueba de
  ausencia).
- **`site:tentare.app` vía WebSearch**: cero resultados. **No es una comprobación
  real de indexación** — WebSearch no ejecuta el operador `site:` como Google.
  Se necesita Search Console o una búsqueda real en google.com para confirmar.
- **Presencia en directorios de reseñas**: cero encontrada en G2, Capterra o
  Product Hunt (búsqueda web, no garantiza ausencia total pero no se encontró
  nada). Ver `docs/SEO-COMPETITOR-ANALYSIS.md` para el mismo chequeo en los 7
  competidores.

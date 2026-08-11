# Arquitectura SEO de tentare.app — auditoría y plan

Estado: **lote P0 implementado, más `informes-y-rentabilidad`,
`cancelaciones-y-politicas` y `app-para-alumnas` (§12, §13).** Lo que no se
publicó está en §11.4, con el motivo.
Fecha: 2026-08-11. Base: rama `claude/tentare-seo-architecture-ea9287` sobre `main` (7b157d95).

Todo lo que aquí se afirma sobre el producto está verificado leyendo el repo, no
asumido del brief. Lo que no se ha podido verificar se marca explícitamente.

---

## 1. Funcionalidades reales encontradas

Fuentes cruzadas: `lib/nav-config.ts`, `lib/funciones-catalogo.ts`,
`lib/billing/entitlements.ts`, `lib/frozen-features.ts`, `lib/types.ts`,
155 rutas de `app/api/`, 250 migraciones y los módulos de `lib/`.

### 1.1 Reservas y calendario — REAL

| Funcionalidad | Evidencia |
|---|---|
| Calendario de clases con salas, arrastre, series recurrentes | `lib/calendario-*.ts` (24 módulos), `lib/serie-horario.ts`, RPC editar-serie |
| Capacidad por *spot*/reformer, no solo aforo | `components/spots/`, `lib/aforo-logic.ts` |
| Página pública de reservas por estudio | `app/reservar/[slug]/`, vistas Lista·Semana·Día, filtros tipo/instructora/nivel/horario (`lib/reservar/`) |
| Lista de espera automática con promoción | estado `LISTA_ESPERA`, RPC `promocionar_siguiente_espera` |
| Oferta de plaza con plazo de aceptación | Fase 2b, `reservas.oferta_expira_en`, cron `lista-espera-ofertas.ts` |
| Aprobación manual de reserva | estado `PENDIENTE_APROBACION`, RPC `resolver_reserva_pendiente` |
| 13 reglas de reserva/cancelación por tipo de clase | `lib/booking-logic.ts` (`heredaOverride`), Fases 1–3 completas |
| Mínimo de asistentes → autocancelación de la clase | `lib/inngest/minimo-asistentes.ts`, devuelve bono |
| Penalización económica por cancelación tardía / no-show | tabla `penalizaciones`, `lib/inngest/penalizaciones.ts` |
| Plazas fijas y recuperaciones | tabla `plazas_fijas`, RPC `materializar_plazas_fijas`, `Recuperacion` en `lib/types.ts` |
| Citas 1-a-1 / servicios con hora | `app/(dashboard)/citas/`, `lib/citas/slots.ts` |
| Confirmación ante riesgo de plantón | `lib/confirmacion-riesgo/` |
| Control de asistencia | estados `ASISTIDA`/`NO_ASISTIO`, pase QR (`lib/pase-acceso.ts`, `/calendario/pase`), barrido nocturno `lib/no-show.ts` |

### 1.2 Clientas / CRM — REAL

Ficha completa (historial, bonos, asistencia, notas de progreso), **Ficha Clínica
Operativa** con condiciones por zona corporal, semáforo y alertas
(`lib/ficha-clinica.ts`, `docs/FICHA-CLINICA.md`, permiso `puedeVerFichaClinica`),
consentimiento de salud trazable, mensajería centralizada (`/mensajeria`),
libreta de mostrador, valoraciones de clase por token firmado, importadores CSV
desde otras plataformas (`/migracion`, socias, bonos, reservas, clases, citas,
plazas fijas).

### 1.3 Equipo e instructoras — REAL

Roles PROPIETARIO/MANAGER/RECEPCION/INSTRUCTOR con RLS por rol; disponibilidad
semanal + excepciones/bloqueos; ausencias (vacaciones/baja); **motor de
sustituciones** completo (baja → candidatas por afinidad → contacto multicanal →
confirmación → aviso a alumnas) con 4 niveles de autonomía (manual, asistido,
autónomo, vacaciones); riesgo de dependencia de una instructora
(`lib/instructor-dependency.ts`, cron semanal); rendimiento por instructora;
tarifa/hora y liquidaciones (`instructor_tarifas`, `/equipo/liquidaciones`);
autoservicio de instructora (Tentare Core, 6 PRs); una instructora en varias
sedes de la misma cadena con rol y tarifa distintos por sede.

### 1.4 Cobros y facturación — REAL

Stripe Connect *direct charge*, cobro recurrente, tarjeta guardada off-session,
dunning con reintentos, reembolsos desde el panel, conciliador de cobros; bonos,
cuotas, membresías y **planes por tipo de clase**; códigos de descuento; **SEPA
cuaderno 19.14** (`pain.008.001.02`, `lib/sepa-19-14.ts`); facturación con
numeración, **Veri\*Factu** (huella SHA-256 encadenada + QR, `lib/verifactu.ts`)
y firma/envío AEAT vía **Fiskaly SIGN ES** (`lib/billing/fiskaly.ts`, falla-suave);
cierre de año con ingresos e IVA para la gestoría.

> ⚠️ Aviso de honestidad para el contenido: por Stripe ha pasado muy poco dinero
> real en producción (1 socia de 202 con tarjeta guardada). El código existe y
> está probado; **no se pueden publicar cifras de volumen procesado**.

### 1.5 Automatización y avisos — REAL

`Notification Engine` event-driven multicanal: in-app, push (web-push), email
(Resend + React Email, plantillas editables por la propietaria), WhatsApp (Meta
Cloud API con el número del propio estudio) y Twilio (WhatsApp+SMS de plataforma).

Triggers implementados y verificados:
- **Alcanzables hoy** — motor avanzado (`TRIGGERS_IMPLEMENTADOS`, `/automatizaciones`):
  `AUSENCIA_DIAS`, `PAGO_PENDIENTE_DIAS`, `BONO_SESIONES_BAJAS`, `NUEVA_SOCIA`,
  `CLASE_MANANA`, `RENOVACION_COBRADA`, `CLASE_LLENA_RECURRENTE`. **Siete.**
- ⛔ **NO alcanzables** — `TriggerAutomatizacion` (`SUSCRIPCION_EXPIRA_7D/1D`,
  `SUSCRIPCION_CANCELADA`, `CUMPLEANOS`, `PRIMERA_CLASE`, `INACTIVIDAD_30D`,
  `BONO_AGOTADO`, `BONO_QUEDA_1`, `NUEVA_ALTA`, `CITA_RECORDATORIO`,
  `CONTENIDO_PUBLICADO`). Existen en el código pero **solo se configuran desde
  `components/marketing/flow-builder.tsx`, que cuelga de `/marketing`, apagado
  por `MARKETING_MODULE_ENABLED = false`**. Contarlos en una página pública sería
  vender una pantalla inalcanzable — ver §11.2.

Además, 37 tipos de evento en el `Notification Engine`
(`lib/notifications/catalog.ts`) repartidos entre in-app, push, email, WhatsApp
y SMS, donde la lista de canales declarada por evento es la autoridad.

Radar de ocupación 48 h → aviso por WhatsApp solo a socias con bono activo que ya
han hecho esa clase.

### 1.6 Informes y decisiones — REAL

Informes de ingresos, ingresos por día, ocupación por tipo de clase, estadísticas
de clientas, ventas por tipo con variación y **margen de contribución por clase**
(cruza la tarifa/hora real de la instructora). Exportación a Excel/CSV.
**Decision OS / Centro de Control**: especialistas por área, predicción con muestra
mínima (nunca un porcentaje sin respaldo), priorizador de conflictos entre
especialistas, piloto automático y "El Umbral" (un solo mensaje al día).

### 1.7 Portal de socias y app de marca — REAL, con matiz

Portal por estudio (`/portal/[slug]`): home, clases, reservas, bonos, mi plan,
compras, progreso, perfil, notificaciones, instructoras, invitar, sesión guiada.
**PWA instalable con manifest propio por estudio** y Theme Builder white-label
(temas, paletas, tipografías, bloques de home, variantes de forma, favicon y SEO
propios).

> ⚠️ **No es una app nativa de App Store / Play**. La propia
> `/comparativa/tentare-vs-bsport` lo admite ("la nuestra está en el camino").
> Cualquier página SEO que prometa app nativa contradice a otra página del sitio.

### 1.8 Plataforma — REAL

Multi-sede/cadena con selector de sede y menú por cadena; integraciones
conectables por el estudio: **Stripe, Gmail, WhatsApp Business, Google Calendar,
Kisi (control de acceso), Zoom, Excel import/export** (`app/api/integrations/`);
backups; RLS por estudio; RGPD y datos en la UE (`fra1`); onboarding y tour;
migración asistida en 48 h con acta y rollback.

### 1.9 ⛔ Congelado o apagado — NO usar en SEO

| Módulo | Interruptor |
|---|---|
| Kiosko / check-in en tablet | `RUTAS_CONGELADAS` (`/kiosk`) |
| POS / Caja / TPV | `RUTAS_CONGELADAS` (`/pos`) |
| VOD / Oferta digital / Vídeos del portal | `RUTAS_CONGELADAS` + `PORTAL_VIDEOS_CONGELADO` |
| Comunidad | `RUTAS_CONGELADAS` |
| Chat de equipo | `RUTAS_CONGELADAS` |
| Marketing del estudio + módulo Contenido (redes) | `MARKETING_MODULE_ENABLED = false` |
| Gamificación (retos/logros/niveles) | existe en código y entitlements, pero solo se expone en portal; **verificar antes de venderla** |

Ninguno de estos puede tener página SEO. Publicar una sería prometer algo que un
cliente nuevo no encuentra al entrar.

---

## 2. Auditoría SEO actual

### 2.1 Lo que está bien (y es bastante)

- `metadataBase`, `title`, `description`, `canonical` y Open Graph en **todas** las
  páginas públicas.
- `app/robots.ts` bloquea las zonas privadas de forma exhaustiva — incluidos los
  segmentos del panel que viven en la raíz del route-group `(dashboard)`, que es el
  fallo típico y aquí ya está resuelto.
- JSON-LD amplio y correcto: `Organization`, `WebSite` + `SearchAction`,
  `SiteNavigationElement`, `SoftwareApplication` + `Offer`, `FAQPage`,
  `BreadcrumbList` (4 variantes según profundidad), `Article`, `DefinedTermSet`.
- **19 imágenes Open Graph dinámicas** (`opengraph-image.tsx`).
- Jerarquía de encabezados limpia en la landing: **un solo `<h1>`** (Hero), un `<h2>`
  por sección, `<h3>` dentro. Sin saltos.
- Componentes compartidos ya extraídos (`PageShell`, `SiteNav`, `SiteFooter`,
  `ArticleShell`, `ArticlePrimitives`, `ArticleFaq`) — el andamiaje para páginas
  nuevas ya existe.
- 7 guías en `/recursos`, 7 comparativas 1-vs-1, glosario y `/seguridad`.
- **No hay `aggregateRating` inventado**. Está el TODO explicando por qué. Correcto.
- `lang="es"`, fuentes servidas desde el propio dominio vía `next/font`.

### 2.2 Fallos y huecos

| # | Problema | Impacto | Evidencia |
|---|---|---|---|
| A1 | **Las 7 páginas `/comparativa/tentare-vs-*` NO están en el sitemap.** Existen, tienen metadata, canonical y OG propios. | Alto | `app/sitemap.ts` solo lista `/comparativa` |
| A2 | **Contradicción `/reservar`**: `app/reservar/[slug]/layout.tsx` declara `robots: { index: true }`, pero `app/robots.ts` prohíbe `/reservar`. Google no puede rastrear para leer la etiqueta. | Alto (decisión de producto pendiente) | ambos ficheros |
| A3 | **Cero páginas de funcionalidad.** Todo el producto vive en `/` detrás de anclas. `RECORRIDO_ITEMS` da 1 párrafo por área. | Alto — es el objeto de este plan | `components/landing/data.tsx` |
| A4 | El sitemap incluye 4 URLs con fragmento (`/#precio`, `/#faq`…). Google normaliza el fragmento → 4 entradas duplicadas de `/`. `SiteNavigationElement` ya cubre los sitelinks. | Bajo | `ANCLAS_LANDING` |
| A5 | Ninguna entrada del sitemap tiene `lastModified`. | Bajo | `app/sitemap.ts` |
| A6 | **No existe `/precios`.** El precio es `/#precio`. Consulta de altísima intención sin URL de destino. | Medio-alto | — |
| A7 | La navegación no tiene *hub* de producto: `NAV_LINKS` son 4 anclas + `/recursos`. | Medio | `components/landing/data.tsx` |
| A8 | La columna "Plataforma" del footer tiene **3 etiquetas distintas apuntando al mismo `#recorrido`**. Enlazado interno engañoso. | Medio | `components/landing/Footer.tsx` |
| A9 | Interlinking pobre: las guías enlazan al glosario, pero no hay grafo funcionalidad↔funcionalidad ni funcionalidad↔guía. | Medio | — |
| A10 | No hay `/sobre-tentare`. "Sobre Tentare" del footer apunta a `#top`. Hueco de E-E-A-T para un SaaS que toca dinero y datos de salud. | Medio | `components/landing/Footer.tsx` |
| A11 | Sin `hreflang` ni árbol en inglés — las 11 keywords en inglés del brief hoy son inalcanzables. | Ver §7 | — |
| A12 | `app/page.tsx` es `'use client'` entero. Next.js lo renderiza en servidor (el HTML sí lleva el contenido), pero toda la landing hidrata, más `IntroLogo` y ~20 `Reveal` con `IntersectionObserver`. | Bajo-medio, **sin medir** | `app/page.tsx` |
| A13 | `SoftwareApplication` sin `image` ni `offers.url`. | Bajo | `components/landing/StructuredData.tsx` |

**No verificado**: no se ha consultado Search Console, ni la indexación real, ni
Core Web Vitals de producción. Todo lo anterior sale de leer el repositorio.
Antes de tocar rendimiento habría que medir (regla de este repo: no afirmar
impacto sin medir).

---

## 3. Arquitectura propuesta

Cuatro grupos, como pides — pero **el grupo SOFTWARE no estrena páginas nuevas**:
la home ya es la página de "software para estudios de pilates", con su `<h1>` y su
`SoftwareApplication`. Crear `/software-para-estudio-de-pilates` sería competir
contra la propia home por el mismo término. El grupo SOFTWARE se refuerza con
`/precios` y con las comparativas que ya existen.

```
/                                  SOFTWARE — landing (no se alarga)
/precios                           SOFTWARE — NUEVA, P0
/comparativa  + /comparativa/*     SOFTWARE — ya existe (arreglar sitemap)

/funcionalidades                   FUNCIONALIDADES — hub NUEVO, P0
/funcionalidades/<slug>            12–14 páginas

/soluciones                        SOLUCIONES — hub NUEVO, P1
/soluciones/<slug>                 3–4 páginas

/recursos  + /recursos/<slug>      RECURSOS — ya existe
/glosario                          RECURSOS — ya existe
/seguridad                         RECURSOS — ya existe
/sobre-tentare                     RECURSOS — NUEVA, P2 (E-E-A-T)
```

**Por qué `/funcionalidades/<slug>` y no `/reservas-pilates/` en la raíz** (que es
lo que proponía el brief):

1. Un padre real concentra enlaces internos y da contexto temático a cada hija;
   una lista de slugs planos en la raíz no.
2. Habilita `BreadcrumbList` de 3 niveles, que ya está implementado en este repo.
3. El sufijo `-pilates` repetido en 14 slugs es exactamente el patrón que se lee
   como plantilla. La keyword pesa en el `<h1>` y el contenido, no en la URL.
4. Todo el sitio ya trata de pilates: `/funcionalidades/lista-de-espera` no pierde
   nada frente a `/lista-espera-pilates`.

Si prefieres la forma plana, el contenido no cambia — solo el `path`. Es reversible
mientras no se publique.

---

## 4. Tabla de páginas

Prioridad: **P0** = primer lote, **P1** = segundo, **P2** = tercero o descartable.

### 4.1 Grupo SOFTWARE

| URL | KW principal | KW secundarias | Intención | Funcionalidad real | Pri | Por qué existe | Enlazada desde |
|---|---|---|---|---|---|---|---|
| `/` | software para estudios de pilates | software pilates, programa para gestionar pilates | Comercial | Todo | — | Ya existe. Solo se le añaden enlaces salientes | Nav, footer, todas |
| `/precios` | precio software estudio pilates | software gestión pilates precio, software pilates sin permanencia, cuánto cuesta software pilates | Transaccional | `PLAN_ENTITLEMENTS`, `PLAN_INFO`, `TRIAL_DIAS` | **P0** | Consulta de máxima intención sin URL propia. Permite `Offer` schema con `url` y un snippet de precio | Nav, footer, `/comparativa`, todas las funcionalidades |
| `/comparativa` + 7 hijas | tentare vs bsport / mindbody / momence… | alternativa a mindbody, alternativa española a bsport | Comercial-comparativa | — | **P0 (técnico)** | Ya existen; solo faltan en el sitemap | Footer, `/precios`, `/soluciones/cambiar-de-software` |

### 4.2 Grupo FUNCIONALIDADES

| URL | KW principal | KW secundarias | Intención | Funcionalidad real verificada | Pri | Por qué merece existir | Enlazada desde |
|---|---|---|---|---|---|---|---|
| `/funcionalidades` | funcionalidades software estudio pilates | qué hace un software de gestión de pilates | Investigación | Hub | **P0** | Concentra enlaces y da a Google el mapa del producto | Nav, footer, home, todas las hijas |
| `/funcionalidades/reservas-online` | software de reservas pilates | sistema de reservas pilates, reservas online estudio pilates, pilates booking software | Comercial | `/reservar/[slug]`, RPC `reservar_plaza`, reglas de antelación mín/máx, exigir plan, aprobación manual | **P0** | Es la razón nº1 por la que se busca este software. Hoy son 4 líneas en la home | hub, home, calendario, lista-de-espera, app-para-alumnas, checklist |
| `/funcionalidades/lista-de-espera` | lista de espera pilates | lista de espera automática clases, clase llena pilates, plaza liberada | Comercial | `LISTA_ESPERA`, `promocionar_siguiente_espera`, oferta con plazo (Fase 2b) | **P0** | Intención inequívoca, competencia mínima, y hay profundidad real que contar (el plazo de aceptación, qué pasa si no responde) | reservas, calendario, cancelaciones, glosario |
| `/funcionalidades/calendario-y-salas` | software calendario clases pilates | control de aforo centro deportivo, gestión de salas, capacidad por reformer, horario de clases | Comercial | `lib/calendario-*` (24 módulos), series, arrastre, spots, `aforo-logic` | **P0** | Absorbe "control de aforo": misma intención, no merece página aparte. La capacidad **por reformer** (no por aforo) es diferencial real | hub, reservas, instructoras |
| `/funcionalidades/gestion-de-instructoras` | gestión de instructores pilates | control de horas instructoras, disponibilidad instructoras, nómina instructores pilates | Comercial | roles+RLS, disponibilidad, ausencias, `instructor_tarifas`, liquidaciones, rendimiento, riesgo de dependencia, Tentare Core | **P0** | Segunda área más buscada y con 6 funcionalidades reales detrás | hub, sustituciones, calendario, multi-centro |
| `/funcionalidades/sustituciones` | sustituciones instructoras pilates | cubrir baja instructora, sustituta clase pilates, qué hago si falta una instructora | Comercial | motor completo + 4 niveles de autonomía | **P0** | Es la cuña del producto y nadie más la tiene integrada | home, hub, instructoras, `/recursos/cubrir-baja-instructora` |
| `/funcionalidades/bonos-y-membresias` | bonos de clases pilates | suscripciones pilates, cuotas socios pilates, membresías estudio pilates, plaza fija pilates | Comercial | `/productos`, bonos, planes por tipo de clase, plazas fijas + recuperaciones, códigos de descuento | **P0** | Tres keywords de la lista caen aquí. Plazas fijas y recuperaciones son vocabulario español que los competidores anglosajones no modelan | hub, cobros, reservas |
| `/funcionalidades/cobros-recurrentes` | cobro recurrente pilates | cobrar cuotas socios automáticamente, domiciliación SEPA gimnasio, pasarela de pago estudio pilates, impagos | Comercial | Stripe Connect, off-session, dunning, SEPA 19.14, reembolsos, conciliador | **P0** | Dolor operativo nº1 ("perseguir a la gente"). SEPA 19.14 no lo tiene ningún competidor anglosajón | hub, bonos, facturación, precios |
| `/funcionalidades/facturacion` | facturación centro pilates | facturación Veri\*factu gimnasio, ley antifraude estudio deportivo, software facturación pilates | Comercial | numeración, Veri\*Factu huella+QR, Fiskaly SIGN ES, cierre de año, IVA | **P0** | **El foso real en España.** Y hay una guía informacional que ya posiciona y puede alimentarla | hub, cobros, `/recursos/facturacion-electronica-verifactu`, `/comparativa` |
| `/funcionalidades/ficha-de-clienta` | crm para pilates | ficha de alumno pilates, gestión de clientes pilates, historial de alumnas, fidelización clientes pilates | Comercial | ficha completa, notas de progreso, Ficha Clínica Operativa, consentimiento, mensajería, libreta | **P0** | "crm para pilates" es prioridad alta en tu lista. La ficha clínica es diferencial fuerte y **hay que describirla con cuidado** (ayuda operativa, no historia clínica) | hub, automatizaciones, app-para-alumnas |
| `/funcionalidades/automatizaciones-y-avisos` | automatización recordatorios whatsapp pilates | recordatorios automáticos de clase, recuperar alumnas inactivas, avisos automáticos gimnasio | Comercial | Notification Engine multicanal + 17 triggers verificados + radar de ocupación 48 h | **P1** | Los 17 triggers son contenido concreto, no humo. **Nada de "campañas de marketing"**: ese módulo está apagado | hub, ficha-de-clienta, informes |
| `/funcionalidades/informes-y-rentabilidad` | informes rentabilidad centro pilates | análisis ocupación clases, rentabilidad estudio pilates, qué clases dan dinero, kpis estudio pilates | Comercial | informes completos + margen por clase con tarifa real + Decision OS | **P1** | Dos keywords de tu lista. El margen por clase cruzando tarifa real de instructora es raro en el sector | hub, instructoras, `/recursos/ocupacion-clases-valle` |
| `/funcionalidades/app-para-alumnas` | app para centro de pilates | portal del alumno pilates, app de marca estudio pilates, app reservas socias, white label | Comercial | portal `/portal/[slug]` PWA instalable, Theme Builder, push, progreso | **P1** | Keyword de tu lista. **Debe decir "app de marca instalable (PWA)"**, no app nativa | hub, reservas, ficha-de-clienta |
| `/funcionalidades/cancelaciones-y-politicas` | cancelación de clases pilates | política de cancelación estudio, penalización no show, ventana de cancelación | Comercial | 13 reglas (Fases 1/2a/2b/2c/3), penalizaciones con guard de consentimiento | **P1** | Keyword de tu lista y hay contenido con profundidad de verdad (las 13 reglas). Si al redactar no llega a página propia, se funde en `reservas-online` | hub, reservas, lista-de-espera, `/recursos/reducir-cancelaciones-ultima-hora` |
| `/funcionalidades/control-de-asistencia` | control de asistencia pilates | check-in clases, no shows pilates, control de acceso gimnasio | Comercial | `ASISTIDA`/`NO_ASISTIO`, pase QR, barrido nocturno, integración Kisi | **P2** | Keyword de tu lista, pero **el kiosko de tablet está congelado**. La funcionalidad es más fina de lo que la keyword promete. O se escribe honesta, o no se escribe | hub, calendario, cancelaciones |
| `/funcionalidades/multi-centro` | software para cadena de estudios pilates | gestionar varios centros pilates, multi sede gimnasio | Comercial | cadena, sede activa, menú por cadena, instructora multi-sede, plan Cadena | **P2** | Volumen bajo, ticket alto (149 €/mes). Absorbe `/soluciones/cadena-de-centros` | hub, precios, instructoras |

### 4.3 Grupo SOLUCIONES

| URL | KW principal | KW secundarias | Intención | Real | Pri | Por qué | Enlazada desde |
|---|---|---|---|---|---|---|---|
| `/soluciones/cambiar-de-software` | cambiar de software de gestión gimnasio | migrar de mindbody, exportar datos bsport, alternativa española a momence | Transaccional | `/migracion`, importadores CSV, migración 48 h con acta y rollback | **P1** | La intención más rentable del embudo: alguien que ya paga a otro. Conecta con las 7 comparativas que ya existen | `/comparativa/*`, home, precios |
| `/soluciones/estudio-de-yoga` | software gestión estudio yoga | plataforma reservas yoga, app para centro de yoga | Comercial | `DISCIPLINAS` incluye yoga; tipos de clase, bonos, salas | **P1** | Mercado adyacente real con keywords propias. **Riesgo alto**: si es un buscar-y-reemplazar de "pilates"→"yoga" es una doorway. Debe hablar de talleres, series y pases de yoga de verdad | hub soluciones, home |
| `/soluciones/centro-multidisciplinar` | software gimnasios y pilates | software centro boutique fitness, gestión centro multidisciplinar | Comercial | 11 disciplinas en `DISCIPLINAS`, multi-sala, tipos de clase | **P2** | Keyword de tu lista. Menor prioridad: el mensaje diluye el posicionamiento vertical, que es el foso | hub soluciones |
| `/soluciones/estudio-nuevo` | abrir estudio de pilates gestión | montar estudio de pilates software, empezar estudio pilates | Informacional-comercial | onboarding, primeros pasos, plan Base 29 € | **P2** | Público con intención pero sin presupuesto todavía. Mejor como guía en `/recursos` que como solución | hub soluciones, `/recursos` |
| `/sobre-tentare` | quién está detrás de tentare | tentare opiniones, tentare España | Marca / E-E-A-T | `LEGAL`, equipo, "hecho en España" | **P2** | Un SaaS que toca dinero y datos de salud sin página de "quiénes somos" pierde confianza y señal de E-E-A-T | footer (arregla el `#top` muerto), seguridad, legal |

### 4.4 Páginas descartadas — y por qué

| Descartada | Motivo |
|---|---|
| `/software-para-estudio-de-pilates` | Canibaliza directamente la home, que ya es esa página con ese `<h1>` |
| `/soluciones/estudio-de-pilates` | Lo mismo. El "quién" por defecto de Tentare es un estudio de pilates |
| `/reservas-pilates` **y** `/software-de-reservas-pilates` como dos páginas | Misma intención de búsqueda → una sola página |
| `/kiosko-pilates`, `/tpv-estudio-pilates`, `/videos-on-demand`, `/comunidad` | Módulos **congelados** (`lib/frozen-features.ts`) |
| `/marketing-para-estudios-de-pilates` | `MARKETING_MODULE_ENABLED = false`. Solo se pueden vender automatizaciones y avisos |
| `/software-pilates-madrid`, `-barcelona`, `-valencia`… | **Doorway pages puras.** No hay contenido específico por ciudad y no lo habrá. Es la propuesta más tentadora del sector y la más peligrosa |
| `/pilates-reformer`, `/clases-de-pilates`, `/pilates-para-embarazadas` | B2C. No convierten en cliente de Tentare |
| `/esterilla-pilates`, ropa, accesorios | Fuera por completo |
| Árbol `/en/` en inglés | Ver §7, riesgo R9 |
| `/soluciones/cadena-de-centros` | Misma intención que `/funcionalidades/multi-centro`. Se funden en una |

**Total propuesto: 20 páginas nuevas** (8 en P0), no 30–50. El objetivo no es
número de URLs.

---

## 5. Conflictos de keywords a resolver antes de escribir

| Conflicto | Resolución |
|---|---|
| home ↔ `/soluciones/estudio-de-pilates` | No se crea la segunda |
| `/funcionalidades/sustituciones` ↔ `/recursos/cubrir-baja-instructora` | La guía es **informacional** ("cómo se hace esto en cualquier estudio"), la funcionalidad es **comercial** ("cómo lo hace Tentare"). `<h1>` distintos, sin `<h2>` repetidos, enlace cruzado explícito en ambas |
| `/funcionalidades/facturacion` ↔ `/recursos/facturacion-electronica-verifactu` | Misma división. La guía explica la ley; la funcionalidad enseña el producto |
| `/funcionalidades/informes-y-rentabilidad` ↔ `/recursos/ocupacion-clases-valle` | Misma división |
| `/funcionalidades/cancelaciones-y-politicas` ↔ `/recursos/reducir-cancelaciones-ultima-hora` | Misma división |
| "control de aforo" | Dentro de `calendario-y-salas`, sin página propia |
| "bonos" vs "cuotas" vs "suscripciones" | Productos distintos, **misma pregunta del propietario** ("cómo cobro lo que me pagan"). Una página con dos secciones |
| "lista de espera" vs "clase llena" | Una página |
| `/precios` ↔ `/#precio` | `/precios` es canónica; la home mantiene su bloque resumido y enlaza "Ver planes en detalle" |

---

## 6. Prioridades

**P0 — lote 1 (11 entregables)**
Técnico: (1) comparativas al sitemap, (2) resolver la contradicción `/reservar`,
(3) registro tipado de páginas + test que impida repetir el fallo del sitemap.
Páginas: `/precios`, `/funcionalidades`, `reservas-online`, `lista-de-espera`,
`calendario-y-salas`, `gestion-de-instructoras`, `sustituciones`,
`bonos-y-membresias`, `cobros-recurrentes`, `facturacion`, `ficha-de-clienta`.
Más: nav + footer reescritos, y los enlaces salientes de la home (§9).

**P1 — lote 2**
`automatizaciones-y-avisos`, `informes-y-rentabilidad`, `app-para-alumnas`,
`cancelaciones-y-politicas`, `/soluciones` (hub), `cambiar-de-software`,
`estudio-de-yoga`.

**P2 — lote 3**
`control-de-asistencia`, `multi-centro`, `centro-multidisciplinar`,
`estudio-nuevo`, `/sobre-tentare`, 2–3 guías nuevas en `/recursos` que alimenten
las funcionalidades.

---

## 7. Riesgos SEO

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Canibalización home ↔ página de "software para estudio de pilates" | No se crea esa página. §5 |
| R2 | Canibalización funcionalidad ↔ guía (4 pares reales) | División informacional/comercial declarada, `<h1>` y `<h2>` distintos, enlaces cruzados |
| R3 | **Thin content / plantilla detectable**: 14 páginas con Hero→Problema→Cómo funciona→FAQ→CTA se lee como generada | Cada página lleva **al menos un bloque único e irrepetible**: la tabla de las 13 reglas, el diagrama del motor de sustituciones, el desglose del margen por clase, el flujo SEPA… |
| R4 | Doorways por ciudad o por disciplina | Cero páginas por ciudad. Máximo 2 disciplinas, con contenido específico verificable |
| R5 | Afirmaciones no verificables (nº de estudios, volumen procesado, ratings) | El repo ya es disciplinado (`aggregateRating` sigue como TODO a propósito). Mantener: **cero cifras sin fuente** |
| R6 | Prometer módulos congelados (kiosko, POS, VOD, comunidad, marketing) | Lista §1.9 como veto duro al redactar |
| R7 | Prometer app nativa | El propio sitio ya dice que no la hay. "App de marca instalable (PWA)" |
| R8 | Degradar CWV con 20 páginas nuevas | Las nuevas van como **Server Components**; `Reveal` solo donde aporte; nada de `IntroLogo`. Medir antes y después, no asumir |
| R9 | **Inglés**: las 11 keywords en inglés del brief apuntan a un mercado que Tentare no sirve — precios en euros, Veri\*Factu, SEPA español, soporte en español, panel solo en español. "pilates studio software" lo copan Mindbody/Momence con autoridad enorme | Fuera de alcance en esta fase. Si algún día entra, es un proyecto propio con `hreflang`, `/en/` y decisión previa de ICP — no una traducción |
| R10 | Sitemap que se vuelve a desincronizar (ya pasó con `/comparativa/*`) | Registro tipado único + test que falle si una página pública no está listada |
| R11 | Ficha clínica descrita como historia clínica médica | El propio código lo acota ("no diagnostica ni prescribe"). Copiar ese encuadre literal |
| R12 | Un merge de solo `docs/**` no despliega (`vercel.json` `ignoreCommand`) y el check sale verde igual | Este documento no despliega nada. Al publicar páginas se tocará `app/`, así que no aplica — pero conviene recordarlo |

---

## 8. Implementación técnica recomendada

**Registro único de páginas** — `lib/seo/paginas.ts`:
`{ path, titulo, descripcion, grupo, prioridad, changeFrequency, relacionadas[] }`.
Alimenta el sitemap, los breadcrumbs, el hub `/funcionalidades`, el footer y el
bloque "relacionadas" de cada página. Un solo sitio donde dar de alta una URL.

**Sitemap** — derivarlo de ese registro; **quitar** las 4 anclas; **añadir**
`lastModified` y las 7 comparativas.

**Test de no-regresión** — `lib/seo/paginas.test.ts` con `node --test
--experimental-strip-types` (convención del repo): toda `page.tsx` pública bajo
`app/` que no esté en la lista de `disallow` de `robots.ts` debe figurar en el
registro. Esto cierra la clase de fallo A1, no solo el caso.

**Componentes** — nuevos en `components/funcionalidades/`: `FeatureHero`,
`BloqueProblema`, `ComoFunciona`, `CapturaProducto`, `FeatureFaq` (reusa
`ArticleFaq`), `RelacionadasGrid`. Reutilizan `PageShell`, `SiteNav`, `SiteFooter`
y `ArticlePrimitives` ya existentes → cero deriva respecto a la identidad actual.

**JSON-LD** — nuevo `FeatureStructuredData` con `BreadcrumbList` de 3 niveles +
`WebPage`. **No repetir `SoftwareApplication` en cada funcionalidad**: es la misma
entidad y Google lo lee como duplicado. Se queda en `/` y `/precios` (allí con
`Offer.url`). `FAQPage` solo donde haya FAQ real en pantalla.

**`/precios`** — extraer `components/landing/Precio.tsx` a componente compartido;
la home conserva su bloque y añade "Ver planes en detalle →".

**Navegación** — `NAV_LINKS` gana `Funcionalidades` y `Precios`. Efecto colateral
gratis: `NAV_LINKS` alimenta `SiteNavigationElement`, así que el JSON-LD de
sitelinks mejora solo.

**Footer** — sustituir los 3 `#recorrido` de la columna "Plataforma" por enlaces
reales a funcionalidades; añadir columna "Soluciones"; arreglar "Sobre Tentare".

**Open Graph** — `opengraph-image.tsx` por funcionalidad reusando `lib/og-image.tsx`.

**Rendimiento** — páginas nuevas como Server Components. Medir con Lighthouse
antes/después; no afirmar mejora sin medir.

**Robots** — sin cambios salvo resolver A2 (`/reservar`), que es una decisión de
producto, no técnica.

---

## 9. La landing principal: qué cambia (poco)

No se alarga. Solo:
1. `Funcionalidades` y `Precios` en el menú.
2. Al final de `Recorrido`, un enlace "Ver todas las funcionalidades →" a `/funcionalidades`.
3. Cada uno de los 7 `RECORRIDO_ITEMS` gana **un enlace** a su funcionalidad. Sin
   texto nuevo.
4. Footer reescrito (columna Plataforma con enlaces reales + columna Soluciones).
5. `Precio` enlaza a `/precios`.

Cero secciones nuevas. Cero párrafos nuevos.

---

## 10. Decisiones que necesito antes de escribir código

1. **URLs**: `/funcionalidades/<slug>` (recomendado) o plano `/reservas-pilates/`.
2. **`/reservar/[slug]`**: ¿indexable? Hoy el código dice sí y `robots.txt` dice no.
   Abrirlo trae tráfico B2C local por estudio, a cambio de miles de URLs finas y de
   una decisión de privacidad por estudio.
3. **Inglés**: ¿confirmas que queda fuera de esta fase?
4. **Disciplinas**: ¿solo yoga, o también multidisciplinar?
5. **Capturas de producto**: ¿capturas reales del panel anonimizadas (`studio-1`
   está sembrado) o mockups vectoriales?
6. **Entrega**: ¿un PR con todo el lote P0, o página a página para revisar tono?

---

## 11. Lo que se implementó de verdad (2026-08-11)

### 11.1 Doce URLs nuevas, todas en el sitemap y todas enlazadas

`/precios` · `/funcionalidades` · y las diez de `/funcionalidades/<slug>`:
`reservas-online`, `lista-de-espera`, `calendario-y-salas`,
`gestion-de-instructoras`, `sustituciones`, `bonos-y-membresias`,
`cobros-recurrentes`, `facturacion`, `ficha-de-clienta`,
`automatizaciones-y-avisos`.

Cada una con `title`/`description` únicos, canonical propio, Open Graph, imagen
OG generada, `BreadcrumbList` de tres niveles, `WebPage`, `FAQPage` donde hay
FAQ real, y un bloque visual propio que no se repite en ninguna otra
(rejilla de reformers, cadencia de reintentos, cadena de huellas, ciclo de la
oferta de lista de espera, tabla de reglas, semáforo de la ficha de salud,
disponibilidad semanal, cuatro modelos de cobro, motor de sustituciones).

### 11.2 Tres correcciones que la auditoría no había visto

1. **Ocho rutas del panel eran rastreables.** `A-18` había arreglado el fallo
   grande (las páginas del route-group `(dashboard)` viven en la raíz), pero la
   lista de `robots.ts` se mantenía a mano y se quedó corta: `/cierre`,
   `/contenido`, `/explorar-funciones`, `/libreta`, `/mi-perfil`, `/migracion`,
   `/primeros-pasos` y `/sustituciones` seguían abiertas. Añadidas, junto con
   las cinco rutas de enlace firmado (`/valorar`, `/no-puedo`, `/disponibilidad`,
   `/confirmar-reserva`, `/aceptar-sustitucion`). El test
   `lib/seo/paginas.test.ts` recorre `app/(dashboard)` y falla si vuelve a
   quedarse una fuera.
2. **`/seguridad` saltaba de `h1` a `h3`** sin ningún `h2` intermedio. Las tres
   tarjetas de primer nivel suben a `h2` (el tamaño va en el `style`, así que no
   cambia nada visualmente).
3. **La premisa de los «17 disparadores» era falsa.** Se comprobó antes de
   escribir la página: los 10 de `TriggerAutomatizacion` solo se configuran
   desde `/marketing`, que está apagado (`MARKETING_MODULE_ENABLED = false`).
   Lo que un estudio puede encender hoy son **7 reglas**
   (`TRIGGERS_IMPLEMENTADOS`) más **37 tipos de aviso** del motor de
   notificaciones por 5 canales. La página se escribió sobre eso.

### 11.3 Decisiones aplicadas

- **`/reservar/[slug]` deja de ser indexable.** Antes el layout declaraba
  `index: true` y `robots.txt` prohibía `/reservar` — se contradecían. Ahora las
  dos puertas dicen lo mismo y hay que tocar las dos para reabrirlas.
- **Sin árbol en inglés.** Sigue documentado como fase futura en §7 (R9).
- **Sin páginas de disciplina.** Yoga queda como P1 sin construir; no se ha
  inventado ninguna funcionalidad específica de yoga.
- **Registro único** `lib/seo/paginas.ts` alimentando sitemap, breadcrumbs,
  hub, relacionadas y footer, con 13 tests.

### 11.4 Páginas propuestas y NO publicadas, con el motivo

(`informes-y-rentabilidad` salió en el segundo lote — §12. `cancelaciones-y-politicas`
y `app-para-alumnas`, en el tercero — §13.)

| Página | Motivo |
|---|---|
| `/funcionalidades/control-de-asistencia` | El kiosko de tablet está congelado. La funcionalidad real (estados de asistencia + pase QR) es más fina de lo que promete la keyword |
| `/funcionalidades/multi-centro` | Volumen bajo; el plan Cadena ya se explica en `/precios` |
| `/soluciones/*` y `/sobre-tentare` | Fuera del P0 acordado |

### 11.5 Límite de verificación

**No hay capturas reales del producto en estas páginas.** Obtenerlas requiere
una sesión autenticada del panel y no hay credenciales de prueba en este
entorno — la misma limitación que ya arrastran otras fases de este repo. Lo que
se ha construido en su lugar son diagramas derivados del código real (cada
fichero de `components/funcionalidades/visuales/` cita en cabecera de dónde sale
cada dato), que era además lo que pedía el encargo para los cinco bloques
únicos. Cuando haya credenciales, las capturas pueden sustituir o acompañar a
esos diagramas sin tocar la estructura.

### 11.6 Comprobaciones ejecutadas

`npx tsc --noEmit` · `npm run lint` (0 avisos) · `npm test` (**2380 en verde**)
· `next build` (267 páginas, las 12 nuevas estáticas) · auditoría sobre el HTML
servido de 17 páginas: title, description, canonical, OG, `h1` único, jerarquía
de headings, JSON-LD parseable, 42 enlaces internos sin roto, cero huérfanas,
cero duplicados de title/description, sitemap sin fragmentos ni duplicados,
robots correcto en ambos sentidos · solape máximo de `h2` entre pares
potencialmente canibalizables: **29 %**, y solo en encabezados estructurales
· sin desbordamiento horizontal en 360, 375, 768 y 1280 px.


---

## 12. Segundo lote: `/funcionalidades/informes-y-rentabilidad`

Se publicó en cuanto tuvo el bloque que le faltaba: **el cálculo real del margen
por clase**, que es lo único que la separa de una lista de KPIs genérica.

### 12.1 De dónde sale cada cifra

Todo lo que pinta la página está en `lib/decision/margen-clase.ts`:

| Concepto | Fórmula real |
|---|---|
| Ingreso de una asistente con **bono** | precio del bono ÷ sesiones |
| Ingreso de una asistente con **cuota mensual** | precio ÷ (frecuencia real semanal × 4,33) |
| Ingreso de una asistente con **clase suelta** | precio del plan |
| Sin plan que cubra esa clase | `sesion.precioPuntual`, si lo tiene |
| Coste | tarifa/hora de la instructora × duración real de la sesión |
| Margen | ingreso imputado − coste de instructora |
| Punto de equilibrio | `ceil(coste ÷ precio medio por sesión del estudio)` |

El reparto de la cuota mensual **por frecuencia real** es la parte que hace útil
el número: dos alumnas con la misma mensualidad aportan importes distintos a la
misma clase según cuántas veces vengan al mes. Es exactamente lo que un ingreso
mensual agregado esconde.

### 12.2 Los cuatro límites, dichos en la propia página

Están en el código y ahora también en la web, en un bloque propio:

1. **No hay coste de sala** en el esquema — por eso la cifra se llama siempre
   «margen sobre coste de instructora», nunca «margen total» ni «beneficio».
2. **Instructora sin tarifa fijada → «—», no cero.** Un cero falsearía el margen
   al alza y haría parecer rentable una clase sin medir.
3. **Una clase suelta cobrada en mostrador no suma ingreso** a esa sesión: el
   recibo no queda ligado a la clase y casarlo por fecha sería una heurística
   frágil.
4. **Un no-show no cuenta como ingreso** — el informe lo trata como señal de
   retención, que es otra pregunta.

⚠️ En el ejemplo de la página, el **punto de equilibrio no se puede cuadrar con
los seis asistentes de la tabla**: se calcula sobre el precio medio por sesión
del ESTUDIO, no sobre la mezcla de planes de esa clase concreta. La etiqueta lo
dice para que nadie intente reconciliarlo.

### 12.3 Interlinking

- `gestion-de-instructoras` pasa a enlazarla (la tarifa es la mitad del cálculo).
- El módulo 06 de la landing (*Panel de control y métricas*) era el único de los
  siete sin `href`; ahora lo tiene.
- Nuevo bloque en el hub: «Que las decisiones no sean a ojo».
- Enlaza a `/recursos/ocupacion-clases-valle` (la guía táctica) y a
  `/funcionalidades/facturacion` (cierre de año).

### 12.4 Verificado

`tsc` · `lint` sin avisos · **2380 tests** · `build` de **269 páginas** · la
auditoría sobre HTML servido pasa a **18 páginas, 36 URLs de sitemap y 43
enlaces internos**, sin fallos · solape de `h2` con sus cuatro vecinas más
cercanas: **25 % máximo**, solo estructurales · sin desbordamiento en
360/375/768/1280 px.

Con esto, el P0 queda cerrado en **13 URLs nuevas**.


---

## 13. Tercer lote: `cancelaciones-y-politicas` y `app-para-alumnas`

Las dos estaban aplazadas por la misma clase de motivo —una por riesgo de
solaparse, la otra por riesgo de sobreprometer— y las dos se resuelven
delimitando de qué habla cada una.

### 13.1 `/funcionalidades/cancelaciones-y-politicas`

El riesgo era duplicar `reservas-online` (que ya lista las siete reglas
heredables) y `lista-de-espera` (que ya explica el hueco que se libera). Se
resuelve dejando aquí **solo lo que pasa DESPUÉS de que alguien se caiga**:
qué ocurre con su bono, con la plaza y —opcionalmente— con su tarjeta.
Ninguna de las otras dos toca eso.

El bloque único es la **tabla de qué pasa con el bono**, con los seis casos que
el código distingue de verdad:

| Caso | Bono | Fuente |
|---|---|---|
| Cancela dentro de plazo | Se devuelve | `cancelar_reserva_plaza`, decisión en BD (migr 0129) |
| Cancela fuera de plazo | No, salvo `cancelacion_devolver_bono_tardia` | mismo |
| No-show | Ya consumido | — |
| Cancela una plaza fija | No devuelve bono, genera **recuperación** | guard `res-pf-`: nunca consumió sesión |
| Cancelas tú la clase | No se devuelve | `dbCancelarReservasPorSesiones` |
| La clase se cae por mínimo | **Sí, siempre** | `cancelarSesionPorMinimoNoAlcanzado` |

Las dos últimas filas son la distinción que hace útil la tabla: si cancelas tú,
es tu decisión; si la clase no llega al mínimo, no es decisión de nadie y no
puede pagarla la alumna.

Segundo bloque propio: **la máquina de estados de la penalización**
(`EstadoPenalizacion`), con las tres razones por las que el sistema decide NO
cobrar —sin tarjeta, sin consentimiento vigente, revertida— pintadas como
estados de primera clase y no como una nota. Y el guard de consentimiento
explicado como lo que es: se guarda **el texto legal completo aceptado**, no un
número de versión, así que activar la cláusula deja sin consentimiento vigente a
toda la base existente de forma automática.

También se dice explícitamente que hay cancelaciones que **no pueden penalizar
por construcción** (corte por riesgo de plantón, cancelación de serie desde el
panel): no pasan por el camino que detecta penalizaciones.

### 13.2 `/funcionalidades/app-para-alumnas`

El riesgo era prometer app nativa. Se resuelve **poniendo la limitación en el
centro** en vez de esconderla en una nota: hay una tabla propia,
*«Instalable desde el navegador vs. app de tienda»*, con siete filas y un «No»
en rojo en la que importa (App Store / Play). El texto lo remata: «Si tener
presencia en las tiendas es un requisito para ti, es honesto que lo sepas antes
de contratar y no después», enlazando a la comparativa donde ya se admitía.

Segundo límite dicho en su propio bloque: **en iPhone los avisos exigen tener la
PWA instalada e iOS 16.4+** (condición de Apple, no nuestra). En Android
funcionan sin instalar.

El resto es real y verificado: manifest **por estudio** (nombre, color y logo del
estudio, `scope` anclado a su slug), ocho pantallas del portal, cuatro temas base
con paleta/tipografía/forma/bloques y comprobación de contraste, y las
sugerencias personalizadas de `lib/portal-sugerencias.ts` — que devuelven `null`
cuando no hay ningún hecho del historial que las sostenga, en vez de recomendar
al azar.

### 13.3 Interlinking rehecho

Se reencaminaron `relacionadas` para que las nuevas reciban enlaces temáticos y
ninguna pierda los suyos: `reservas-online` → lista-de-espera · cancelaciones ·
app-para-alumnas; `lista-de-espera` → reservas · cancelaciones · calendario.
El enlace a la app de marca que en el primer lote se había quitado del cuerpo de
`reservas-online` (apuntaba a una página inexistente) queda restaurado.

Hub: `cancelaciones` entra en «Que las clases se llenen» y `app-para-alumnas`
en «Que nadie se te escape».

### 13.4 Verificado

`tsc` · `lint` sin avisos · **2380 tests** · auditoría sobre HTML servido
ampliada a **20 páginas, 38 URLs de sitemap y 45 enlaces internos**, sin fallos
· solape de `h2` en los siete pares de riesgo (incluido
`cancelaciones` ↔ `reservas-online` y ↔ la guía de cancelaciones):
**29 % máximo**, y solo en encabezados estructurales · sin desbordamiento en
360/375/768/1280 px.

**El P0 queda cerrado en 15 URLs nuevas.** Siguen sin publicar
`control-de-asistencia`, `multi-centro`, `/soluciones/*` y `/sobre-tentare`.

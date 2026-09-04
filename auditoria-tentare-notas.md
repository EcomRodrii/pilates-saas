# Notas de trabajo — Auditoría de producto Tentare

Repo: https://github.com/EcomRodrii/pilates-saas (rama `main`)
Rol: PM Senior + UX/Product Designer + Full-Stack Engineer + QA Senior
Estado: COMPLETA — ver `auditoria-tentare-final.md` para el informe final

---

## FASE 1 — MAPA DEL PRODUCTO

### 1.A — Rutas, roles y navegación

**Contextos de marca/producto (`app/`)**
- **Panel de gestión** — `app/(dashboard)/...`, shell `components/layout/dashboard-shell.tsx`. Usuarios: PROPIETARIO/MANAGER/RECEPCION/INSTRUCTOR (misma app, gateada por rol). Se percibe como dos productos: `nombreAppPorRol()` en `lib/permisos-reglas.ts` → "Tentare Core" (INSTRUCTOR) vs "Tentare Manager" (resto).
- **Portal de la alumna** — `app/portal/[slug]/...` (login/home/reservas/bonos/compras/comunidad/documentos/mensajes/perfil/progreso/...). PWA instalable por estudio (`manifest.webmanifest`). `app/portal-preview/[slug]/...` = vista previa para la propietaria.
- **Reserva pública sin login** — `app/reservar/[slug]/page.tsx`, componentes `components/reserva/*`, widget embebible `app/widget-bundle`.
- **Landing/marketing** — raíz, `/precios`, `/funcionalidades/*` (16), `/comparativa/tentare-vs-*` (13), `/soluciones`, `/recursos` (9 SEO), `/glosario`, `/demo`, `/ayuda/[categoria]/[articulo]`, `/seguridad`.
- **Alta de estudio** — `/crear-estudio`.
- **Backoffice interno** — `app/interno/...` (staff Tentare, no del estudio cliente), APIs en `app/api/interno/*`.
- **Kiosko** — `app/kiosk/[slug]` — **CONGELADO**.
- **Red/marketplace de instructoras** — pública/autoservicio: `app/network/...` (cuenta independiente por `auth_user_id`, sin `studio_id`); buscador para el estudio: `app/(dashboard)/network/...` (PROPIETARIO/MANAGER/RECEPCION).
- Flujos públicos con token: `/confirmar-reserva/[token]`, `/disponibilidad/[token]`, `/no-puedo/[token]`, `/valorar/[token]`, `/aceptar-sustitucion/[token]`, `/invitacion`, `/clave-nueva`.
- `app/tema-publicado/[slug]/[[...ruta]]` (theme editor output), `app/oauth/authorize`, `app/i/[slug]`.

**Roles (`lib/permisos-reglas.ts`, `lib/types.ts:5`)**: `PROPIETARIO | INSTRUCTOR | RECEPCION | MANAGER`.
- PROPIETARIO: todo lo no congelado.
- MANAGER: operativo + equipo, SIN dinero (bloqueado `/cobros /cierre /transacciones /facturas /pagos /notificaciones /marketing /contenido /automatizaciones /informes /configuracion /centro-de-control /clientas/importar/membresias`).
- RECEPCION: mostrador (SÍ cobra), sin config/marketing/informes/equipo/automatizaciones/centro-de-control/notificaciones.
- INSTRUCTOR: lista blanca `['/dashboard','/calendario','/citas','/clientas','/mensajeria','/mi-perfil','/comunidad']`, con excepciones bloqueadas de importación.
- **Forma del sistema — doble capa, documentada en el propio código**: `lib/permisos-reglas.ts` son funciones puras (barrera de UI, "su único trabajo es no enseñar un botón que la BD va a rechazar" — cita literal) + RLS de Supabase/checks de servidor como cerradura real (con referencias cruzadas a migraciones concretas en los comentarios). `lib/permisos.ts` reexporta para cliente. Separación deliberada para testear reglas puras con `node --test` sin Supabase.
- Función central: `puedeVer(rol, path)`.

**Navegación del panel (`lib/nav-config.ts`, fuente única para sidebar/topbar/menú móvil/⌘K)**:
- Sueltos: `/centro-de-control`, `/dashboard`, `/automatizaciones`, `/marketing`.
- Clases: `/calendario`, `/citas`. Clientas: `/clientas`, `/mensajeria`, `/comunidad`, `/chat`. Ventas: `/cobros`, `/pos`, `/productos`. Estudio: `/equipo`, `/sustituciones`, `/network/buscar`, `/ondemand`, `/informes`, `/cierre`, `/libreta`, `/migracion`, `/configuracion`, `/suscripcion`.
- Filtros en cascada: `OCULTOS_MARKETING` (si `MARKETING_MODULE_ENABLED=false`), `esRutaCongelada` (quita `/pos /ondemand /chat /kiosk`), `bottomNavItems` móvil (`/dashboard /calendario /clientas /cobros`), modo "Esencial" (`ESSENTIAL_HREFS`), `NO_OCULTABLES` (`/dashboard /configuracion /suscripcion`).

**Acciones críticas — ubicación**:
- Crear reserva: `app/(dashboard)/calendario/page.tsx` (3026 líneas) + `components/calendario/*`; pública: `app/reservar/[slug]/page.tsx` → `app/api/reservas/*`; portal: `app/portal/[slug]/reservas/page.tsx`.
- Cobrar: `app/(dashboard)/cobros/page.tsx` + `components/cobros/*`; online `app/api/cobros/cobrar-online/route.ts`; pasarela `app/api/stripe/*`, `app/api/terminal/*`.
- Alta de alumna: `app/(dashboard)/clientas/page.tsx` (1631 líneas), modal inline ~L1248. Entidad = `Socio` (no "Alumna") en `lib/types.ts`. Importación masiva: `app/(dashboard)/clientas/importar/`.
- Cancelar clase: `cancelarSesion()` en calendario (~L1218) → `cancelarReservasDeSesiones` → aviso vía `app/api/clases/avisar-cancelada/route.ts` (orden: avisa ANTES de cancelar, según el propio comentario).
- Sustituciones: `app/(dashboard)/sustituciones/page.tsx` (1255 líneas). APIs `app/api/sustituciones/*`. Motor de candidatas: `lib/network/candidatos-sustitucion.ts` (distingue internas vs Tentare Network, sin fusionar ranking). Aceptación pública: `app/aceptar-sustitucion/[token]` → `app/api/public/aceptar-sustitucion/`. UI: `components/calendario/cobertura-dialog.tsx`.

**Feature freeze (`lib/frozen-features.ts`, desde 2026-07-23, fase PMF)**:
- Congelado: `/kiosk`, `/pos`, `/ondemand` (incluye "Vídeos" del portal), `/chat` (RLS roto + "no es la cuña").
- `esRutaCongelada()` filtra TODO (menú, móvil, editor de menú, ⌘K, guardia de rutas) + stubs de servidor (`page.frozen.tsx`) para no pintar ni un instante.
- Comunidad NO congelada (reactivada explícitamente, "Community & Messaging OS").
- `PORTAL_VIDEOS_CONGELADO=true` — interruptor aparte para el lado consumidor de VOD.
- Independiente de `MARKETING_MODULE_ENABLED`.
- Nota técnica: reactivar `/chat` exige re-añadir `mensajes_equipo` a la publicación Realtime (se quitó por coste de CPU en BD, migr `20260806150000`) — si no, no da error pero no llegan mensajes en vivo.
- Detalle completo: `docs/FEATURE-FREEZE-2026-07.md`.

---

### 1.D — Estado real de RLS en producción (verificado, no leído de migraciones)

**Advisors de seguridad activos (`get_advisors`, 2026-08-31): 77 lints.**
- WARN — 10 funciones `SECURITY DEFINER` ejecutables por `anon` (helpers `puede_*`, `studio_id_por_slug`, protectores `red_*`).
- WARN — 39 funciones `SECURITY DEFINER` ejecutables por `authenticated` (helpers RLS + RPCs de negocio invocadas directo por cliente: `reservar_plaza`, `cancelar_reserva_plaza`, `aceptar_oferta_lista_espera`, `crear_recuperacion`, `consumir/devolver_sesion_bono`, `congelar/descongelar_suscripcion`, `editar_serie_desde`, `resolver_reserva_pendiente`, `reservar_cita`, `ajustar_creditos/stock`, `abrir_conversacion`, `mis_estudios`, `semaforo_salud_estudio`, `tiene_consentimiento_salud`, etc.)
- WARN — `auth_leaked_password_protection` deshabilitado (check HaveIBeenPwned de Supabase Auth apagado).
- WARN — `extension_in_public`: `pg_net` instalada en `public`, no en schema propio.
- INFO — 26 tablas con RLS enabled y CERO policies (bloqueadas por defecto, no fuga): `avisos_hueco`, `ayuda_feedback`, `codigos_descuento_consumos`, `instructor_enlaces_vigentes`, `integracion_credenciales`, `mensajes_entrantes_medicion`, `migracion_batches`, `notification_delivery`, `oauth_*` (4), `plataforma_*` (4), `rate_limits`, `reconciliaciones_pos`, `recordatorio_envios`, `red_resenas`, `respaldo_sereno_studio1`, `resumen_semanal_envios`, `review_boost_recompensas`, `socio_companeras`, `webhook_events`.

**RLS de las 7 tablas núcleo — todas `relrowsecurity=true`, ninguna `FORCE ROW LEVEL SECURITY`:**
- `socios`: lectura por `studio_id`; INSERT/UPDATE/DELETE exigen además `puede_gestionar_clientas()`.
- `reservas`: lectura solo `studio_id`; INSERT/DELETE exigen `puede_gestionar_calendario()`; UPDATE también permite a la instructora sobre su propia sesión.
- `sesiones`: lectura solo `studio_id`; INSERT/UPDATE permiten instructora creando/editando la suya propia; DELETE **sin** rama de instructora (coherente con PR#528: instructora no puede borrar).
- `recibos`: lectura `studio_id`+`puede_ver_finanzas()`; escritura `studio_id`+`puede_mover_dinero()`.
- **`facturas`: SOLO tiene policy de SELECT.** ⚠️ No hay ninguna policy INSERT/UPDATE/DELETE para `authenticated` — la escritura de facturas queda fuera del alcance de cualquier rol cliente (solo service-role). Reportado tal cual, sin evaluar aún si es intencional (verificar en Fase 2).
- `suscripciones`: lectura solo `studio_id` (sin `puede_*` — decisión de producto ya documentada: "abierta a todo el personal"); escritura con `puede_mover_dinero()`.
- `instructores`: lectura `studio_id`; `owner_write_instructores` (PROPIETARIO, ALL); `manager_gestiona_equipo` (MANAGER, ALL, acotado a filas INSTRUCTOR/RECEPCION — no puede tocar otro PROPIETARIO/MANAGER).

**Grants a `anon`**: 60 tablas con algún GRANT a `anon`, las 60 con RLS enabled. Solo 3 tienen policy real para `anon` (`contenido_portal`, `contenido_portal_banners`, `novedades_estudio` — contenido público del portal). **57 de 60 son letra muerta** (GRANT sin policy = bloqueado). Confirma y actualiza el número ya documentado en `auditoria-2026-08-31.md` (decía "~50", son 57 reales).

**El "problema de RLS pendiente" que ya documenta el repo** (`auditoria-2026-08-31.md`, MEJORAS 🟡, plan de limpieza ítem 10): exactamente esas 57 tablas con GRANT a `anon` sin policy — recomendación ya escrita: `REVOKE ALL ... FROM anon` salvo las 3 públicas + verificar con `has_table_privilege`. Estado: **documentado, NO ejecutado**. No hay ningún otro hallazgo de RLS abierto en las 3 auditorías recientes (26/29/31-ago) — el resto de items relacionados con RLS de esas fechas están marcados REFUTADOS (los 6 `permission denied` de Sentry eran la cerradura funcionando, no una fuga — ya cerrado también en el código, ver PR #1490).

---

### 1.C — APIs e integraciones

**276 endpoints en `app/api/**/route.ts`**, por dominio: reservas/clases/aforo (~30), socios/alumnas (~15), billing/pagos (~35), marketing (~8), network/instructoras (~35, el grupo más grande), notificaciones (~5), cron (18), integrations (~18: Gmail/GCal/Klaviyo/Mailchimp/Zoom/Kisi/WhatsApp), interno (~20), decisiones, sustituciones, mensajería, OAuth público (v1: clientas/notas/planes/tareas/reservas).

**Stripe — dos flujos distintos**:
- **Suscripción SaaS de la propietaria** (Billing normal, no Connect): `app/api/billing/checkout|portal|status|webhook`. Webhook maneja `customer.subscription.*`, `checkout.session.completed`, `invoice.payment_failed`.
- **Pago de la alumna al estudio = Stripe Connect direct charge**: `app/api/stripe/checkout` (comentario explícito: "el importe va a la cuenta del estudio; la plataforma recauda take-rate vía `application_fee_amount`"), `connect/callback` (OAuth de conexión), `setup-sepa/setup-tarjeta`, `charge-off-session` (recurrente), `pos-bizum`, `app/api/terminal/*` (datáfono físico). Checkout público embebido: `app/api/public/checkout-embebido`, `estado-pago`.
- **Webhook principal** `app/api/stripe/webhook/route.ts` (1400+ líneas) recibe eventos de plataforma Y Connect (segundo secreto `STRIPE_CONNECT_WEBHOOK_SECRET`, dedupe por `claveWebhook('connect', event.id)`). Maneja: `checkout.session.completed`, `payment_intent.succeeded/failed`, `charge.refunded`, `charge.dispute.created/closed/funds_reinstated`, `refund.failed`, `charge.refund.updated`, `account.application.deauthorized`.
- Soporte: `lib/billing/stripe-cobros.ts`, `stripe-fees.ts` (take-rate), `modo-stripe.ts`, `dominios-wallets.ts` (Apple/Google Pay), `dunning(-server).ts`, `procesar-reembolso.ts`, `sellar-factura-server.ts`, `fiskaly.ts` (fiscal).

**Inngest — `lib/inngest/`** (18 ficheros): dispatchers diarios/horarios con fan-out por estudio para automatizaciones, campañas, cierre gestoría, conciliación de cobros (horaria) y reembolsos/disputas (cada 2h), confirmación de riesgo, Decision OS, dunning, penalizaciones (horaria), recordatorios, **renovaciones** (caducidad de bonos/planes — dispatcher diario 8:00 + `notif-bonos` cron aparte), review-boost, **sustituciones** (`escalarSustitucion`, evento `SUSTITUCION_CONTACTADA` — escala si no hay respuesta), valoraciones (cada 12h). Handler único `app/api/inngest/route.ts`.

**Sentry**: `sentry.server.config.ts`/`sentry.edge.config.ts` (`tracesSampleRate: 0.1`), cliente cargado perezoso (`lib/sentry-cliente.ts`, import diferido al estar ocioso — 245KB de 1.516KB medidos) con cola FIFO (`lib/sentry-cola.ts`) para comandos previos a la carga real. Instrumenta `captureException`/`captureMessage` + `setUser`/`setTag` + `extra:{}` inline. Sin Session Replay (retirado explícitamente). Sin `addBreadcrumb` detectado.

**Notificaciones — `lib/notifications/`**: catálogo de eventos (`catalog.ts`) agrupado por categoría — reservas (11 tipos, incl. `RESERVA_ABANDONADA`, `RECORDATORIO_24H/1H`), clases (6, incl. `CLASE_SUSTITUTA`, `SOCIA_INACTIVA`), pagos (12, incl. `BONO_POR_CADUCAR/AGOTADO`, `PAGO_CHARGEBACK_PERDIDO`), equipo/sustituciones (4: `SUSTITUCION_ACEPTADA/RECHAZADA`, `INSTRUCTORA_BAJA/AUSENCIA`), marketing/sistema (7), red (7), mensajería/comunidad (4). Cada evento define `priority`, `canales` (PUSH/EMAIL/WHATSAPP/SMS), `audiencia`.

**Email — `lib/emails/`, proveedor Resend**: 21 plantillas `.tsx` (bienvenida, reserva, cancelación/cambio de clase, recordatorio, sustitución, solicitud disponibilidad, confirmación riesgo, valoración, **recibo**, impago, fallo pago SaaS, resumen semanal, invitación equipo, acceso activado, cierre gestoría, automatización, espera sin plaza, promoción espera). Utilidades: `remitente.ts` (from), `marca.ts` (branding por estudio), `sanear-markdown.ts`.

---

### 1.B — Modelo de datos

Fuente: `lib/db-types.ts` (~180 tablas) + `supabase/migrations/*.sql` (380 ficheros). Multi-tenancy vía `studio_id` en casi todas las tablas.

**Tablas núcleo**: `studios` (tenant raíz — billing SaaS propio, config negocio, SEPA, Fiskaly/Veri*Factu, kill switch `suspendido_en`), `socios` (alumnas — soft delete `borrado_en`, consentimientos salud/marketing, `campos_extra` jsonb), `sesiones` (clases — FK tipo/sala/instructor, recurrencia por `serie_id`), `reservas` (FK sesión/socio/spot — índices únicos parciales evitan doble-reserva de plaza), `instructores` (`rol` CHECK con los 4 roles), `suscripciones` (bono/membresía activa), `recibos`, `facturas` (Veri*Factu con cadena de hashes), `planes_tarifa` (N:M con `tipos_clase`), `salas`, `tipos_clase` (puede sobreescribir reglas de reserva de `studios`), `spots`.

**Estados de `reservas.estado`**: `CONFIRMADA | LISTA_ESPERA | ASISTIDA | CANCELADA | NO_ASISTIO | PENDIENTE_APROBACION`. No hay estado de "sustituta" en `reservas` — vive en `sustituciones.sustituta_final_id`, y al confirmarse reasigna `sesiones.instructor_id`.

**Módulo sustituciones — YA CONSTRUIDO, no "en construcción" (contradice el contexto del prompt del usuario, verificar en Fase 2 si hay trabajo nuevo encima)**:
- `instructora_disponibilidad` (ventanas semanales recurrentes) + `instructora_disponibilidad_excepciones` (bloqueos/extras puntuales) + `instructora_ausencias`.
- `sustituciones`: máquina de estados `buscando|pendiente_aprobacion|contactando|confirmada|sin_sustituta|resuelta_fuera|cancelada|agotada`. `ranking` jsonb con scores, `candidatos_network` jsonb (candidatas de Tentare Network). Índice único parcial `uq_sustitucion_activa_por_sesion` (máx 1 proceso activo por clase).
- `sustitucion_contactos`: canal (email/whatsapp/sms/llamada/push), estado, `token` (deep link firmado de un solo uso).
- **Transición atómica**: RPC `confirmar_sustitucion()` — compare-and-set `UPDATE ... WHERE estado IN (...)`, si 0 filas → `{ok:false, motivo:'ya_resuelta'}`; en la misma transacción reasigna `sesiones.instructor_id`. Protección contra doble-aceptación por guard de estado (no por índice único adicional).
- `instructor_tiene_conflicto()` — anti-doble-reserva de la candidata vía `tstzrange` overlap.
- **Conclusión: el modelo SÍ soporta ya lo mínimo pedido** (disponibilidad, cruce contra clases asignadas, transición atómica, tokens de un solo uso) — pendiente de verificar en Fase 2 si hay bugs de ejecución real, no de diseño.

**Pagos/Stripe**: `webhook_events` (idempotencia global, cross-tenant, RLS + `REVOKE ALL FROM anon,authenticated` — solo `service_role`; lock `reclamado_en` anti-carrera), `webhook_reembolsos`/`webhook_disputas` (auditoría), `devoluciones`, `mandatos_sepa`, `reconciliaciones_pos`.

**RLS de las 4 tablas pedidas — coincide con lo verificado en vivo (1.D)**: `socios` (lectura abierta al estudio, escritura `puede_gestionar_clientas()`), `reservas` (lectura abierta, INSERT/DELETE `puede_gestionar_calendario()`, UPDATE deliberadamente abierto — checkin/no-show/spot), `recibos` (lectura Y escritura exigen `puede_ver_finanzas()`/`puede_mover_dinero()` — MANAGER excluido de ambas), `instructores` (PROPIETARIO controla todo; MANAGER solo filas INSTRUCTOR/RECEPCION, nunca PROPIETARIO/MANAGER, mismo filtro en `WITH CHECK` — anti auto-escalada). Self-claim de instructora por navegador ya retirado (ahora vía servidor/service-role).

---

## FASE 2 — DEEP-DIVE POR ÁREA

(pendiente)

---

### 2.B — Core loop y estados de UX

**Core loop**
- **A1**: `app/(dashboard)/dashboard/page.tsx` es la pantalla de entrada real (sin redirect). "Clases hoy" (`ClaseHoyCard` L252-428) permite check-in inline sin navegar. Buen diseño.
- **A2**: 0-2 navegaciones para "ver quién viene → check-in → cobrar". Login→dashboard (0). Expandir tarjeta (1, auto-expande si `isNow`). Check-in por alumna: 1 clic c/u (no hay bulk-checkin en el dashboard, solo en `/calendario` vía `ejecutarPasarLista`). Tarjeta "Pagos pendientes" con "Cobrar"/"Cobrar todos" en el propio dashboard.
- **🔴 BUG — `marcarCobrado` sin manejo de resultado**: `app/(dashboard)/dashboard/page.tsx:1159`, `onClick={() => marcarCobrado(r.id)}` descarta el resultado — sin toast, sin error. Dos líneas arriba, "Cobrar todos" SÍ comprueba `res.ok`. Si el cobro individual falla (Stripe rechaza, red cae), el botón no hace nada visible: la propietaria no sabe si cobró, puede repetir el clic o dar el cobro por hecho erróneamente. Toca dinero, en la pantalla de entrada, cero feedback. Confirmado por código.
- **A3**: Centro de Control SÍ reduce trabajo de verdad — `RecommendationCard` tiene `onAprobar/onRechazar` que ejecutan la acción real (email/WhatsApp/cobro), `loHaceTentare` documenta qué es "un toque" vs solo informa. El propio código documenta que hubo "dos inicios compitiendo" (dashboard no mencionaba el Decision OS) y lo resolvió con `ActionCenter` + "El Umbral" (un solo mensaje/día) — solución de producto genuina, no relleno.
- **A4**: Proactivo, no reactivo — evento `DECISION_MENSAJE_DIA` (solo PUSH, deliberadamente sin email/WhatsApp/SMS "para no diluir la promesa", cita literal del código) + notificaciones de eventos concretos (sustituciones sin cubrir, penalizaciones) sin que la propietaria tenga que ir a buscar el dato.

**Estados de UX**
- **🔴 BUG — Calendario puede quedarse colgado en "Cargando…" para siempre**: `app/(dashboard)/calendario/page.tsx:2255-2256`, sin skeleton, solo texto. `cargarDatosVista` (~L1415-1429) tiene `catch { /* Silencioso */ }` que no toca `datosVista` en fallo — un error de red/500 en la primera carga deja la pantalla colgada sin mensaje ni reintentar, indistinguible de una app rota. Contraste positivo: `/centro-de-control` SÍ tiene skeleton + error con botón "Reintentar" (L168-185) — el patrón existe en el repo, falta aplicarlo en calendario.
- **Empty states inconsistentes**: `EmptyState` usado en `panel-pendientes.tsx` (3x) pero CERO veces en `calendario/page.tsx` y `clientas/page.tsx`. Dashboard tiene su propio empty state hecho a mano (no canónico) para "Sin clases hoy". El vacío TOTAL de estudio nuevo sí está bien resuelto: `OnboardingChecklist` (`components/dashboard/onboarding-checklist.tsx`), persistida en `studio.onboardingDescartadoEn` (no localStorage — todo el equipo ve lo mismo), CTA a `/primeros-pasos`.
- **Error — patrón dominante bueno (toast específico), con 2 inconsistencias**: `window.alert()` usado como fallback en 7 sitios (`panel-pendientes.tsx:660,1115,1934`; `calendario/page.tsx:1749,1751,1752,2391`) — comentario explícito en el código reconoce "no hay canal de toast en este panel". Rompe el lenguaje visual justo en cobros y en el calendario. Sumado a `marcarCobrado` (ni alert ni toast — el caso más grave).
- **Parcial — patrón dominante SÓLIDO**: `ejecutarPasarLista` cuenta marcadas/fallidas con toast explícito + "Deshacer" selectivo. `handleAsignarPlan` (`clientas/page.tsx:549-577`) solo cierra el diálogo si todo fue bien, si no lista por nombre quién falló (con comentario documentando el bug anterior que corrigió). `cancelarSesion` distingue avisadas/sin-avisar del resultado de cancelar reservas, 3 mensajes distintos. Único hueco: `panel-pendientes.tsx:521` acumula fallidos en cobro por lote pero no verificado visualmente cómo se comunica — **HIPÓTESIS — necesita verificación visual**.
- **Éxito**: consistente con el sistema de toast (mensajes específicos, no "Guardado" genérico); se degrada donde hay `window.alert`.

---

### 2.A — Onboarding, time-to-value y navegación

**Onboarding**
- **`/crear-estudio` — bien resuelto, no tocar**: 3 pasos (Estudio→Plan→Cuenta), sin tarjeta en ningún paso (verificado por grep, sin `CardElement`/`PaymentElement`), orden justificado técnicamente en comentario (email sin confirmar = sin sesión, estudio/plan viajan como metadata). Persiste en `localStorage` (`lib/alta/borrador.ts`).
- **🟠 PRODUCT PROBLEM — wizard de bienvenida de 11 preguntas SIN salida ni persistencia**: `components/layout/dashboard-shell.tsx:190-191` sustituye TODO el layout por `<PantallaBienvenida>` si `!bienvenidaVistaEn`. `pantalla-bienvenida.tsx:113-208`, 11 pasos, CERO botón "Saltar"/"Ahora no" (confirmado por ausencia en el fichero — solo las escenas previas `PantallasValor` tienen Saltar). Estado vive en un `useRef` en memoria (L499) — recargar la pestaña a mitad = repetir desde cero (a diferencia de `/crear-estudio` que sí persiste). Impacto: propietaria recién registrada (ya 3 pantallas) se topa con 11 decisiones más obligatorias; un WiFi de local que falla le hace perderlo todo.
- **🟠 BUG — checklist marca "hecho" un paso que no funciona todavía**: `lib/onboarding.ts:109` cuenta CUALQUIER plan (`numPlanesTarifa > 0`) sin filtrar `activo`. Los bonos del wizard se crean con `activo:false, precio:0` a propósito (`lib/onboarding/plan-configuracion.ts:20-25`). Checklist tacha "Configura tus bonos" ✓ aunque el bono no sea vendible (precio 0, inactivo, invisible en `/reservar/[slug]`) hasta que ella entre a ponerle precio y activarlo. Falsa sensación de "ya está" — contradice el propio criterio documentado en el fichero ("done debe reflejar trabajo real hecho"). `numPlanesTarifa` = `.length` sin filtro en `onboarding-checklist.tsx:39` y `primeros-pasos/page.tsx:68`.
- **Prueba de 7 días — muy bien hecha, no tocar**: nunca pide tarjeta, gate de expiración fail-open (`billing/status/route.ts:9-11,63` — si Stripe/Supabase fallan, NO bloquea), redirige a `/suscripcion` en vez de dejar panel roto, píldora discreta sin rojo salvo corte real, copy nunca amenaza con borrar datos.
- **Onboarding de instructora — correcto por diseño**: invitación por token firmado, NO pasa por el wizard de 11 preguntas (solo PROPIETARIO lo ve), pantalla `/invitacion` con bugs reales ya corregidos y documentados en comentarios (pérdida de sessionStorage → token también por URL).
- Ningún dato irrelevante pedido en el alta (ciudad/"cómo nos conociste" opcionales, NIF fuera del alta).

**Navegación / arquitectura de la información**
- **🔴 POLISH sistemático (detalle de marca, no bug) — "IA" visible al usuario en 7+ pantallas, violando la decisión de producto**: `lib/nav-config.ts:31` — **"Automatizaciones IA" en el sidebar permanente**, el ítem más visible de la navegación. Más: "Preparar clase con IA" (`calendario/page.tsx:2438`), "Adaptar ejercicios con IA" (`ficha-salud.tsx:593`), "Estructurar con IA" (`modal-nota-voz.tsx:109`), "Nota de sesión IA"/"Generar nota IA" (`clientas/[id]/page.tsx:1014-1102`), "Escribe la campaña con IA" (`marketing/page.tsx:1452`), "clasificado con IA" (`migracion/page.tsx:465`). La regla "automático" se aplicó al copy de marketing/landing pero NO se propagó a las funciones que invocan un LLM dentro del panel.
- **Bien resuelto — menú "Ventas"**: agrupa Cobros/Caja/Membresías con justificación documentada en el propio código (corrección de auditoría previa, 20-ago). "Suscripción" deliberadamente separada (factura de Tentare, no cobro a socia).
- **🔵 POLISH — inconsistencia Socia/Clienta dentro del mismo panel**: nav usa "Clientas" consistentemente, pero `libreta/page.tsx:71` encabezado de columna dice "Socia" dentro de una pantalla que el menú llama "Libreta de clientas"; `notificaciones/page.tsx:28` usa `SOCIA:'Socia'`. Conteo: 347 "clienta/s" vs 69 "socia/s" vs 27 "alumna/s" en `app/(dashboard)/`. Coherente con la convención de dominio-en-español-libre del repo, no es error de arquitectura, pero sí fuga de la convención dominante notable al usuario.
- **Jerarquía de navegación cuidada, nada enterrado sorprendentemente** — cada reordenación tiene justificación documentada en comentarios (Marketing colapsado de 8→1 entrada, Sustituciones movida a Estudio por unificación con Network).
- `ETIQUETA_ROL` (`lib/permisos-reglas.ts:245-250`) es fuente única correcta — sustituyó 4 catálogos duplicados que divergían (uno sin MANAGER causaba un crash real). Ya cerrado, no tocar.

---

### 2.D — Mobile y sobreingeniería

**Mobile**
- **Panel — SÍ diseñado para móvil (confirmado, no hipótesis)**: `sidebar.tsx` con bottom nav dedicada + drawer "Más" a pantalla completa, sidebar de escritorio oculto del todo en móvil (`hidden lg:flex`). No es un sidebar que se encoge mal, es una interfaz distinta. Detalle real: evita `--foreground` en topbar móvil por inversión en modo oscuro (comentado explícitamente).
- **Calendario — tratamiento móvil deliberado y documentado**: `vista-semana.tsx:15-22` fija ancho mínimo de columna (92px) con comentario explícito del bug que arregla ("Cerrado" se solapaba en 375px); por debajo, scroll horizontal en vez de seguir encogiendo. `TarjetasMetricas` oculta en móvil con motivo documentado.
- **Portal de alumna — coherente mobile-first**: 0 `<table>` en todo `app/portal/`+`components/portal/`, sin anchos fijos grandes detectados.
- **🟡 UX PROBLEM — tablas del panel inconsistentes en tratamiento móvil**: `clientas/page.tsx:959` y `panel-facturas.tsx:336` SÍ tienen alternativa de tarjetas/`overflow-x-auto`; `informes/page.tsx:555` NO (a diferencia de las tablas de líneas 465/509 del mismo archivo, que sí). Inconsistencia dentro del mismo fichero. Impacto probablemente menor (Informes no está en `bottomNavItems`, uso secundario) — **HIPÓTESIS — necesita verificación visual** en 375px.
- **🟡 UX PROBLEM — grids de 2 columnas sin breakpoint responsive en formularios**: `clientas/page.tsx:1291,1317` (Nombre/Apellidos, Teléfono/NIF) usa `grid-cols-2` fijo, SIN `sm:`, mientras el bloque de campos personalizados 2 líneas después (L1333) sí usa `grid-cols-1 sm:grid-cols-2` — el patrón correcto existe en el mismo archivo, no se aplicó a los campos base. Mismo patrón en `calendario/page.tsx:2569,2624` (form "Nueva clase"). En 375px cada campo queda ~165px — usable pero apretado. Es inconsistencia de aplicación, no desconocimiento del patrón. Impacto visual real: **HIPÓTESIS**.
- Drawer lateral (`dashboard-drawer.tsx:18`) correcto: `w-full lg:w-[420px]` — pantalla completa en móvil.

**Sobreingeniería**
- **🟡 PRODUCT PROBLEM (con matices) — Decision OS (`lib/decision/`, 6.911 líneas, 24 módulos, sin tests) construido a un nivel de sofisticación que 0 clientes de pago no puede validar todavía**: motor de especialistas + confianza + predicción + calibración adaptativa por estudio + detección de conflictos entre recomendaciones. Con 1 socia de 202 con tarjeta guardada y 0 con SEPA (por Stripe no ha pasado ni un cobro real de F4), la calibración adaptativa (exige mínimo 5 muestras en 90 días) no puede tener señal real. **Matiz importante — no es un capricho**: cada fase pasó por diseño+seguridad, y nació de feedback real de una cadena de 2 sedes. El problema no es que se construyera sin validación, es que se siguió invirtiendo en sofisticación (calibración, detección de conflictos) ANTES de tener volumen para que pague su coste — las 4 fases básicas (candidatas/scoring/prioridad/especialistas) sí son razonables, las capas de aprendizaje/conflictos son las de menor ROI hoy.
- **🟠 PRODUCT PROBLEM — Theming/white-label (~7.300 líneas, 7 suites de test solo para esto) sin evidencia de demanda real**: editor visual completo + importador + presets + runtime, gated a planes ESTUDIO/CADENA. A diferencia del Decision OS, NO hay evidencia en el repo de que un cliente real lo haya pedido — con 0 clientes de pago confirmados, es la inversión que más parece "por si acaso". **HIPÓTESIS**: cuántos estudios reales han usado el editor — si es 0, es la sobreingeniería más clara del repo.
- **NO es sobreingeniería (contraste positivo, con justificación real)**: `entitlements.ts` (21 combinaciones planas, proporcional a 3 planes reales, testeado). `permisos-reglas.ts` (granularidad justificada por un incidente de seguridad real ya ocurrido, no diseño preventivo). `feature-flags.ts` (25 líneas, 1 flag, decisión explícita reversible del fundador). Sin sistema de i18n (disciplina YAGNI correcta — producto solo en español). Tests con `node --test` colocalizado, sin framework externo — la opción más barata para un equipo de 1 persona.

---

### 2.C — Errores/recuperación y acciones destructivas

**Errores y recuperación**
- **Optimistic UI — patrón revert-on-failure confirmado en 5+ funciones**: `updateSocio` portal, `cancelarReserva` panel, `checkin` kiosko, `updateSesion`, todos en `lib/studio-context.tsx` — guardan snapshot y revierten si `!ok`. Portal usa variante revert-por-refetch (`cargarPublico()` en el `finally`).
- **🟡 UX PROBLEM — `devolverSesionBono` fire-and-forget sin feedback**: `lib/studio-context.tsx:3029`, `void devolverSesionBono(...)` — el caller no espera el resultado. Si falla, solo llega a Sentry (`capturarMensaje`), nadie en el estudio se entera de que la socia perdió una sesión de bono sin recuperarla. Decisión documentada en comentario, pero el hueco de "nadie revisa Sentry para esto" es real.
- **Pagos — idempotencia real confirmada, sin huecos nuevos**: `idempotencyKey` determinista en cobro off-session (`offsession-cobro-${reciboId}-i${intentos}`, reutilizada en reintentos) y en Checkout. Conciliación con 2 ventanas (recuperación 12h + vigilancia 72h) para Modo A/B, ids deterministas evitan duplicar con el webhook. Backstop SEPA `EN_CURSO` atascado (15 días). Área sólida.
- **🔴 BUG — "Cancelar" vs "Eliminar" clase: comportamiento de bono OPUESTO tras dos botones visualmente similares**: `cancelarSesion` (`calendario/page.tsx:1218`→`cancelarReservasDeSesiones`) SÍ devuelve el bono consumido (`studio.cancelacionClaseDevuelveBono`, default true). `eliminarSesion` (`calendario/page.tsx:1282`→`deleteSesion`→`dbDeleteSesion`) hace `DELETE FROM sesiones`, la FK `reservas_sesion_id_fkey` es `ON DELETE CASCADE` (migr `0000_base.sql:2350`) — reservas desaparecen físicamente, **`devolverSesionBono` nunca se invoca en este camino**. Una socia con reserva CONFIRMADA (bono ya descontado) pierde la sesión sin devolución si se usa "Eliminar". Dos botones (X vs papelera) en la misma barra, sin ningún aviso que distinga la consecuencia de dinero.
- **Race conditions en consumo de bono — NO existen, verificado**: `consumir_sesion_bono` (migr `0132`) es un único `UPDATE...WHERE sesiones_restantes>0...RETURNING` atómico — dos reservas simultáneas contra el último hueco de bono, solo una gana, sin sobreventa. Correcto.

**Acciones destructivas**
- **Eliminar alumna — BIEN RESUELTO**: modal real (no `confirm()`), explica anonimización/retención fiscal/"no se puede deshacer", botón deshabilitado durante el await. Soft-delete con anonimización, borra datos sin base de retención (salud/notas/documentos+Storage), CANCELA suscripciones (no borra, FK RESTRICT de recibos), conserva recibos/facturas/POS por obligación fiscal, idempotente.
- **🟠 BUG — cancelar una reserva individual desde el panel: SIN confirmación**: `lista-clientas.tsx:157` y `dashboard/page.tsx:388` — clic directo a `cancelarReserva`, cero diálogo. Para clase con lista de espera, promueve automáticamente a la siguiente — un clic accidental ya no es tan reversible como "recancelar" porque la plaza pudo pasar a otra persona.
- **🔴 BUG — cancelar/eliminar una clase completa: SIN confirmación, impacto se descubre DESPUÉS**: `calendario/page.tsx:2356-2361`, botones "Cancelar"/"Eliminar sesión" van directo a la acción, cero modal. El conteo de avisadas/sin-avisar solo aparece en el toast POSTERIOR a la ejecución. Combinado con el bug de arriba: un clic accidental en la papelera de una clase llena, sin confirmación, borra reservas en cascada y no devuelve bono.
- **🔴 BUG CONFIRMADO (verificado en vivo, ya no es hipótesis) — dar de baja instructora: hard DELETE que contradice el propio texto de la UI**: modal de confirmación SÍ existe y es bueno (avisa riesgo de cartera). Pero el texto dice *"Las clases y citas ya asignadas no se borran, pero quedarán sin instructor visible"*, mientras `bajaInstructora` (`equipoAction.ts:273`) hace `DELETE` real sobre `instructores`. **Verificado en producción con `execute_sql`**: `sesiones_instructor_id_fkey` tiene `confdeltype='a'` (NO ACTION). Dar de baja a cualquier instructora con al menos una `sesion` asignada (pasada o futura) falla con `23503`, capturado genéricamente en `equipoAction.ts:274-277` como "No se ha podido dar de baja" — sin explicar la causa real ni ofrecer reasignar antes. Contradice directamente lo que el modal promete. Sin aviso de "tiene N clases futuras" en el modal (el aviso de riesgo de cartera es un concepto distinto).

---

### 2.G — Solidez de pagos y gaps declarados

**Parte 1 — solidez de lo construido**
- **Camino del cobro — completo, con decisión de diseño documentada**: webhook responde 200 ANTES de procesar (`after()`, medido: 4/6 cobros reales de `studio-1` se perdían por timeout de Stripe antes del fix) → consecuencia: si falla dentro de `after()`, Stripe NO reintenta, la única red es el conciliador horario (peor caso 1h de retraso). Pasos best-effort (factura/email/notif) no pueden tumbar el cobro confirmado. IDs deterministas (`res-web-`, `rec-web-`, `sus-web-`) evitan duplicar en reintentos.
- **Idempotencia — completa en las 4 puertas de dinero**: off-session, checkout hospedado, checkout embebido (Modo B), reembolsos (con matiz: sufijo `-v2` + id del refund anterior, porque Stripe cachea 24h incluso errores). **Único hueco sin verificar a fondo**: `app/api/terminal/cobrar/route.ts:76` (datáfono) es la única llamada de creación de PI que no apareció en el grep de `idempotencyKey` — merece mirada puntual (doble-tap del terminal físico).
- **Conciliación — completa, no placebo, con bugs reales ya cerrados**: cron horario SÍ detecta y corrige solos (no solo alerta), pregunta directo a Stripe sin depender del webhook, autopaginado corregido (bug real: `.list({limit:100})` perdía justo las sesiones más viejas/atascadas). Reembolsos comparten lógica con el webhook vía `procesar-reembolso.ts` (los dos caminos no pueden divergir).
- **🟡 PRODUCT PROBLEM (decisión de producto, no bug) — reembolso NO revierte bono/plaza automáticamente**: `procesar-reembolso.ts` marca el recibo DEVUELTO pero no toca `suscripciones`/`reservas` — requiere acción manual (`/api/devoluciones/revertir`, rol `puedeMoverDinero`, REVERTIR o DESCARTAR). Motivo documentado: el caso más frecuente es doble cargo, revertir automático quitaría sesiones ya pagadas de verdad. Gap operativo real: el dinero puede volver mientras el bono/plaza sigue "vivo" hasta que alguien lo resuelve a mano — sin cron que escale si nadie lo resuelve en X días.

**Parte 2 — gaps declarados, estado real**
- **Factura a la alumna**: COMPLETO (los 3 caminos de dinero llaman a `sellarFacturaDeRecibo`, ya se cerró el hueco de que el checkout hospedado no lo hacía).
- **Email de confirmación de compra**: COMPLETO y disparado en los 3 caminos.
- **Notificación sonido/visual al cobrar**: COMPLETO — conectado a Realtime filtrado por `EVENTOS.VENTA_REGISTRADA`, no un asset huérfano.
- **Resumen de ventas recientes**: NO VERIFICADO en esta pasada — pendiente de mirar si hay algo más allá de agregados mensuales.
- **Caducidad/renovación con aviso previo**: COMPLETO para el caso simple (`BONO_POR_CADUCAR`, ventana fija 7 días) + dunning avisa en 1er fallo y en el definitivo + auto-cancela tras 3 reintentos. Matiz: el Decision OS tiene un especialista F3 con ventana dinámica por frecuencia — eso es "nivel inteligente", la red básica de 7 días fijos SÍ está en producción.
- **Cierre de gestoría automático**: COMPLETO, no un stub — idempotente, paginado correcto, maneja "trimestre sin datos".
- **"Sin asistencia" en todas las clientas**: YA CERRADO en código (`clientas/page.tsx:340-407` distingue "Sin datos" de "Sin asistencia reciente >30 días"). Si el usuario lo sigue viendo en producción, es caché/deploy, no código pendiente — **verificar si el usuario ve esto todavía**.
- **Importación "Traer mis datos"**: bastante completo, 6+ endpoints especializados (no solo CSV genérico) — el gap real es calibración/edge-cases con exports de plataformas concretas, no construcción desde cero.
- **White-label real en emails a alumnas**: COMPLETO y verificado en uso — recibo/impago/cambio-clase/resumen-semanal SÍ llevan marca del estudio, con bug histórico ya corregido (encabezado salía "TENTARE" en mayúsculas).

### 2.E — Deuda técnica con consecuencia real

- **`facturas` sin policy de escritura — VERIFICADO: intencional, no bug**. Toda escritura pasa por `service_role` desde rutas con sesión verificada o el webhook; el INSERT real vive en la RPC `reservar_numero_factura` (SECURITY DEFINER). Cerrado.
- **🟠 BUG — N+1 real en el widget público de citas 1:1**: `components/reserva/citas-publica.tsx:114` + `supabase-data-admin.ts:2838-2866`. Al elegir "Cualquier instructora", `cargarHuecos()` dispara 1 petición HTTP por instructora (~4 queries × N), incluido un fetch redundante idéntico de `citas_servicios` por cada una. Con 4-6 instructoras del mismo servicio (caso normal en cadena), cada clic de día = 16-24 queries + 4-6 round-trips contra un endpoint con rate-limit de 60/min — una socia navegando varios días puede agotar la cuota y ver "sin huecos" cuando en realidad es un 429. Frecuencia: cada carga del selector, no un caso raro.
- **Sustituciones — confirmado atómico de punta a punta, sin hallazgo nuevo**: el único check previo no atómico es un guardia de UX documentado como "no afecta atomicidad"; el CAS real (`UPDATE...WHERE estado IN(...) RETURNING`) verificado en vivo con `pg_get_functiondef`.
- **🟡 TECHNICAL DEBT — trampa activa (código muerto pero peligroso)**: `dbInsertReserva` (`lib/supabase-data.ts:2509-2512`) hace INSERT directo sin pasar por `reservar_plaza` — el propio comentario de su vecina `dbReservarPlaza` dice literalmente que sustituye "al insert directo (read-decide-insert no atómico → sobreventa)". Cero llamadas activas hoy (grep confirma), pero cualquier desarrollador que busque "insertar reserva" la encuentra primero y puede reintroducir el bug de overbooking ya arreglado una vez. Debería borrarse.
- **🔴 BUG — `.catch(()=>{})` indiscriminado en cancelación de suscripción al dar de alta CADENA**: `app/api/billing/checkout/route.ts:120-124`. Solo justifica silenciar `resource_missing` (ya cancelada), pero el catch es genérico — un fallo real (timeout, rate limit, clave inválida) deja continuar el flujo igual, creando la suscripción de cadena SIN haber cancelado la individual → **dos suscripciones activas cobrando en paralelo**, sin log ni Sentry (a diferencia del resto de `stripe-cobros.ts`). Mismo patrón que el propio repo ya identifica como el bug más repetido en Stripe, aquí sobre una baja, no un cobro. Sin cron que audite "dos subscription_id activos para el mismo cliente".
- **Confirmado vigente (no nuevo)**: riesgo residual de doble adeudo SEPA en `cobrarReciboOffSession` si la Idempotency-Key se purga (24h) antes de que el webhook liquide — documentado en el propio código como "sin red hoy", solo SEPA.
- **No encontrado pese a buscar**: catches vacíos en rutas de dinero/reservas (ya corregidos, solo quedan comentarios documentando la corrección); escrituras directas a `reservas` que sorteen `reservar_plaza` en camino vivo; tablas nuevas con GRANT a `anon` sin policy fuera de las 57 ya documentadas.

---

### 2.F — Módulo de sustituciones: bugs de ejecución (más allá del diseño, ya verificado sólido)

- **Flujo completo trazado**: `crearBaja` (`lib/sustituciones/baja.ts:52-209`) → `rankear_candidatas` (RPC puntuada) + `candidatosNetworkParaHueco` (best-effort, sin puntuar) → según `modo_autonomia`: asistido/manual queda `pendiente_aprobacion` (nadie contactado hasta que la propietaria actúa), autónomo/vacaciones arranca solo → `contactarCandidata` firma token nominal de un solo uso + email → escalado Inngest con ventanas 2-45min proporcionales al tiempo hasta la clase → aceptación en 1 tap → `confirmar_sustitucion` (CAS atómico).
- **🟠 UX PROBLEM — en modo asistido (el default), "sin llamadas, sin perseguir" no se cumple si la propietaria no vuelve a mirar**: el aviso a la propietaria (`alertarPropietaria(tipo:'baja')`) se dispara UNA sola vez al crear la baja (`baja.ts:192-206`). El escalado de Inngest ni siquiera arranca en modo asistido hasta que ella pulsa "Avisar"/"Aprobar". Sin recordatorio posterior si se pierde ese único aviso.
- **🔴 BUG — el cierre por `sin_sustituta` NO avisa a nadie**: `lib/sustituciones/cerrar-vencidas.ts:19-59` (barrido final) solo hace `UPDATE estado='sin_sustituta'`, sin llamar a `alertarPropietaria` ni al Notification Engine. Contraste: el cierre por `agotada` (ranking agotado durante escalado activo) SÍ avisa (email+WhatsApp/SMS) con colchón de ~1/3 antes de la clase. Combinado con el punto anterior: una sustitución puede quedar silenciosamente en `pendiente_aprobacion` → cerrarse a `sin_sustituta` sin ningún aviso, potencialmente DESPUÉS de que la clase ya pasó. Impacto: alumnas se presentan sin nadie, la propietaria se entera por curiosidad al abrir el panel, no por alerta.
- **"Un clic para aprobar" — confirmado literal**: `sustituciones/page.tsx:799-820`, un solo clic → `avisarSustituta`, sin campos intermedios. UI honesta sobre lo que hace ("Al aprobar avisamos a X; cuando acepte, la clase se reasigna sola"). Bien resuelto.
- **Notificación a candidata interna — automática, confirmado**. **Excepción documentada para Network**: candidatas de Tentare Network NO reciben email/token automático — solo un link al perfil público, contacto 100% manual (`sustituciones/page.tsx:896-920`, `docs/NETWORK-SUSTITUCIONES-EXTENSION.md §5`). Decisión de producto explícita, pero riesgo de expectativa: si se asume que Network funciona igual que interno, sorpresa real (aquí sí hay que "perseguir").
- **🔴 BUG DE SEGURIDAD — `confirmar_sustitucion` no valida que quien acepta sea la candidata ofrecida actualmente**: `0048_sustituciones_confirmar_sin_solape.sql:58-69`, el `UPDATE...WHERE estado IN(...)` no comprueba `candidata_actual` ni el ranking, solo que siga "en juego". El token (`firmarTokenInstructora`) no se marca de uso único en servidor (solo expira a 3h), y `app/api/public/aceptar-sustitucion/route.ts:27-44` NO repite en servidor la comprobación de `ultimaRespuestaDe` que sí hace la página SSR en cliente (`aceptar-sustitucion/[token]/page.tsx:47-51`). **Una candidata que ya rechazó explícitamente puede seguir confirmando la clase** mientras su token no haya expirado y nadie más haya confirmado — puede arrebatarle la clase a quien el motor ya movió como actual, sin error visible. Protección solo de cliente, no de servidor. No probado en vivo (sin entorno Supabase local), pero el análisis es 100% sobre SQL/TS real, no hipótesis de comportamiento.
- **Comparación Network vs interno** (tabla): selección puntuada vs sin puntuar (máx 6), contacto automático-con-token vs 100%-manual, aceptación 1-tap-atómica vs alta-de-equipo-manual, escalado/recordatorio sí vs no existe. Ruta secundaria deliberada y documentada, con mucha menos cobertura funcional — coherente con "no es un motor de contratación automática".

---

### 2.H — Modelo de datos vs. negocio real (spots, bonos, lista de espera, huecos)

- **Spots — bien resuelto, opt-in real sin penalizar a quien no los usa**: `reservas.spot_id` sin `NOT NULL`, `reservar_plaza` solo asigna spot si `CONFIRMADA`. Comentario explícito (`0081_aforo_efectivo_averias.sql:9-11`): "un estudio sin mapa de spots dice 'una máquina averiada' y el aforo baja 1; uno con spots la fija a un reformer" — mismo mecanismo con y sin spots. Candado real: `SELECT FOR UPDATE` + `UNIQUE INDEX` anti-doble-venta. Sin sobreingeniería.
- **Bonos — los 4 casos pedidos, soportados con evidencia**: N-sesiones+caducidad (`sesiones`+`validez_dias`), cuota mensual ilimitada (`tipo='MENSUAL'`), restringido a tipo de clase (tabla puente `plan_tipos_clase`, "sin filas = cubre todo"), congelación (tabla `congelaciones` + RPCs, reutiliza `estado='PAUSADA'`, empuja `fecha_fin` los días congelados al descongelar). Diseño limpio, sin huecos.
- **Lista de espera con plazo — bien candada en la parte dura, hueco real en UX/negocio**: la regla de negocio vive DENTRO de la RPC (`aceptar_oferta_lista_espera` comprueba `now() > v_expira`, independiente del cron) — nadie acepta una oferta caducada aunque el cron nunca corra. Sin race condition (ambas RPCs usan lock de fila, `FOR UPDATE`/`UPDATE...WHERE`). Cron `pg_cron` cada 5 min verificado en `cron.job` real. **🟡 UX PROBLEM**: si el cron ENTERO deja de dispararse (no solo fallos individuales, que sí van a Sentry), no hay alarma — solo se detecta porque las ofertas se acumulan. **🟠 UX PROBLEM**: la notificación de "tienes una oferta con plazo" es SOLO push+in-app (`catalog.ts:268`) — sin SMS/WhatsApp de refuerzo para algo con deadline real, a diferencia de eventos críticos del sistema que sí llevan 4 canales. Si la socia no tiene push activado, se le puede pasar el plazo sin enterarse.
- **🟠 PRODUCT PROBLEM — 4 huecos reales de modelo, confirmados por ausencia (no por suposición)**:
  1. **Pack familiar / bono compartido**: `suscripciones.socio_id` es un único text, sin tabla puente de compartición. Cero soporte.
  2. **Clase de prueba gratuita para una alumna** (distinto del trial de 7 días del SaaS): sin campo/lógica dedicada; hoy solo posible vía código de descuento 100% aplicado a mano.
  3. **Descuento por antigüedad**: sin columna ni regla automática ligada a tiempo como socia.
  4. **Prioridad en lista de espera por pago**: confirmado en el cuerpo REAL de `promocionar_siguiente_espera` (leído en producción) — FIFO estricto (`ORDER BY creado_en ASC`), sin peso por plan/importe.
  - Juicio de producto: de los 4, **prueba gratuita** y **pack familiar** son los más importantes (prácticamente universales en Momence/Eversports y Glofox/Mindbody respectivamente); antigüedad y prioridad-por-pago son "nice to have" de retención, no bloqueantes.

---

## FASE 3 — SÍNTESIS

Ver `auditoria-tentare-final.md`

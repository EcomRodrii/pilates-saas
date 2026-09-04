# AUDITORÍA DE PRODUCTO — TENTARE

Repo: https://github.com/EcomRodrii/pilates-saas · rama `main`
Rol: PM Senior + UX/Product Designer + Full-Stack Engineer + QA Senior
Metodología: mapa completo del producto + 8 pases de deep-dive (código real, con verificación en vivo contra Supabase de producción donde hizo falta — RLS, grants, cuerpos reales de RPCs, FKs). Notas de trabajo completas en `auditoria-tentare-notas.md`.

---

## RESUMEN EJECUTIVO

### 3 cosas que están muy bien (y que NO tocaría)

1. **El alta y la prueba gratuita no mienten y no empujan a dar la tarjeta.** `/crear-estudio` en 3 pasos sin ningún campo de pago (verificado por código, cero `CardElement`/`PaymentElement`), y el gate de expiración de la prueba de 7 días es *fail-open*: si Stripe o Supabase fallan, el sistema **nunca bloquea por error** (`billing/status/route.ts`). El copy nunca amenaza con borrar datos. Esto es exactamente lo que hay que hacer bien en el primer contacto con un producto nuevo, y aquí está bien hecho.

2. **El camino del dinero es sólido, con degradación medida en vez de ignorada.** El webhook de Stripe responde 200 antes de procesar (decisión documentada: 4 de 6 cobros reales se perdían por timeout de Stripe antes de este fix) y acepta que eso significa que Stripe no reintentará si algo falla después — por eso hay un conciliador horario que **corrige solo**, no solo avisa, con ids deterministas que evitan duplicar. Idempotencia real en las 4 puertas de dinero. El consumo de bono es un `UPDATE...WHERE...RETURNING` atómico sin condición de carrera. Esto es ingeniería de pagos hecha por alguien que ya se ha quemado y aprendió.

3. **El modelo de datos de sustituciones está bien pensado, no improvisado.** Disponibilidad semanal + excepciones puntuales, transición de aceptación atómica (compare-and-set en Postgres), aforo con `spots` opcional que no penaliza a quien no lo usa. Y la navegación del panel entero tiene cada reordenación justificada en comentarios del propio código (por qué Marketing pasó de 8 entradas a 1, por qué Sustituciones se movió a Estudio) — señal de un equipo que revisa y corrige su propia arquitectura de información, no que la deja acumular.

### 5 problemas más graves

1. **🔴 Cancelar una clase devuelve el bono a las alumnas; eliminarla no.** Dos botones casi idénticos (una X, una papelera) en la misma barra, con consecuencias de dinero opuestas, sin ningún aviso. Una socia con clase pagada puede perder la sesión de su bono sin que nadie se dé cuenta.
2. **🔴 Si nadie acepta cubrir una clase, el sistema se rinde en silencio.** El cierre automático por falta de sustituta no avisa a la propietaria ni a nadie — puede pasar DESPUÉS de que la clase ya empezó. Es la funcionalidad que el negocio vende como diferenciador ("nunca te quedas sin cubrir una clase sin enterarte") fallando exactamente en el caso que más importa.
3. **🔴 Una candidata que ya dijo que no, puede seguir aceptando la sustitución.** El servidor no comprueba en la RPC de confirmación si la candidata que hace clic es la que el sistema tiene como "actual" — solo el cliente lo bloquea. Es un agujero de integridad de datos real, no solo teórico.
4. **🔴 Dar de alta un plan de cadena puede dejar a un estudio pagando dos suscripciones a la vez.** Un `.catch(() => {})` sin distinguir "ya estaba cancelada" de "falló de verdad" deja continuar el alta aunque la cancelación de la suscripción anterior fallase — sin ningún log, sin ninguna alerta.
5. **🔴 Dar de baja a una instructora con clases asignadas puede fallar sin explicación**, contradiciendo lo que el propio modal de confirmación promete ("las clases no se borran"). Es una acción básica de gestión de equipo que puede quedar bloqueada de forma confusa.

### 3 oportunidades con mayor potencial

1. **Cerrar el silencio del módulo de sustituciones.** Es la funcionalidad que más se parece a un diferenciador de producto real frente a bsport/Momence/Eversports ("sin llamadas, sin perseguir instructoras"), y hoy tiene dos huecos de aviso que rompen exactamente esa promesa en el peor momento. Arreglarlo es relativamente barato y el impacto en confianza/retención es directo.
2. **Clase de prueba gratuita para una alumna nueva.** No existe ningún soporte en el modelo de datos — hoy solo se puede simular con un código de descuento del 100% a mano. Es una palanca de conversión casi universal en el sector (Momence, Eversports) que falta por completo.
3. **Unificar el comportamiento destructivo del calendario** (cancelar/eliminar clase y reserva, todos sin confirmación hoy) en un único patrón con confirmación real y conteo de impacto ANTES de ejecutar, no después. Barato, reduce directamente los tickets de soporte tipo "se me ha borrado sin querer".

### 1 conclusión sobre el estado actual del producto

El núcleo técnico —dinero, aislamiento multi-tenant, atomicidad de reservas y bonos— está construido con seriedad y con historial real de bugs ya encontrados y cerrados, no con confianza ciega. Pero el patrón que domina esta pasada no es "lógica incorrecta", es **silencio**: acciones que fallan, se agotan o divergen sin que nadie se entere — el cobro individual que no dice si funcionó, el calendario que se queda "Cargando…" para siempre, la sustitución que se cierra sin avisar, la baja de instructora que falla sin explicar por qué. Ninguno de estos haría que Tentare pareciera "roto" en una demo; todos harían que una propietaria real, en la semana 3 de uso diario, dejara de confiar en que el sistema le dice la verdad. Eso es exactamente el tipo de fricción que genera tickets de soporte y erosiona retención sin que aparezca nunca en un log de errores.

---

## 🔴 P0 — CRÍTICOS

### P0-1 — "Cancelar" clase devuelve el bono; "Eliminar" clase no

**Problema**: `cancelarSesion` (`app/(dashboard)/calendario/page.tsx:1218`) devuelve el bono consumido a cada reserva CONFIRMADA. `eliminarSesion` (`app/(dashboard)/calendario/page.tsx:1282` → `deleteSesion` → `dbDeleteSesion`) hace `DELETE FROM sesiones`; la FK `reservas_sesion_id_fkey` es `ON DELETE CASCADE` y las reservas desaparecen físicamente sin que `devolverSesionBono` se invoque en ningún punto de ese camino.
**Impacto humano**: la propietaria usa la papelera pensando que es equivalente a cancelar (visualmente están una al lado de la otra) y una socia pierde una sesión de su bono sin devolución, sin que nadie lo note hasta que la socia se queje.
**KPI afectado**: Retención (confianza rota con dinero real) + Soporte (ticket típico: "me habéis cobrado una clase que no di").
**Causa probable**: `eliminarSesion` se diseñó para "borrar una clase creada por error", `cancelarSesion` para "la clase no se da pero existió" — pero ambos botones son igual de accesibles sobre una clase real con alumnas ya cobradas, y nada en la UI distingue la consecuencia.
**Solución**: o bien `eliminarSesion` llama a la misma lógica de devolución de bono que `cancelarSesion` antes del DELETE, o se retira el botón "Eliminar" de cualquier clase con reservas activas (forzando siempre pasar por "Cancelar").
**Prioridad**: P0.

### P0-2 — Sustitución agotada: cierre automático que no avisa a nadie

**Problema**: `lib/sustituciones/cerrar-vencidas.ts:19-59` (barrido final por `sin_sustituta`) solo hace `UPDATE estado='sin_sustituta'`, sin llamar a `alertarPropietaria` ni al motor de notificaciones. En modo asistido (el modo por defecto), el único aviso a la propietaria se dispara una vez al crear la baja — sin recordatorio si se pierde.
**Impacto humano**: una clase se queda sin cubrir y la propietaria se entera al abrir el panel por curiosidad, potencialmente después de que la hora de clase ya pasó. Alumnas se presentan sin nadie.
**KPI afectado**: Retención (rompe la promesa de marca central del módulo) + Soporte.
**Causa probable**: el cierre por `agotada` (ranking se agota durante escalado activo) SÍ avisa — el cierre por `sin_sustituta` (sustitución que nunca llegó a escalar, típico del modo asistido sin acción de la propietaria) se trató como un caso distinto y se dejó sin la misma llamada.
**Solución**: `cerrar-vencidas.ts` debe emitir el mismo aviso (email+push, igual que `agotada`) al marcar `sin_sustituta`. Añadir además un recordatorio intermedio si una sustitución sigue en `pendiente_aprobacion` sin acción de la propietaria pasado un umbral (p. ej. 2h antes de la clase).
**Prioridad**: P0.

### P0-3 — Bug de seguridad: una candidata que rechazó puede seguir aceptando la sustitución

**Problema**: `confirmar_sustitucion` (`0048_sustituciones_confirmar_sin_solape.sql:58-69`) hace `UPDATE ... WHERE estado IN (...)` sin comprobar que quien llama sea `candidata_actual`. El token no se invalida en servidor al rechazar (solo expira a las 3h), y `app/api/public/aceptar-sustitucion/route.ts:27-44` no repite en servidor la comprobación de `ultimaRespuestaDe` que sí hace la página en cliente.
**Impacto humano**: si alguien reabre/reenvía la petición de aceptación tras haber rechazado, puede arrebatarle la clase a la candidata que el sistema ya movió como actual, sin ningún error visible — la propietaria descubre una asignación que no esperaba.
**KPI afectado**: Confianza/Retención + riesgo de integridad de datos.
**Causa probable**: la protección de "solo la candidata actual puede aceptar" solo se implementó en la capa de presentación (SSR), no en el endpoint que ejecuta la mutación.
**Solución**: el endpoint `aceptar-sustitucion` debe validar contra `sustitucion_contactos`/`candidata_actual` antes de llamar a la RPC, o la propia RPC debe recibir y comprobar el id de la candidata esperada.
**Prioridad**: P0.

### P0-4 — Alta de plan CADENA puede dejar dos suscripciones cobrando en paralelo

**Problema**: `app/api/billing/checkout/route.ts:120-124` — `stripe.subscriptions.cancel(...).catch(() => {})` silencia CUALQUIER error, no solo "ya estaba cancelada". Si `cancel()` falla por timeout/rate-limit/clave inválida, el flujo sigue igual y crea la suscripción de cadena nueva sin haber cancelado la individual.
**Impacto humano**: el estudio queda cobrado dos veces (individual + cadena) sin que nadie —ni la propietaria ni Marco— se entere hasta cuadrar la factura de Stripe.
**KPI afectado**: Confianza (dinero real cobrado de más) + Soporte (disputa/reembolso manual).
**Causa probable**: el catch se escribió pensando solo en el caso feliz ("ya estaba cancelada, no bloquea el alta") y no distingue de un fallo real; no hay log ni Sentry, a diferencia del resto de `stripe-cobros.ts`.
**Solución**: distinguir el código de error de Stripe (`resource_missing` = ok, cualquier otro = bloquear el alta o al menos loguear a Sentry y avisar); considerar un cron que audite estudios con más de un `subscription_id` activo para el mismo cliente Stripe.
**Prioridad**: P0.

### P0-5 — Dar de baja a una instructora con clases asignadas puede fallar sin explicación, contradiciendo la UI

**Problema**: el modal de baja promete *"Las clases y citas ya asignadas no se borran, pero quedarán sin instructor visible"*, pero `bajaInstructora` (`lib/actions/equipo/equipoAction.ts:273`) hace `DELETE` real sobre `instructores`. **Verificado en producción**: la FK `sesiones_instructor_id_fkey` es `NO ACTION` (no `SET NULL`) — el DELETE falla con `23503` para cualquier instructora con al menos una `sesion` asignada, capturado genéricamente como "No se ha podido dar de baja".
**Impacto humano**: una acción básica de gestión de equipo (dar de baja a alguien que se va) queda bloqueada sin explicación, para el caso más común (una instructora que ya ha dado clases).
**KPI afectado**: Onboarding del equipo/Retención + Soporte (ticket directo: "no puedo dar de baja a X").
**Causa probable**: la FK se declaró sin `ON DELETE SET NULL` en la migración base y nunca se corrigió; el modal se escribió asumiendo un comportamiento que el esquema no da.
**Solución**: cambiar el DELETE por `activo=false` (soft-delete, coherente con el resto del producto) o añadir la migración que ponga `ON DELETE SET NULL` en esa FK; en cualquier caso, capturar el `23503` específico y decir la causa real en vez de un mensaje genérico.
**Prioridad**: P0.

---

## 🟠 P1 — IMPORTANTES

### P1-1 — `marcarCobrado` no informa si el cobro individual falla
`app/(dashboard)/dashboard/page.tsx:1159` descarta el resultado de la promesa — sin toast, sin error. "Cobrar todos", dos líneas arriba, sí lo hace. Impacto: la propietaria no sabe si un cobro individual se ejecutó de verdad, en la pantalla de entrada. KPI: Confianza + Soporte. Solución: replicar el manejo de `res.ok` del botón "Cobrar todos".

### P1-2 — El calendario puede quedarse en "Cargando…" para siempre
`app/(dashboard)/calendario/page.tsx:2255-2256` sin skeleton; `cargarDatosVista` tiene un `catch` silencioso que no actualiza el estado. Un fallo de red/500 en la primera carga deja la pantalla del uso más frecuente aparentando estar rota, indistinguible de un cuelgue real. `/centro-de-control` ya tiene el patrón correcto (skeleton + botón "Reintentar") — falta aplicarlo aquí. KPI: Soporte (ticket "se me ha colgado la app") + Retención. Prioridad alta por ser la pantalla más usada del panel.

### P1-3 — Cancelar/eliminar una clase completa: sin confirmación, impacto se descubre después
`app/(dashboard)/calendario/page.tsx:2356-2361` — ambos botones van directo a la acción. El conteo de alumnas afectadas solo aparece en el toast POSTERIOR. Combinado con P0-1, un clic accidental en la papelera de una clase llena borra reservas y no devuelve bono. KPI: Soporte + Confianza. Solución: modal de confirmación que muestre cuántas alumnas se ven afectadas ANTES de ejecutar.

### P1-4 — Cancelar una reserva individual: sin confirmación
`components/calendario/lista-clientas.tsx:157` y `dashboard/page.tsx:388` — un clic directo, sin diálogo. Para una clase con lista de espera, promueve automáticamente a la siguiente persona, así que un clic accidental deja de ser trivialmente reversible. KPI: Soporte.

### P1-5 — Onboarding wizard de 11 preguntas sin salida ni persistencia
`components/onboarding/pantalla-bienvenida.tsx` sustituye TODO el layout, sin botón "Saltar"/"Ahora no", estado en memoria (`useRef`) — recargar la pestaña a mitad = repetir desde cero. Impacto: propietaria recién registrada se topa con 11 decisiones obligatorias más; un WiFi que falla le hace perder todo. KPI: Conversión de onboarding directamente. Solución: persistir en `localStorage` (igual que `/crear-estudio`) y añadir una salida explícita.

### P1-6 — Checklist de "primeros pasos" marca "hecho" un paso que no funciona todavía
`lib/onboarding.ts:109` cuenta cualquier plan sin filtrar `activo`; los bonos del wizard se crean con `activo:false, precio:0` a propósito. La propietaria ve "✓ Configura tus bonos" tachado aunque el bono no sea vendible todavía. KPI: Conversión (falsa sensación de "ya puedo cobrar") + Soporte ("¿por qué mi bono no aparece en la reserva pública?"). Solución: filtrar por `activo && precio > 0`.

### P1-7 — N+1 en el widget público de citas 1:1
`components/reserva/citas-publica.tsx:114` — al elegir "Cualquier instructora", 1 petición HTTP por instructora (~4 queries cada una) contra un endpoint con rate-limit de 60/min. Con 4-6 instructoras del mismo servicio, una socia navegando varios días puede agotar la cuota y ver "sin huecos" cuando es un 429. KPI: Conversión (booking de citas 1:1, un flujo de dinero real) + Soporte. Solución: aceptar lista de `instructorId` en un único endpoint.

### P1-8 — Lista de espera con plazo: aviso solo por push, sin refuerzo
El evento de "tienes una oferta con plazo" (`catalog.ts:268`) es solo PUSH+in-app, a diferencia de eventos críticos del sistema que llevan 4 canales. Si la socia no tiene push activado, puede perder su plaza sin enterarse a tiempo — y encima nadie audita si el cron entero (no solo fallos individuales) deja de dispararse. KPI: Retención (la socia pierde su turno sin explicación aparente) + Soporte.

### P1-9 — `.catch(()=>{})` genéricos, `window.alert()` como fallback de UX
7 sitios usan `window.alert()` en vez del sistema de toast (`panel-pendientes.tsx`, `calendario/page.tsx`), justo en cobros y calendario — el lugar donde más se necesita consistencia. KPI: Confianza/pulido percibido, no bloquea nada.

### P1-10 — Solidez del dato "Sin asistencia" — verificar en producción
El código ya distingue "Sin datos" de "Sin asistencia reciente" (`clientas/page.tsx:340-407`), pero el usuario reportó explícitamente que sigue viendo "Sin asistencia" en todas — si esto persiste en producción hoy, es un problema de caché/deploy y merece verificación directa antes de cerrarlo, porque el impacto (confianza en los datos del panel) es real si sigue ocurriendo.

---

## 🟡 P2 — MEJORAS

- **"IA" visible en 7+ pantallas del panel** (incluido "Automatizaciones IA" en el sidebar permanente) — contradice la decisión de marca de usar "automático". Detalle sistemático, no funcional. `lib/nav-config.ts:31`, `calendario/page.tsx:2438`, `ficha-salud.tsx:593`, etc.
- **Reembolso no revierte bono/plaza automáticamente** — decisión de producto correcta (evita quitar sesiones ya pagadas de verdad en el caso de doble cargo), pero sin cron que escale si la devolución queda sin resolver X días. Añadir esa escalada.
- **Huecos reales del modelo de datos**: pack familiar/bono compartido (sin soporte), descuento por antigüedad (sin soporte), prioridad en lista de espera por importe pagado (confirmado FIFO estricto). Ninguno bloquea el producto hoy, todos son features de retención/venta habituales del sector.
- **Trampa activa en el código**: `dbInsertReserva` (`lib/supabase-data.ts:2509-2512`) es el bug de overbooking ya arreglado una vez, dejado vivo — cero llamadas hoy pero cualquiera que busque "insertar reserva" la encuentra antes que la función correcta. Borrar.
- **Theming/white-label (~7.300 líneas, 7 suites de test) sin evidencia de demanda real** — a diferencia del Decision OS (que nació de feedback de una cadena real), no hay señal en el repo de que un cliente lo haya pedido. Verificar cuántos estudios reales lo usan antes de seguir invirtiendo ahí.
- **Decision OS — sofisticación por delante del volumen de datos real**: la calibración adaptativa exige mínimo 5 muestras en 90 días y hoy solo hay 1 socia de 202 con tarjeta guardada. Las 4 fases básicas son razonables; las capas de aprendizaje/detección de conflictos son las de menor ROI hoy.
- **Empty states inconsistentes**: `EmptyState` usado en cobros pero cero veces en calendario/clientas — cada uno con su solución hecha a mano.
- **Tablas del panel sin tratamiento móvil consistente**: `informes/page.tsx:555` sin `overflow-x-auto` a diferencia de otras tablas del mismo archivo (impacto probablemente menor, pantalla secundaria) — **HIPÓTESIS, necesita verificación visual en 375px**.
- **Grids de 2 columnas fijos en formularios** (`clientas/page.tsx:1291,1317`, `calendario/page.tsx:2569,2624`) sin breakpoint `sm:`, mientras el patrón correcto ya existe 2 líneas más abajo en el mismo archivo — inconsistencia de aplicación. **HIPÓTESIS sobre impacto visual real**.
- **`devolverSesionBono` fire-and-forget** tras cancelar reserva individual: si falla, solo llega a Sentry, nadie del estudio se entera. Menor que P0-1 porque aquí sí hay intención de devolver, solo falta feedback si falla.
- **`app/api/terminal/cobrar/route.ts:76`** — único punto de creación de PaymentIntent sin `idempotencyKey` confirmado en el grep; verificar (doble-tap del datáfono físico).
- **Riesgo residual documentado de doble adeudo SEPA** en `cobrarReciboOffSession` (ventana de purga de 24h de la Idempotency-Key) — ya señalado en el propio código como "sin red hoy", solo SEPA.

---

## 🔵 P3 — POLISH

- Inconsistencia terminológica "Socia" vs "Clienta" dentro del mismo panel (`libreta/page.tsx:71`, `notificaciones/page.tsx:28`) — menor, coherente con la convención de dominio-en-español-libre del repo.
- Resumen de ventas recientes en el dashboard — no verificado si existe más allá de agregados mensuales; pendiente de mirar sin urgencia.

---

## CORE LOOP

**El core loop real de Tentare**: entrar por la mañana → ver quién viene hoy a clase → hacer check-in → cobrar lo que esté pendiente. Es, con razón, la primera pantalla del panel (`app/(dashboard)/dashboard/page.tsx`, sin redirect a ningún otro sitio), con check-in inline sin salir de la tarjeta y una tarjeta de "Pagos pendientes" con "Cobrar"/"Cobrar todos" en la misma pantalla — 0 a 2 navegaciones para el caso normal. Esto está **bien diseñado**.

¿Es rápido, claro, fiable y repetible?
- **Rápido**: sí, medido en clics (confirmado por código).
- **Claro**: sí en el caso feliz (toasts específicos, contadores de éxito/fallo en lote).
- **Fiable**: no del todo — el propio botón de cobro individual en esa primera pantalla (`marcarCobrado`) no dice si funcionó (P1-1), y el calendario al que se navega para gestión más profunda puede quedarse "Cargando…" sin salida (P1-2). Un loop que falla en silencio deja de sentirse fiable aunque técnicamente funcione la mayoría de las veces.
- **Repetible**: sí — el Decision OS/"El Umbral" añade una capa proactiva genuina (un push al día, sin diluir la promesa con más canales) que da una razón real para volver más allá del check-in diario, y está resuelta con criterio de producto (colapsó "dos inicios compitiendo" en una sola fuente de verdad).

El loop en sí está bien pensado. Lo que lo debilita no es su diseño sino los agujeros de fiabilidad en sus dos acciones más frecuentes (cobrar, cargar el calendario).

---

## TOP 10 CAMBIOS

1. **Unificar el comportamiento de bono entre "Cancelar" y "Eliminar" clase** → cierra P0-1, el mayor riesgo de pérdida de confianza con dinero real → KPI: Retención/Soporte → Impacto: alto → Complejidad: baja.
2. **Avisar siempre que una sustitución se cierre sin cubrir** (`sin_sustituta` + recordatorio en `pendiente_aprobacion`) → cierra P0-2, la promesa central del módulo → KPI: Retención → Impacto: alto → Complejidad: baja-media.
3. **Validar en servidor que solo la candidata actual puede confirmar una sustitución** → cierra P0-3, integridad de datos → KPI: Confianza → Impacto: alto (aunque poco frecuente) → Complejidad: baja.
4. **Distinguir "ya cancelada" de "fallo real" en la cancelación de suscripción al dar de alta CADENA** → cierra P0-4, riesgo de doble cobro → KPI: Confianza/dinero real → Impacto: alto → Complejidad: baja.
5. **Arreglar la baja de instructora** (soft-delete o `SET NULL` en la FK) → cierra P0-5, acción básica de equipo bloqueada → KPI: Soporte/Retención → Impacto: alto → Complejidad: media.
6. **`marcarCobrado` con manejo de resultado real** → cierra P1-1 → KPI: Confianza → Impacto: medio-alto (pantalla de entrada) → Complejidad: trivial.
7. **Calendario: reemplazar "Cargando…" infinito por skeleton+error+reintentar** (mismo patrón ya usado en Centro de Control) → cierra P1-2 → KPI: Soporte → Impacto: alto (pantalla más usada) → Complejidad: baja.
8. **Confirmación con conteo de impacto antes de cancelar/eliminar clase o reserva** → cierra P1-3/P1-4 → KPI: Soporte → Impacto: medio-alto → Complejidad: baja.
9. **Persistir el wizard de bienvenida y añadir salida explícita** → cierra P1-5 → KPI: Conversión de onboarding → Impacto: medio → Complejidad: baja-media.
10. **Clase de prueba gratuita para alumna nueva** (nuevo, no un bug) → cierra la oportunidad #2 del resumen ejecutivo → KPI: Conversión (venta del estudio a sus propias alumnas) → Impacto: alto a medio plazo → Complejidad: media (nuevo campo de modelo + lógica de un solo uso).

---

## VEREDICTO

**¿Está Tentare preparado para estudios reales usándolo a diario?** Sí, con matices. El núcleo (reservas, aforo, pagos, RLS) aguanta uso diario real sin sobreventa ni fuga de datos entre estudios — verificado, no supuesto. Pero hay una media docena de acciones cotidianas (cancelar una clase, dar de baja a alguien del equipo, cobrar desde el dashboard) donde el sistema puede fallar sin avisar, y eso sí se nota en el uso diario aunque no en una demo.

**¿Qué es lo que más frena su crecimiento?** No es que falte funcionalidad — sobra, si acaso. Es que las acciones de dinero y de equipo tienen puntos ciegos de confianza (P0-1 a P0-5) que, en un producto que se vende como "más fiable que Momence/Bsport", son exactamente el tipo de fallo que un estudio real cuenta a otro estudio.

**¿Cuál es el mayor problema de UX?** El silencio. No hay un flujo roto de forma visible — hay múltiples flujos que fallan o se agotan sin decírselo a nadie (calendario colgado, sustitución sin cubrir, cobro sin confirmar). Es más difícil de detectar que un botón que no funciona, y por eso mismo más peligroso.

**¿Cuál es el mayor problema técnico que afecta a la propietaria del estudio?** La divergencia de comportamiento entre "Cancelar" y "Eliminar" una clase (P0-1) — es el único hallazgo que combina alta probabilidad de ocurrir (dos botones parecidos, uso frecuente) con impacto directo en dinero de una alumna real.

**¿Qué está afectando más a la conversión del onboarding?** El wizard de 11 preguntas sin salida ni persistencia (P1-5). No es que sea largo — es que no hay forma de posponerlo ni sobrevive a un refresco de página, justo en el momento más frágil de todo el ciclo de vida de un cliente nuevo.

**¿Qué podría estar provocando churn?** (Hipótesis, sin clientes de pago que lo confirmen todavía) Los agujeros de silencio del módulo de sustituciones (P0-2) son el candidato más fuerte: es la funcionalidad que más se parece a una razón para pagar por Tentare en vez de gestionar sustituciones por WhatsApp a mano, y falla exactamente en el escenario de estrés real (nadie responde a tiempo).

**¿Qué generaría más dependencia de soporte si esto escalara a decenas de estudios?** Los flujos destructivos sin confirmación (P1-3, P1-4) combinados con P0-1 — son la categoría de ticket más cara de resolver (alguien perdió dinero o una clase, hay que investigar qué pasó exactamente) y la más fácil de evitar con un modal.

**¿Qué NO tocaría ahora mismo?** El diseño del alta, la prueba gratuita, la arquitectura de pagos (idempotencia+conciliación) y el modelo de datos de sustituciones/bonos. Están construidos con criterio y ya tienen su propio historial de bugs reales encontrados y cerrados — tocarlos sin una razón concreta es más riesgo que beneficio.

**Si solo se pudieran arreglar 3 cosas esta semana:**
1. Unificar el bono entre "Cancelar"/"Eliminar" clase (P0-1) — mecánico, bajo riesgo, cierra la fuga de dinero más probable.
2. Avisar cuando una sustitución se cierra sin cubrir (P0-2) — protege la promesa de marca en el peor momento posible.
3. Arreglar el `.catch` silencioso del alta de CADENA (P0-4) — previene un doble cobro real, cambio de una línea.

(El bug de seguridad en sustituciones, P0-3, y la baja de instructora, P0-5, son igual de importantes pero exigen tocar una RPC/migración con más cuidado — encajan mejor en la semana 2 que en un arreglo de emergencia de esta semana.)

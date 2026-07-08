# Auditoría técnica — Pilates SaaS
### Due diligence estilo pre-inversión. Sin cortesías.

**Auditor:** CTO externo contratado para decidir si esto se puede vender.
**Fecha:** 8 julio 2026
**Base analizada:** 116 archivos TS/TSX · ~32.200 líneas · 92 commits · 46 tablas Supabase · 0 tests · 0 CI

---

## Resumen en una frase

Tienes **un producto real, no una maqueta** — con más profundidad funcional de la que esperaba (Stripe Connect de verdad, gamificación completa, check-in con lógica de negocio real). Pero está **construido sobre una base de datos abierta a internet**: cualquiera con la URL pública puede leer y modificar los datos de clientes de todos los estudios, y hay endpoints que **cobran tarjetas sin autenticación**. En su estado actual **no se puede vender ni poner un cliente real encima**. No por falta de features, sino porque es un incidente de seguridad y RGPD esperando a ocurrir.

---

## 1. Estado real del proyecto

| Área | % real | Por qué |
|---|---|---|
| **Frontend** | **70%** | Muchísima UI construida y funcional, pero monolítica (páginas de 1.300–1.900 líneas), sin componentes compartidos, sin estados de carga/error finos. Funciona, pero es caro de mantener. |
| **Backend** | **35%** | La "lógica" vive en el cliente (contexto de 2.125 líneas). Las rutas de servidor son 748 líneas en total y **casi ninguna tiene auth**. No hay capa de negocio server-side real. |
| **Base de datos / modelo** | **55%** | Modelo de datos rico y bien pensado (46 tablas, multi-tenant por `studio_id`). Pero las políticas RLS están rotas de forma crítica (abiertas a `anon`). El modelo es bueno; la seguridad de acceso, no. |
| **Infraestructura** | **20%** | Sin tests, sin CI/CD, sin migraciones versionadas (un solo `schema.sql` que "pegas en el editor"), sin observabilidad, sin entornos separados, backups caseros dentro de la propia DB. |
| **Producto** | **65%** | ~70% de módulos funcionales de verdad, ~25% parciales, un par de fachadas. El core (reservas) tiene un bug de aforo. |
| **Listo para producción** | **15%** | Un solo fallo (RLS `anon` + endpoints sin auth) lo tumba. No es opinable: hoy expones datos personales de clientes a cualquiera. |

**Traducción sin diplomacia:** en features pareces al 65–70%. En "puedo cobrar dinero a un estudio real y dormir tranquilo" estás al 15%. La distancia entre esas dos cifras es exactamente tu problema.

---

## 2. Qué está realmente terminado

- **Integración Stripe Connect** — nivel producción, no de juguete. Checkout como *direct charge* sobre la cuenta conectada del estudio, guardado de tarjeta (`setup_future_usage: off_session`), cobro off-session con manejo de 3DS y gate de aprobación humana, y **webhook con firma verificada como fuente de verdad** (incluido secret separado para Connect). Esto está sorprendentemente bien.
- **Check-in / kiosk** — lógica de negocio real: marca asistencia, descuenta sesión del bono, otorga créditos, evalúa logros y **auto-genera recibo de renovación** cuando el bono llega a 0.
- **Gestión de socios** — CRUD completo, filtros inteligentes, alta con email de bienvenida, asignación masiva de plan, ficha de socio con suscripciones, recibos, notas internas y notas de progreso con IA real.
- **Gamificación completa** — créditos, recompensas, catálogo/canjes, logros, retos, niveles, rachas, con engines dedicados y tablas propias, evaluados en vivo.
- **Informes** — KPIs con matemática real (MRR/ARR, ticket medio, retención, cohortes, ocupación). No son números falsos.
- **Citas 1:1, transacciones, POS (venta), equipo/roles, automatizaciones** (motor real con 3 triggers y envío real por Resend).
- **IA real** (Anthropic `claude-haiku-4-5`) en asistente de campañas y notas de instructor.

---

## 3. Lo que *parece* terminado pero no lo está

- **Aforo y lista de espera (el más grave del core).** La página pública de reserva calcula "clase llena" y te enseña una pantalla de "estás en lista de espera"… pero `addReserva()` escribe **siempre `estado: 'CONFIRMADA'`**. Resultado: **se puede sobrevender la clase**, y las filas `LISTA_ESPERA` reales nunca se crean (solo el flujo de cancelación las lee). El corazón de un software de reservas no respeta el aforo.
- **Consumo de sesiones.** El bono solo se descuenta en el **check-in**, no al reservar. Un socio puede reservar clases futuras ilimitadas sin que baje su bono.
- **Campañas de marketing.** Se guardan como BORRADOR pero **no hay acción de "enviar"**. Las estadísticas de aperturas/clics que muestra son siempre 0.
- **Portal de socios = autenticación falsa.** Es una sesión en `localStorage` (`{socioId, nombre, email}`), sin contraseña ni JWT. Cualquiera edita su localStorage y suplanta a cualquier socia.
- **Emails atados al sandbox de Resend** (`onboarding@resend.dev`): solo llegan al dueño de la cuenta hasta verificar dominio. Hoy tus emails no llegan a los clientes.
- **Export PDF de informes** es un `setTimeout` de 1.200 ms (`simulatePDF()`), no genera nada.
- **Fachadas menores** (honestamente etiquetadas "Próximamente"): pestaña de productos POS con `save()` vacío, POS sin control de stock, comentarios de comunidad que no persisten, vídeos on-demand/portal sin reproductor, Verifactu/AEAT pendiente, 7 integraciones de gimnasios (ClassPass, Wellhub, etc.) como stub.
- **Código muerto:** `lib/mock-data.ts` (47 KB) y `new-mock-data.ts` no se importan en ningún sitio. Bórralos.
- **`current_studio_id()` cae por defecto a `'studio-1'`** hardcodeado si no resuelve el usuario. Un fallo de resolución te mete en el tenant equivocado en silencio.

---

## 4. Crítico para lanzar — por prioridad

### P0 — Imprescindible (bloquea el lanzamiento, no negociable)
1. **Cerrar RLS.** Eliminar todas las políticas `to anon using (true)` sobre `socios`, `suscripciones`, `reservas`, `recibos`, `preferencias_socio`. Hoy toda la PII de clientes (nombre, email, teléfono, NIF) de **todos** los estudios es leíble y editable por cualquiera con la anon key (que viaja en el bundle). Esto es una brecha RGPD directa.
2. **Autenticar los endpoints de API.** `/api/stripe/charge-off-session` **cobra una tarjeta guardada recibiendo IDs por el body, sin auth** → cualquiera puede cargar dinero a cualquier tarjeta. `/api/stripe/checkout`, `/api/emails/send` y `/api/ai/*` tampoco tienen auth (spam y denial-of-wallet de tu presupuesto Anthropic). Verificar sesión y pertenencia al estudio en todas.
3. **Auth real en el portal de socios.** Sustituir localStorage por Supabase Auth (o al menos magic link + JWT). Hoy la suplantación es trivial.
4. **Arreglar aforo/lista de espera.** Que `addReserva` respete capacidad y cree `LISTA_ESPERA` real. Sin esto, el producto no hace lo que promete.

### P1 — Muy importante
5. Consumir sesión del bono al reservar (con reversión al cancelar).
6. Verificar dominio de email (Resend) para que los correos lleguen de verdad.
7. Poder **enviar** campañas de marketing (no solo guardarlas).
8. Migraciones versionadas + separar entornos (dev/staging/prod). El `schema.sql` "pégalo en el editor" no escala ni es auditable.
9. Sentry/observabilidad y un mínimo de tests sobre los flujos de dinero y reservas.

### P2 — Puede esperar
10. Refactor del god-context y de las páginas monolíticas.
11. Verifactu/AEAT, integraciones de gimnasios, reproductor de vídeo, stock en POS.
12. Export PDF real, comentarios persistentes en comunidad.

---

## 5. Auditoría técnica (lo crudo)

**Seguridad — es aquí donde el proyecto se cae:**
- RLS abierto a `anon` con `using(true)` en las tablas con datos personales y financieros. **Descalificatorio.**
- Endpoints de servidor sin autenticación, incluido uno que **cobra tarjetas**. **Descalificatorio.**
- Portal de socios sin auth real (localStorage).
- Sin `middleware.ts`: cero protección de rutas a nivel de edge.
- `current_studio_id()` con fallback a `'studio-1'`: fuga silenciosa entre tenants.

**Arquitectura y deuda técnica:**
- **God-context de 2.125 líneas** (`studio-context.tsx`): 49 `useState`, 96 funciones, objeto `value` con 142 campos y **cero `useMemo`/`useCallback`**. Cada cambio de estado re-renderiza a todos los consumidores. No escala.
- **Carga las 46 tablas en un `Promise.all` al montar**, sin paginación ni lazy-loading. Un estudio con histórico grande carga todo a memoria en cada visita.
- **Páginas monolíticas** de 1.300–1.900 líneas que mezclan fetch + lógica + JSX + modales inline (`socios/[id]` tiene un `return` de 994 líneas; `pagos`, 1.015).
- **Duplicación sistemática de primitivas UI**: `inputCls` copiado en 9 archivos, un `FormField` reimplementado en 7, `Toast` duplicado. Nada extraído a `components/ui`.
- **142 `any`** concentrados en `supabase-data.ts` (mappers de DB sin tipar). Solucionable de golpe con tipos generados por Supabase.
- **Escritura optimista fire-and-forget** sin refetch/reconciliación: cliente y servidor pueden divergir en silencio si una escritura falla.

**Lo bueno de la auditoría (para ser justo):**
- **No** hay basura de debug: 0 `console.log`, 0 código comentado, solo 3 TODOs reales (los "155 TODO" del grep son la palabra española "todo").
- Manejo de errores de escritura mejor de lo típico (`reportDbError` con toast), aunque hay ~7 `catch {}` que tragan errores reales.
- Modelo de datos coherente y multi-tenant desde el diseño.

**Infra / proceso:** 0 tests, 0 CI, sin migraciones, backups guardados dentro de la propia base de datos (si pierdes la DB, pierdes los backups). Para una due diligence, esto es un cero.

---

## 6. Auditoría de producto vs. competencia

**Qué tienes MEJOR o al nivel de los grandes:**
- Gamificación (créditos, logros, retos, niveles, rachas) más profunda que Mindbody o Eversports de serie. Es tu diferenciador real.
- Cobro con tarjeta guardada + gate de aprobación humana: elegante.
- IA integrada (campañas, notas de progreso) — a esto bsport/Fresha aún están llegando.
- Enfoque vertical claro en pilates (spots/posiciones en sala, niveles de clase).

**Qué te FALTA para competir con bsport / Eversports / Virtuagym / Fresha:**
- **Fiabilidad del core**: ellos no sobrevenden clases. Tú sí, hoy.
- **App móvil nativa** para el socio (tú tienes portal web con auth falsa).
- **Marketplace / descubrimiento** (bsport y Eversports traen clientes nuevos; tú no).
- **Facturación fiscal real** (Verifactu/AEAT) — pendiente, y en España es obligatorio.
- **Integraciones** ClassPass/Wellhub/Urban Sports que llenan clases — todas stub.
- **Notificaciones push / SMS / WhatsApp** reales.
- **Seguridad y cumplimiento certificables** (RGPD, SOC2-lite) — hoy suspendes.

**Veredicto de producto:** el alcance funcional es impresionante para lo que parece un proyecto de una persona. La ejecución en fiabilidad, seguridad y cumplimiento es de prototipo.

---

## 7. Experiencia de usuario / navegación

Tienes **20 módulos en el dashboard**. Es demasiado para el dueño de un estudio de pilates, que quiere: llenar clases, cobrar y no liarse. Estás compitiendo en "número de pestañas" cuando deberías competir en "3 clics para lo que hago cada día".

- **Fusionaría:** `pagos` + `transacciones` + `facturas` → un solo "Finanzas". `chat` + `mensajeria` + `notificaciones` → "Comunicación". `marketing` + `automatizaciones` → "Crecimiento".
- **Escondería hasta que funcionen:** `ondemand`, `comunidad`, `productos` (POS), integraciones. Un módulo a medias resta confianza más de lo que suma valor.
- **Núcleo que debe brillar:** Calendario, Socios, Reservas, Cobros. Ahí es donde el estudio vive el 95% del tiempo.
- **Le falta:** un onboarding guiado (crear estudio → primera clase → primer socio → primer cobro en <10 min) y una app móvil del socio.

Regla: menos módulos, más terminados. Hoy transmites "hace de todo un poco"; el dueño quiere "hace lo mío perfecto".

---

## 8. Si fuera un cliente (dueño de estudio)

**¿Pagaría? Sí, pero…** — y el "pero" es grande.

Pagaría porque la gestión diaria (socios, calendario, cobros, check-in, gamificación) está y se ve profesional. Me engancharía la gamificación y el cobro automático.

**No pagaría hoy porque:** mis emails a clientes no llegan (sandbox), puedo sobrevender una clase y quedar mal delante de mi cliente, y —si me entero— que los datos de mis socias estén expuestos en internet me hace huir. Un dueño de estudio no entiende de RLS, pero sí entiende "salió mi lista de clientas en un foro". Eso me cierra el negocio.

**Conclusión:** el producto genera deseo. La confianza operativa aún no está.

---

## 9. Si fuera un inversor

**Lo que me impresionaría:** un solo fundador (aparentemente) ha construido un producto vertical amplio, con Stripe Connect serio, gamificación real e IA integrada, en 92 commits. Demuestra capacidad de ejecución de producto por encima de la media.

**Mis dudas / lo que frenaría el cheque:**
- **Riesgo legal inmediato:** exposición de PII + RGPD. En una due diligence de verdad, esto es un *red flag* que congela la ronda hasta remediarlo. Nadie invierte encima de una brecha activa.
- **Todo en el cliente, nada de tests, sin CI, sin migraciones:** la deuda técnica se pagará con intereses al escalar.
- **¿Foso defensible?** La gamificación es copiable; el marketplace y las integraciones de los incumbentes no lo son. ¿Cuál es la distribución?
- **Métricas:** 0 clientes de pago. Todo es potencial, aún no tracción.

**Lo diría así:** "Talento de producto evidente, arquitectura de prototipo, y un problema de seguridad que hay que arreglar antes de que hablemos de valoración."

---

## 10. Roadmap

### Esta semana (parar la hemorragia)
- Cerrar las políticas RLS `anon`. Reescribir el acceso del portal para que use auth real, no `using(true)`.
- Poner auth en `charge-off-session`, `checkout`, `emails/send`, `ai/*`.
- Arreglar `addReserva` para respetar aforo y crear lista de espera real.
- Quitar el fallback `'studio-1'` de `current_studio_id()`.

### Este mes
- Auth real del portal (Supabase Auth / magic link). Consumo de sesión al reservar.
- Verificar dominio de email. Enviar campañas de verdad.
- Migraciones versionadas + staging separado. Sentry. Tests sobre dinero y reservas.
- Borrar código muerto (mock-data). Extraer 4–5 primitivas UI compartidas.

### Próximos 3 meses
- Trocear el god-context (Zustand/Jotai o contextos por dominio) + tipos generados de Supabase para matar los 142 `any`.
- Lazy-load por ruta en vez de cargar 46 tablas al montar.
- Verifactu/AEAT (obligatorio en España). App móvil del socio (aunque sea PWA sólida).
- Simplificar navegación a 6–8 módulos.

### Antes de vender
- Pentest externo + revisión RGPD documentada (registro de actividades de tratamiento, DPA con Stripe/Resend/Anthropic).
- 99.9% de fiabilidad demostrable en el flujo de reserva/cobro. Runbook de backups probado (fuera de la propia DB).
- Onboarding self-service <10 min. Página de estado/observabilidad.

### Después de los primeros 20 clientes
- Marketplace/descubrimiento o integración con ClassPass/Wellhub (canal de adquisición).
- Multi-idioma / multi-país, IVA por región.
- Roles y permisos granulares auditados. SOC2-lite.
- Refactor de las páginas monolíticas guiado por dónde más duele en soporte.

---

## 11. Nota final (1–10)

| Dimensión | Nota | Comentario |
|---|---|---|
| Arquitectura | **4** | Multi-tenant bien pensado, pero god-context + lógica en cliente + sin server layer. |
| Backend | **3** | 748 líneas, casi sin auth, uno cobra tarjetas sin protección. |
| Frontend | **6** | Mucho hecho y funcional, pero monolítico y duplicado. |
| Diseño | **7** | Se ve profesional y coherente ("estilo Apple Fitness/Strava"). Tu punto fuerte visible. |
| UX | **5** | Demasiados módulos, varios a medias; falta onboarding y foco. |
| Producto | **6** | Alcance impresionante, pero el core (aforo) falla y falta cumplimiento. |
| Escalabilidad | **3** | Carga 46 tablas al montar, sin memoización, sin paginación. |
| Calidad de código | **5** | Limpio de basura, pero god-files y 142 `any`. |
| Mantenibilidad | **4** | Páginas de 1.900 líneas y contexto de 2.125 asustan a cualquier segundo dev. |
| **Potencial comercial** | **7** | Vertical claro, diferenciador real (gamificación+IA), ejecución rápida. Aquí está el valor. |
| **Seguridad (extra)** | **1** | PII expuesta a `anon` + cobro sin auth. Descalificatorio hasta remediar. |

---

## 12. Lo más importante — "Si este proyecto fuera mío, esto es lo que haría en 30 días"

**Semana 1 — Dejo de sangrar.** No toco ni una feature nueva. Cierro las políticas RLS abiertas a `anon` (socios, suscripciones, reservas, recibos, preferencias). Meto autenticación real en los cuatro endpoints desnudos, empezando por `charge-off-session`, que hoy cobra tarjetas a quien pase un ID. Quito el fallback `'studio-1'`. Al acabar la semana, los datos de clientes ya no están en la calle y nadie puede cobrar tarjetas ajenas. Esto es lo único que importa hasta que esté hecho.

**Semana 2 — Hago que el core no mienta.** Arreglo el aforo: `addReserva` respeta capacidad y crea lista de espera de verdad. Descuento la sesión del bono al reservar. Cambio la "auth" del portal de localStorage a Supabase Auth. Verifico el dominio de email para que los correos lleguen. Ahora el producto hace lo que la pantalla promete.

**Semana 3 — Lo hago demostrable.** Migraciones versionadas, un entorno de staging separado del de producción, Sentry, y tests automáticos sobre los dos flujos que mueven dinero: reserva y cobro. Backups fuera de la propia base de datos. Sin esto, no puedo prometerle fiabilidad a nadie.

**Semana 4 — Lo hago vendible.** Borro el código muerto, simplifico la navegación a 6–8 módulos y escondo lo que está "Próximamente". Construyo un onboarding que lleve a un dueño de estudio de cero a "primer socio y primer cobro" en menos de 10 minutos. Preparo un one-pager honesto de qué hace y qué no.

**Lo que NO haría en estos 30 días:** ni refactor del god-context, ni Verifactu, ni app nativa, ni integraciones de gimnasios, ni una sola feature nueva. Todo eso es P2 y es la trampa en la que la mayoría cae: seguir añadiendo mientras la casa tiene la puerta abierta.

**La verdad cruda:** no tienes un problema de "me falta producto". Tienes producto de sobra para el estado en que está. Tienes un problema de **confianza**: seguridad, fiabilidad del core y cumplimiento. Arréglalo en 30 días y pasas de "prototipo impresionante que no puedo vender" a "MVP defendible con el que puedo firmar mis primeros 10 estudios". No lo arregles, y da igual cuántos módulos añadas: el primer técnico seria que lo mire —o el primer incidente— te lo tira abajo.

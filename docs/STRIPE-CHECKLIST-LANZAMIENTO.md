# Checklist Stripe/facturación antes de abrir Tentare a dinero real

Fecha: 2026-08-13. Auditoría de solo lectura hecha por el agente
`tentare-stripe` (acceso a `execute_sql` contra `dwqvdycjcffqwfkzapvi` y
lectura de código) — **cero cambios de código o configuración**. Complementa
[`SEO-CHECKLIST-LANZAMIENTO.md`](SEO-CHECKLIST-LANZAMIENTO.md), que cubre
solo SEO/contenido; este cubre solo Stripe/dinero. Legal y seguridad general
quedan fuera de ambos.

---

## 🔴 P0 — CERRADO (2026-08-13)

**Tres puertas de dinero nuevas no pasan por la guardia de modo live/test
(`comprobarModoStripe()`, `lib/billing/modo-stripe.ts`).** La regla del repo
dice literalmente "el guardia va en las **dos** puertas por las que entra
dinero" (`cobrarReciboOffSession` y `/api/stripe/checkout`) — eso ya no es
cierto. Desde la última auditoría han aparecido tres más que solo comprueban
el centinela `sk_test_XXXX` (¿está configurado o no?), no si el modo coincide
con el entorno:

| Ruta | Qué mueve | Riesgo si alguien copia `.env.local` de producción a local (el escenario que ya casi pasó una vez, según el propio código) |
|---|---|---|
| `app/api/terminal/cobrar/route.ts` | Cargo con datáfono/POS | Cobraría con clave live en local sin nada que lo pare. `/pos` está congelado en el panel, pero la API sigue viva y alcanzable con sesión de staff + `puedeMoverDinero` |
| `app/api/stripe/pos-bizum/route.ts` | Cargo Bizum | Mismo hueco |
| `app/api/billing/checkout/route.ts` | Alta de suscripción SaaS del estudio a Tentare | Mismo hueco — y esta SÍ es una vía activa hoy, no congelada |

**Arreglado**: las 3 rutas llaman ahora a `comprobarModoStripe()` en el mismo
punto y con el mismo patrón que `/api/stripe/checkout` (justo después de
comprobar el centinela `sk_test_XXXX`, antes de tocar Stripe). Las 4 puertas
de dinero del sitio (`checkout`, `terminal/cobrar`, `pos-bizum`,
`billing/checkout`) más `cobrarReciboOffSession` quedan con la misma
guardia. Verificado: `eslint` limpio en los 3 ficheros, los 10 tests de
`lib/billing/modo-stripe.test.ts` siguen en verde (la lógica del guardia no
se tocó, solo dónde se llama), `tsc --noEmit` limpio en todo el repo.

*(Nota aparte, menor: `app/api/reembolsos/route.ts` tampoco llama a la
guardia, pero ahí un mismatch de modo simplemente fallaría contra la API de
Stripe en vez de crear algo nuevo por error — riesgo bajo, no urgente.)*

---

## 🟡 Verificar antes de abrir (no bloquea el código, pero sí la confianza)

1. **Confirmar en el dashboard de Stripe** (fuera del alcance de las
   herramientas de este agente) que el webhook de producción apunta al
   dominio real, está en modo LIVE y con la firma correcta. Lo que sí se
   verificó: el mecanismo de procesamiento de eventos funciona (`webhook_events`
   tiene entradas `connect:`/`billing:` con `estado='completado'`, la más
   reciente hace 2 días) — pero no se pudo confirmar en qué modo está
   registrado ese endpoint en Stripe.
2. **Ningún camino de negocio debe confiar en `studios.subscription_status`
   sin comprobar `subscription_id`.** Se encontraron 3 estudios con
   `subscription_status` en `active`/`trialing` mientras `subscription_id`
   es `NULL` — coherente con datos sembrados/demo, pero peligroso si algún
   cálculo de MRR real o de entitlements cuenta esas filas como ingreso de
   verdad al abrir al público. Revisar `suscripcionActiva()` y quien la
   llame.
3. **Probar un ciclo completo con dinero real (o clave test real contra
   Connect test) antes de abrir**: alta de socia → tarjeta guardada → cobro
   off-session → renovación → un reembolso. Hoy solo **1 socia de 204** en
   toda la base tiene tarjeta guardada (`stripe_payment_method_id`), 0 con
   mandato SEPA activo — ese camino nunca se ha ejercitado a fondo con datos
   reales.
4. **Probar Fase 3 (penalizaciones por cancelación tardía/no-show) una vez
   en modo manual** (`penalizacion_cobro_automatico=false`, verificando el
   endpoint de aprobación humana) antes de activar el camino 100% automático
   para cualquier estudio real — construida pero nunca ejercitada con un
   `paymentIntent` real, confirmado en esta auditoría.

## 🟢 Ya está bien — no requiere acción

- **La guardia de modo cruzado (`modo-stripe.ts`) sigue intacta y sin
  bypasses nuevos**: la única escotilla documentada
  (`STRIPE_PERMITIR_MODO_CRUZADO=1`) solo se usa en el test del propio
  fichero, ningún caller en código de producción.
- **El conciliador YA NO tiene el tope de 100 sin paginar** que la memoria
  del proyecto seguía marcando como pendiente — verificado leyendo
  `lib/inngest/conciliar-cobros.ts` directamente: usa el iterador
  autopaginado real del SDK de Stripe, con un techo defensivo de 2000
  sesiones por pasada que solo dispara una alarma (`Sentry.captureMessage`),
  no corta en silencio. **Este hallazgo corrige la memoria del proyecto —
  no hace falta seguir arrastrando esto como pendiente.**
- **Cero escritura optimista encontrada** en `cobrarReciboOffSession`,
  `charge-off-session`, `reembolsos`, ni en el webhook — todos esperan
  confirmación real y delegan el estado final al webhook, tal como exige la
  regla del repo.
- **Idempotencia correcta** en el reembolso (`idempotencyKey` versionado
  tras un fallo real anterior) y en `cobrarReciboOffSession` — sin
  duplicaciones nuevas detectadas por lectura de código (no medido con
  doble-clic real en producción).
- **No se encontró ninguna vía de cobro nueva** fuera de las ya conocidas
  (barrido completo de `paymentIntents.create`, `charges.create`,
  `checkout.sessions.create`, `subscriptions.create` en todo `app/` y `lib/`).

## Estado real de datos en producción (verificado con `execute_sql`, 2026-08-13)

| Métrica | Valor |
|---|---|
| Socias con tarjeta guardada | 1 de 204 |
| Socias con mandato SEPA activo | 0 |
| Recibos `COBRADO` totales | 69 (40 en los últimos 30 días) |
| Recibos `COBRADO` con `payment_intent` de Stripe real | **1** — los otros 68 son datos sembrados/demo, no cobros reales |
| Estudios con Stripe Connect | 2 |
| Estudios con `subscription_status` no nulo | 5 (3 de ellos sin `subscription_id` — ver punto 2 de arriba) |

**Conclusión honesta**: por Stripe sigue sin pasar dinero real de verdad —
el volumen no ha cambiado desde la última auditoría (seguía en "1 de 202",
ahora "1 de 204" — la base de socias creció, el uso real de pago no).

---

## Antes de decir "Stripe está listo para dinero real"

1. ~~Cerrar el P0 (3 rutas sin guardia)~~ — **hecho**.
2. Confirmar modo LIVE del webhook en el dashboard de Stripe directamente
   (no verificable desde este entorno).
3. Ejercitar el ciclo completo de cobro una vez con datos reales antes de
   abrir a estudios de verdad — hoy ese camino está construido pero
   prácticamente sin usar.
4. Ninguno de los puntos 🟡/🟢 bloquea técnicamente — con el P0 cerrado, lo
   que queda es confirmar el webhook y probar el ciclo real al menos una vez.

# Fase 1 — Diseño: Pagos España (SEPA CORE + Bizum) sobre Stripe Connect

> Documento de diseño (pendiente de aprobación). Aterriza el mayor hueco de producto de la auditoría sobre la infraestructura Stripe existente, sin PSP nuevo.

## 1. Estado actual (verificado en código)

- **Recurrente = tarjeta on-file off-session.** `app/api/stripe/checkout/route.ts` usa `payment_method_types: ['card']` + `setup_future_usage: 'off_session'`. El cobro posterior lo hace `lib/stripe-cobros.ts::cobrarReciboOffSession` con `off_session: true` e idempotencia anclada al `reciboId`.
- **Dunning** existe vía `recibos.intentos_reintento` + estados `PENDIENTE/COBRADO/DEVUELTO/EN_CURSO`.
- **"SEPA"** solo aparece como *copy de marketing* (landing/config). No hay mandatos ni adeudos.
- **"Bizum"** es solo un valor del enum `MetodoPago` = etiqueta manual de caja en POS. No hay cobro Bizum.

## 2. Decisión de arquitectura: **quedarse en Stripe** (recomendado)

Stripe Connect ya soporta, sobre las cuentas conectadas de los estudios, los dos métodos que faltan:

| Método | Stripe | Uso | Recurrente |
|--------|--------|-----|-----------|
| **SEPA Direct Debit** (`sepa_debit`) | ✅ nativo, con **gestión de mandato** integrada (Stripe genera y almacena el mandato; referencia única) | Mensualidad domiciliada (el rail nº1 en ES) | **Sí** (off-session con mandato) |
| **Bizum** (`bizum`) | ✅ nativo en España | Clase suelta, bono, primer pago | **No** (solo puntual — por diseño de Bizum) |

**Por qué Stripe y no GoCardless/Redsys:**
- Reutiliza tu Connect (direct charge + application fee), tu idempotencia, tus webhooks. Cero PSP nuevo, cero reconciliación doble.
- El mandato SEPA lo gestiona Stripe (creación, almacenamiento, referencia) → menos superficie legal que construir.
- GoCardless sería otro proveedor a integrar y conciliar; Redsys es bank-integrated (más fricción). Solo tendrían sentido si Stripe SEPA no cubriera un caso — no es el caso.

**Coste a vigilar:** las comisiones de `sepa_debit` y `bizum` en Stripe difieren de tarjeta; conviene reflejarlas en `stripe-fees.ts` y en el mensaje de precio.

## 3. Alcance funcional

### 3.1 SEPA Direct Debit (recurrente)
1. **Alta de mandato** en el portal de socia / alta por recepción: `SetupIntent` con `payment_method_types: ['sepa_debit']`, `mandate_data` y `setup_future_usage: 'off_session'`. Guardar el `payment_method` y el mandato.
2. **Almacenamiento** (schema): tabla/campos de mandato — ver §4.
3. **Cobro recurrente**: extender `cobrarReciboOffSession` para elegir el método guardado del socio (tarjeta **o** SEPA) según su preferencia; `PaymentIntent` off-session con `payment_method` SEPA y el mandato.
4. **Dunning SEPA**: SEPA es asíncrono (el resultado tarda días y puede devolverse hasta 8 semanas). El flujo de reintentos debe manejar estados `processing → succeeded/failed` y **devoluciones tardías** (webhook `charge.refunded`/`payment_intent.payment_failed` + `mandate` revocado). Reutilizar `intentos_reintento` y estados de `recibos`, añadiendo `EN_CURSO` para el limbo SEPA.
5. **Factura Verifactu por ciclo**: al confirmarse el cobro, sellar factura (ya existe `facturas/sellar`).

### 3.2 Bizum (puntual)
1. **POS presencial**: hoy "Bizum" es etiqueta manual. Opción A (mínima): mantener etiqueta manual (el estudio cobra por su app bancaria) — honesto pero no integrado. Opción B (real): generar un `PaymentIntent` `bizum` y mostrar QR/redirect. **Recomendado B** para trazabilidad y conciliación.
2. **Portal/checkout online**: añadir `bizum` a `payment_method_types` en el checkout de bonos/clase suelta/primer pago (junto a `card`).
3. Bizum **no** sirve para la mensualidad (limitación del propio Bizum) → no tocar el recurrente.

## 4. Cambios de esquema (migración nueva, additiva)
- **Mandatos SEPA**: `socios.sepa_mandate_id text`, `socios.sepa_payment_method_id text`, `socios.metodo_pago_preferido text CHECK (in ('TARJETA','SEPA'))` (o tabla `mandatos_sepa` si se quiere histórico). Recomendado: campos en `socios` + histórico ligero si hace falta.
- **Recibos**: estado `EN_CURSO` ya existe; añadir `recibos.metodo_cobro text` para saber si un cobro fue tarjeta/SEPA/bizum y `recibos.sepa_estado` para el limbo asíncrono.
- **Ventas POS**: `metodo_pago` ya admite `BIZUM`; si se integra Bizum real, añadir `ventas_pos.stripe_payment_intent_id` para conciliación.
- Todo additivo, sin backfill destructivo.

## 5. Riesgos y mitigaciones
- **Asincronía SEPA** (el mayor cambio mental): un cobro SEPA no es inmediato. La UI debe mostrar "en curso" y no marcar COBRADO hasta el webhook `succeeded`. Sin esto, se reportan cobros que luego se devuelven.
- **Devoluciones (8 semanas)**: webhook de devolución debe revertir el recibo y (si aplica) revocar el entitlement/bono. Casar con las reglas de dunning.
- **Activación por cuenta**: SEPA/Bizum requieren que la cuenta Connect del estudio (país ES) los tenga habilitados. Añadir a `integrations/estado` la comprobación de capabilities.
- **Comisiones distintas** → actualizar `stripe-fees.ts` y el copy de precio.
- **Mandato = documento legal**: el texto de autorización del mandato debe cumplir SEPA CORE (acreedor, IBAN, referencia, tipo recurrente). Stripe provee el `mandate`, pero el copy de consentimiento debe ser correcto (y casar con RGPD si se guarda IBAN).

## 6. Plan incremental (PRs pequeños y verificables)
1. **PR-1 (schema):** migración additiva de mandatos/estado (§4). Sin lógica.
2. **PR-2 (alta mandato SEPA):** SetupIntent + guardado + UI de alta en portal/recepción.
3. **PR-3 (cobro recurrente SEPA):** extender `cobrarReciboOffSession` para elegir método; manejar `processing`.
4. **PR-4 (dunning + webhooks SEPA):** estados asíncronos + devoluciones + factura por ciclo.
5. **PR-5 (Bizum real):** checkout online + POS con PaymentIntent bizum + conciliación.
6. Cada PR con tests de lógica pura (elección de método, transición de estados, cálculo de comisión) siguiendo el patrón existente (`billing-rules.test.ts`, `stripe-fees.test.ts`).

## 7. La única decisión de fondo que es tuya
Ver la pregunta asociada: (a) **rail recurrente** (Stripe SEPA recomendado vs GoCardless/Redsys), y (b) **superficie de Bizum** (POS, online, o ambos). El resto del diseño se deriva de ahí.

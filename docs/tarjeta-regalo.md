# Tarjeta regalo (MVP, 9-oct-2026)

Saldo en euros que una persona regala a otra para gastar en el estudio, en varias veces.

## Qué hay

- **La propietaria** la activa y configura en *Paquetes → Tarjeta regalo*: importes sugeridos, importe libre con
  mínimo y máximo, caducidad (1–60 meses) y condiciones que verá quien compra. Apagada de serie.
- **Venta online** en `/reservar/[slug]/regalo` (enlace en el pie de la página pública solo si se puede vender de
  verdad). Quien compra no necesita cuenta. Cobro por Stripe Checkout sobre la cuenta conectada del estudio
  (direct charge, tarjeta). Captcha de servidor, trampa de bots y límites por IP.
- **Venta en mostrador** (panel): se registra una tarjeta *cobrada fuera* (efectivo, datáfono, Bizum,
  transferencia) con su método y quién la creó. El código se enseña una vez.
- **Código** `RG-XXXX-XXXX-XXXX-XXXX`: 16 símbolos de un alfabeto de 32 sin 0/O/1/I = 80 bits, de
  `gen_random_bytes`. Se guarda en claro (hay que poder reenviar el correo) pero se busca por su huella SHA-256;
  el navegador no lee ninguna de las dos columnas. Comparación de huellas en tiempo constante.
- **Correo** con la marca del ESTUDIO: a quien recibe (código, saldo, caducidad, mensaje, botón a la app) y justificante
  a quien compra. Reenviar desde el panel.
- **Canje** en la app de la alumna (*Perfil → Tarjeta regalo*): vincula la tarjeta a su ficha. No mueve dinero.
- **Gastar saldo**: en el mostrador (*Gastar* en el panel), parcial y repetible; clave de idempotencia por clic.
- **Anular** con motivo obligatorio: retira el saldo que quede. Reembolso total o disputa perdida en Stripe anulan
  la tarjeta solos (lo ya gastado no vuelve). Un reembolso parcial solo avisa.

## Garantías (en la base de datos, no en la pantalla)

`movimientos_regalo` es solo de inserción (COMPRA suma; USO y ANULACION restan; saldo = suma). Las RPC
(`regalo_crear/vincular/usar/anular`) son solo de `service_role`, con candado de fila. Crear es idempotente por sesión
de pago (un reintento del webhook devuelve la misma tarjeta); gastar, por clave. La caducidad se mira con
`hoy_estudio()` (Madrid). `regalo_conciliacion` debe estar siempre vacía. Contratos: `supabase/tests/rls-regalo.test.ts`
(Postgres real) y `lib/regalo/regalo-contrato.test.ts` (estático).

## Decisiones y límites conocidos

- El código se guarda **en claro** en `tarjetas_regalo.codigo` (hay que poder reenviar el correo); ningún rol del navegador lo
  lee. Es una llave al portador: un volcado de la base de datos lo expondría. Cifrarlo (patrón `enc:v1:`) es Fase 2.
- Recepción puede **gastar y anular** (rol `puedeMoverDinero`, como el resto del dinero del mostrador); todo queda con
  `actor_id` en el libro. Si el fundador prefiere solo la propietaria para anular, es un cambio de una línea.
- Gastar/anular no se bloquea por suscripción SaaS caducada (la clienta ya pagó); vender sí.
- Red de seguridad de la venta online, por orden: webhook → página de vuelta (`/estado`) → conciliador de cobros
  (`rescatarRegalos`, cada pasada, ventana de 12 h). Los tres llaman a `activarRegaloDesdeSesion` (idempotente).
- Si el reembolso/disputa llega antes de crear la tarjeta, se crea y se **anula en el acto** (mira el cargo en Stripe).
  Si no se puede consultar el cargo, también se anula (fail-closed) y el estudio la emite a mano si el cobro era bueno.
- ⚠️ **No hay conciliador de reembolsos para regalos**: si el webhook de un reembolso se pierde, la tarjeta sigue con saldo.
  Fase 2 (hoy solo salta un aviso en Sentry si es parcial).
- Una disputa abierta no bloquea el saldo hasta que se pierde.
- El libro bloquea UPDATE; DELETE queda permitido para el borrado en cascada de un estudio.

## Contabilidad (decisión de producto; la fiscal, de la gestoría)

- **No es ingreso hasta que se gasta.** No crea `recibos`, no entra en Inicio/Cobros/Informes/API
  (`docs/cifras-financieras.md`). El panel enseña el *saldo pendiente de usar* como pasivo.
- Al gastar saldo en el mostrador, el estudio cobra esa compra por su flujo normal; la tarjeta solo registra el
  descuento. **Fase 2**: que el uso genere el recibo/asiento enlazado (hoy es manual).
- Las tarjetas caducadas con saldo **no se reconocen solas como ingreso**. Qué se hace con ese saldo (y cuándo) es
  decisión de la gestoría.

## ⚠️ Pendiente de gestoría y asesoría legal (no se ha inventado ninguna norma)

1. **IVA**: ¿vale multiuso (el IVA se devenga al canjear) o vale de finalidad determinada (al vender)? Un estudio con
   servicios de distinto tipo impositivo puede no encajar en el segundo. Hasta decidirlo **no se emite factura
   automática** de la venta y el correo del comprador lo dice («no es una factura»).
2. **Veri\*Factu**: si procede factura al vender, y con qué contenido.
3. **Caducidad mínima**: si existe un plazo mínimo legal para vales/tarjetas regalo. El valor por defecto (12 meses) es
   prudente, no jurídico, y se puede cambiar; el texto de condiciones es editable por el estudio.
4. **Protección de datos**: el email de quien recibe lo da un tercero. Solo se usa para enviar el regalo; no se reutiliza
   para marketing. El texto informativo definitivo lo valida la asesoría.
5. **Estudio que cierra**: qué pasa con las tarjetas vivas.

**Recomendación**: no activar la venta online en estudios reales hasta cerrar 1 y 3.

## Fuera de este MVP (Fase 2)

Venta en Caja/POS; envío programado en una fecha (hay que decidir cron: cuota de Vercel/Inngest); regalar un bono
concreto (choca con el motor de derechos y el contrato `res-pf-`); pagar una compra online con el saldo (checkout con
cobertura parcial); PDF imprimible (hoy el correo imprime bien); widget incrustable (el catálogo de widgets lo dice);
varias plantillas; transferir saldo.

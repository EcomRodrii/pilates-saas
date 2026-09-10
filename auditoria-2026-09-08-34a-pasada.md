# Auditoría Tentare — 34ª pasada (8-9 sep 2026)

## Área elegida y por qué

Las pasadas 27ª-33ª de este mismo día ya barrieron POS/TPV/Bizum, SEPA/dunning,
liquidaciones de instructoras, gamificación por créditos, checkout de
planes/matrícula/consentimiento legal, y el servidor OAuth 2.0 + Comunidad/Mensajería.

De las áreas candidatas sugeridas (reservas/RPCs de reserva-cancelación,
Decision OS, ficha clínica, importador de otras plataformas, Veri*Factu),
empecé por **reservas/cancelaciones y penalizaciones Fase 3** (dinero real vía
Stripe, RPCs tocadas hasta el 4-sep) por ser la de superficie más reciente y
con más histórico de "grants mal cerrados". Tras una lectura completa de
`reservar_plaza`, `cancelar_reserva_plaza`, `aceptar_oferta_lista_espera`,
`resolver_reserva_pendiente`, `promocionar_siguiente_espera` y
`lib/inngest/penalizaciones.ts`/`app/api/penalizaciones/aprobar/route.ts`,
confirmé que es una zona ya extremadamente escrutada — cada gotcha de
concurrencia, idempotencia y grants que se le podía encontrar ya está
documentado y arreglado (con comentarios explícitos de "esto ya se rompió
antes, así se arregló"), y aparece citada en al menos 8 auditorías previas
(`auditoria-2026-08-29.md` … `auditoria-2026-09-07.md`). No fuerzo hallazgos
ahí.

Cambié a **Veri*Factu / facturación electrónica** (`lib/verifactu/**`,
`app/api/cron/verifactu-transmitir`, migración `20260905030122`), por dos
motivos: es la pieza con código más reciente de las cinco alternativas (el
propio motor de cola de transmisión se escribió el 5-sep, con el cron y las
llamadas SOAP reales tocadas hasta hoy) y las auditorías previas que la
mencionan (`08-31`, `09-01` a `09-04`, `09-06`) se centraron en la cadena de
huella/hash (`verifactu_prev_hash`) y en el sellado síncrono — ninguna auditó
todavía el motor de **transmisión** en sí (la cola, el cron, qué pasa cuando
la AEAT responde que no).

## Metodología

Lectura completa de `lib/verifactu/transmitir.ts`, `pendientes.ts` (lógica
pura, con tests), `envio.ts`, `config.ts`, `xml.ts`, la migración
`20260905030122_verifactu_cola_de_transmision.sql`, el cron
`app/api/cron/verifactu-transmitir/route.ts`, `vercel.json` (calendario real
del cron), y el único punto de UI que muestra el estado
(`components/cobros/panel-facturas.tsx`). Contrastado contra
`docs/VERIFACTU-INVESTIGACION-TECNICA.md` para separar decisión de diseño de
bug. Confirmado con grep exhaustivo que no existe ningún endpoint, cron ni
pantalla de `/interno` que toque `verifactu_estado` fuera de estos ficheros.

**No se ha aplicado ningún fix — solo el informe, como se pidió.**

---

## 🟠 Hallazgo — una factura RECHAZADA por la AEAT bloquea PARA SIEMPRE toda la cola de ese estudio, sin ningún camino de recuperación

**Archivos:** `lib/verifactu/transmitir.ts:116-129` (cálculo de `ultimaSeq` y
`hayHuecoAntesDe`), `lib/verifactu/pendientes.ts:70-79` (`hayHuecoAntesDe`),
migración `20260905030122_verifactu_cola_de_transmision.sql` (el `CHECK` de
`verifactu_estado`), `components/cobros/panel-facturas.tsx:196` (el único
lugar que informa del estado).

**Qué pasa:** el cron determina cuál es la última factura ya aceptada por la
AEAT así:

```ts
// transmitir.ts:116-124
const { data: ultima } = await admin
  .from('facturas')
  .select('verifactu_seq')
  .eq('studio_id', studioId)
  .in('verifactu_estado', ['REGISTRADA', 'ACEPTADA_CON_ERRORES']) // NO incluye RECHAZADA
  .order('verifactu_seq', { ascending: false })
  .limit(1)
  .maybeSingle();
```

y antes de enviar el siguiente lote comprueba que no haya un hueco:

```ts
// pendientes.ts:70-79
export function hayHuecoAntesDe(lote, ultimaSeqRegistrada) {
  if (lote.length === 0) return false;
  const primera = lote[0].verifactuSeq;
  if (primera === 1) return false;
  return primera !== (ultimaSeqRegistrada ?? 0) + 1;
}
```

Cuando la AEAT devuelve `Incorrecto` para una factura (NIF del receptor mal
formado, un campo fuera de formato, cualquier motivo de rechazo real — no un
caso exótico), esa factura pasa a `RECHAZADA` (`casarRespuestas` +
`estadoDesdeRespuesta`, `pendientes.ts:89-96`) y **sale de la cola para
siempre**: el `CHECK` de la migración solo admite
`PENDIENTE/REGISTRADA/ACEPTADA_CON_ERRORES/RECHAZADA`, y no existe en todo el
repo (verificado por grep en `app/`, `lib/`, `supabase/migrations/`) ningún
`UPDATE` que saque una fila de `RECHAZADA` de vuelta a `PENDIENTE`, ni un
endpoint, ni una pantalla de `/interno`, ni un botón en
`panel-facturas.tsx` — solo una etiqueta de texto: `RECHAZADA: { txt: 'AEAT:
RECHAZADA — revísala', ... }` que no enlaza a ninguna acción real.

Como `ultimaSeqRegistrada` solo mira `REGISTRADA`/`ACEPTADA_CON_ERRORES`, una
vez la factura `n` queda `RECHAZADA`, `ultimaSeq` se congela en `n-1` para
siempre. La siguiente factura pendiente (`n+1`, que nunca deja de estar
`PENDIENTE` porque nadie la ha enviado todavía) siempre calcula
`primera (n+1) !== ultimaSeq (n-1) + 1 (=n)` → `hueco = true` → se salta
(`resumen.saltados.push(...)`) **en cada pasada del cron, indefinidamente**.
Ninguna factura posterior de ese estudio se transmite nunca más, sin que
nadie lo decida ni lo note: no hay `Sentry.captureMessage` para el caso
"hueco" (solo lo hay para el rechazo original, una vez), no hay evento en
`lib/notifications/catalog.ts` para avisar a la propietaria de un rechazo de
Hacienda (grep confirma cero entradas `verifactu`/`aeat` en el catálogo de
notificaciones), y el único indicio visible es un texto secundario en una
fila de una tabla que hay que ir a buscar factura por factura.

**Cómo se dispara en la práctica, no es un edge case teórico:** el NIF del
receptor que se transmite es `socio.nif`, un campo de texto libre que
introduce el mostrador sin validación de formato antes de sellar
(`lib/billing/sellar-factura-server.ts:173-176`, `receptorNIFCalc =
socio.nif`, contrastado contra `nifEmisorValido()` que SÍ se aplica al NIF
**emisor** del estudio pero no existe función equivalente para el receptor).
Un NIF de socia con una letra de control incorrecta, un espacio, o un
extranjero sin marcar como tal es más que plausible en una base de 200+
socias migradas de otra plataforma (ver `migracion-desde-otras-plataformas.md`
en memoria) — y basta UNA para detener el cumplimiento fiscal del estudio
entero a partir de ese punto, en silencio.

**Impacto real, sin sobrestimar:** hoy esto no ha ocurrido en producción
porque `transmisionConfigurada()` es `false` (sin `VERIFACTU_CERT_PFX_BASE64`
configurado, confirmado en `docs/VERIFACTU-INVESTIGACION-TECNICA.md` y en el
propio código — "nunca se ha ejecutado contra la AEAT") y Veri*Factu no es
obligatorio hasta enero/julio de 2027. No es una pérdida de dinero ni una
fuga de datos entre estudios. Pero es exactamente el tipo de "callejón sin
salida" que este repo evita sistemáticamente en otras áreas (recuperación
garantizada al perder una oferta de lista de espera, aviso explícito cuando
el portal no puede proponer una clase, etc.) y aquí no lo hizo: en cuanto se
active la transmisión real, el primer rechazo real de la AEAT deja al
estudio fuera de cumplimiento de forma permanente y no descubierta hasta una
inspección, con el único remedio siendo cirugía manual en la base de datos
(`UPDATE facturas SET verifactu_estado = 'PENDIENTE' WHERE ...` a mano, sin
ningún runbook documentado para decidir qué hacer con la fila `RECHAZADA`
original — reenviarla corregida requeriría además una huella nueva, que
`envio.ts` prohíbe explícitamente recalcular).

**Arreglo propuesto:**
1. Un endpoint (o acción en `/interno` o en el propio panel de facturas, solo
   PROPIETARIO) que permita marcar una `RECHAZADA` como resuelta manualmente
   tras corregir el dato — como mínimo, decidir explícitamente si la factura
   corregida entra en la cadena como una factura RECTIFICATIVA nueva (con su
   propia huella) en vez de reintentar la misma, que es lo que ya impone
   `envio.ts` ("nunca se recalcula la huella para reenviar").
2. Notificar de verdad: un evento en el catálogo de notificaciones (o como
   mínimo un aviso en el dashboard, mismo patrón que
   `PenalizacionesPendientes`) cuando una factura queda `RECHAZADA` — no solo
   un `Sentry.captureMessage` que ve el equipo de Tentare, no la propietaria
   del estudio que es la obligada tributaria real.
3. Validar el NIF del receptor (`socio.nif`) con la misma función o una
   equivalente a `nifEmisorValido()` en el momento de sellar, para reducir la
   probabilidad de que esto ocurra por un dato mal introducido en vez de
   descubrirse solo al transmitir.

---

## Zonas revisadas sin hallazgos nuevos (para no repetir en la 35ª pasada)

- **`reservar_plaza`/`cancelar_reserva_plaza`/penalizaciones Fase 3**: ya
  cubierto en profundidad por 8+ auditorías previas del mismo día y de días
  anteriores. Repasado de nuevo (anti-solape del 4-sep, grants del 2-sep,
  idempotencia de `procesarUna` en `lib/inngest/penalizaciones.ts`,
  `cobrarReciboOffSession`) sin encontrar nada sin cerrar.
- **Concurrencia del cron `verifactu-transmitir` sin lock**: investigado
  como posible hallazgo (nada impide dos invocaciones solapadas del mismo
  lote) y **descartado como bug real** — el propio diseño, documentado en
  `envio.ts` y `docs/VERIFACTU-INVESTIGACION-TECNICA.md:171-172`, asume y
  acepta el reenvío del mismo registro con la misma huella ante un timeout;
  es precisamente lo que exige la especificación SIF de Veri*Factu (un
  emisor debe poder reintentar sin romper la cadena). No es un hallazgo.
- **Certificado/entorno (`config.ts`)**: mismo patrón ya usado para Stripe
  (producción opt-in explícito vía `VERIFACTU_ENTORNO=produccion`), sin
  hallazgos.
- **`lib/verifactu/xml.ts`/`respuesta.ts`**: cubiertos por tests unitarios
  propios (`xml.test.ts`, `respuesta.test.ts`), no se encontró divergencia
  entre lo que prueban y lo que usa `transmitir.ts`.

## Conclusión

Un único hallazgo real, pero sustancial: 🟠 la cola de transmisión de
Veri*Factu no tiene ningún camino de recuperación para una factura rechazada
por la AEAT, lo que congela silenciosamente el cumplimiento fiscal del
estudio entero a partir de ese punto — un "callejón sin salida" del tipo que
este mismo repo se cuida explícitamente de evitar en otras áreas (reservas,
sustituciones, portal), pero que aquí nadie construyó todavía porque la
transmisión real nunca se ha probado contra la AEAT. No se fuerzan hallazgos
adicionales para completar cuota: el resto del motor (cálculo de huella,
orden de envío, idempotencia ante timeout, separación producción/pruebas)
está bien construido y ya lo confirman los tests existentes.

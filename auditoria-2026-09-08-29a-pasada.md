# Auditoría Tentare — 29ª pasada (2026-09-08)

## Alcance y método

Continuación de la 27ª/28ª pasada (P-3 del desglose de método de cobro del
TPV, PRs #1762 → #1764 → #1768). El objetivo de esta pasada era comprobar si
el arreglo de `39e1e18c` (#1768) — que corrigió el "método de cobro miente"
para el sondeo síncrono de recibos y para las ventas de producto del TPV —
había dejado algún camino gemelo sin tocar, y barrer el resto de áreas de
dinero/seguridad no auditadas en las últimas pasadas.

Nota de entorno: esta sesión corrió en un worktree aislado
(`.claude/worktrees/agent-a3b1051ff5a468a34`) que no tiene los ficheros
`auditoria-2026-09-08.md` (27ª) ni `auditoria-2026-09-08-28a-pasada.md`
(28ª) — existen como no-commiteados en el checkout compartido, fuera del
alcance de este worktree. Se ha reconstruido el contexto necesario leyendo
directamente el commit `39e1e18c` (su mensaje documenta la 27ª y 28ª pasada
con detalle suficiente) y `.claude/tentare-os.md`, que ya recoge el resumen
narrativo de todas las fases relevantes.

## Verificación en profundidad de #1768 (POS/Bizum) — CERRADO, sin huecos nuevos

Se releyó commit a commit el cambio completo (`lib/pos/metodo-real-bizum.ts`,
`lib/pos/terminal.ts`, `app/api/pos/recibo/confirmar/route.ts`,
`app/api/pos/venta/confirmar/route.ts`, `app/api/stripe/webhook/route.ts`,
la migración `20260908181146_pos_venta_metodo_real.sql`) y se trazó el flujo
de datos completo para los tres caminos (webhook, sondeo síncrono de recibo,
sondeo síncrono de venta) contra los dos consumidores del método corregido:

1. **`movimientos_caja`** (arqueo): tanto `apuntar_cobro_en_caja` (recibos)
   como el `INSERT` dentro de `confirmar_pago_venta_pos` (ventas) leen
   `metodo_cobro`/`metodo_pago` de la fila YA actualizada por el mismo flujo,
   nunca de un snapshot anterior a la corrección. Correcto en los tres
   caminos.
2. **`entregarVentaPOS`** (factura/recibo derivado de una venta): se
   confirmó que hace su propio `SELECT` fresco de `ventas_pos` (línea 63-66
   de `lib/pos/venta-servidor.ts`) que se ejecuta SIEMPRE después de que la
   RPC `confirmar_pago_venta_pos` haya comprometido el `UPDATE` con el
   método real — así que el `recibos.metodo_cobro` que factura una venta de
   Bizum-que-acabó-siendo-tarjeta también queda correcto, no solo el apunte
   de caja. Esto no estaba explícito en el mensaje del commit y merecía
   verificación aparte: confirmado en vivo por lectura de código, sin
   hallazgo.
3. **Grants de la nueva firma de `confirmar_pago_venta_pos`** (5 argumentos):
   la migración hace `DROP FUNCTION` de la firma vieja (correcto, evita el
   overload ambiguo que PostgREST no podría resolver) y aplica
   `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO
   service_role` explícito — sigue el patrón ya documentado del gotcha de
   grants. No se pudo ejecutar `has_function_privilege` en vivo (sin sesión
   autenticada contra Supabase en este entorno), pero el SQL en el fichero es
   correcto por inspección.
4. **Tercer caller no mencionado en el commit**: `app/api/pos/venta/route.ts`
   línea 221 también llama a `confirmar_pago_venta_pos`, para el caso de
   ticket a 0 € (todo descontado). Llama con la firma parcial (sin
   `p_metodo_pago`), lo cual es válido porque el nuevo parámetro tiene
   `DEFAULT NULL` — no rompe, y un ticket a 0 € no tiene ambigüedad de método
   que resolver. Verificado, sin hallazgo.

**Conclusión sobre el área**: el arreglo de la 28ª pasada está completo y no
deja ningún gemelo divergente detectable — cubre los tres caminos de cierre
(webhook, recibo síncrono, venta síncrona) y sus dos consumidores posteriores
(caja y factura/recibo).

## Otras áreas revisadas sin hallazgo

- **`lib/creditos-caducidad.ts` + migración `20260908020000_creditos_caducidad.sql`**
  (créditos de gamificación que caducan, #1748): el pre-chequeo en
  `canjearRecompensaPublica` (TS) lee el saldo crudo sin aplicar
  `saldo_vivo`, lo que en un primer vistazo parecía un posible bypass de
  caducidad — pero la RPC `ajustar_creditos` (última puerta) SÍ aplica
  `saldo_vivo(mc.saldo, mc.caduca_el)` antes de descontar y lanza
  `SALDO_INSUFICIENTE` si el saldo vivo no alcanza. Documentado
  explícitamente en el propio SQL ("la RPC es la última puerta y no puede
  fiarse de que quien llame haya mirado"). Sin hallazgo — el diseño ya
  contempla el caso.
- **`app/api/penalizaciones/aprobar/route.ts`** (Fase 3, cobro por
  penalización): el `SELECT` de comprobación de estado y el `UPDATE` final
  no son un compare-and-set atómico (no hay `.eq('estado', 'PENDIENTE_APROBACION')`
  en el UPDATE ni lock de fila), lo que en teoría permite que dos clics
  simultáneos lleguen ambos a `cobrarReciboOffSession`. Pero esa función
  ancla su Idempotency-Key de Stripe a `reciboId + intentos_reintento`
  (`lib/billing/stripe-cobros.ts`), y ninguna de las dos llamadas concurrentes
  cambia `intentos_reintento` antes de la otra — Stripe deduplica el cargo
  por la misma clave. Sin hallazgo; el diseño ya lo contempla y está
  documentado en el propio fichero.
- **`lib/billing/confirmar-cobro.ts` / `lib/inngest/conciliar-cobros.ts`**
  (gemelos webhook/conciliador para checkout online): se comprobó que
  `terminosHash`/`terminosAceptadosEn` (aceptación legal por compra, #1756)
  se propagan correctamente también desde el conciliador (línea 553-554 de
  `conciliar-cobros.ts`), no solo desde el webhook — no hay divergencia ahí.
- **`app/api/public/canje/route.ts`, `app/api/public/factura/route.ts`**:
  identidad derivada siempre del JWT verificado, nunca del body; filtrado
  por `studio_id` + `socio_id` en la consulta de origen. Sin hallazgo.

## Resultado

No se han encontrado hallazgos nuevos genuinos de severidad crítica o
importante en esta pasada. El área de mayor riesgo reciente (POS/Bizum,
#1744/#1762/#1764/#1768) fue objeto de tres pasadas consecutivas de
auditoría y esta 29ª confirma que el arreglo de la 28ª (#1768) cierra el
patrón "un camino corregido, el gemelo no" para los tres caminos de cierre y
sus dos consumidores derivados (caja y factura), sin fisuras adicionales
detectables por inspección estática.

No se fuerzan hallazgos débiles para rellenar la pasada: las áreas
adyacentes revisadas (créditos con caducidad, aprobación de penalización,
conciliador de checkout online, canje/factura del portal) ya incorporan las
defensas correctas y están documentadas como decisiones deliberadas, no como
huecos.

### Recomendación para la 30ª pasada

Dado que las últimas tres pasadas se han concentrado en POS/Bizum y esta
confirma su cierre, la siguiente pasada debería mirar un área totalmente no
tocada recientemente: SEPA (mandatos, dunning, `caducidad-tarjeta.ts` con
datos reales aún casi inexistentes en producción, según nota de
`tentare-os.md`: "1 socia de 202 con tarjeta guardada, 0 con SEPA"), o el
módulo de liquidaciones/nómina de instructoras (`app/(dashboard)/equipo/liquidaciones`),
que no aparece en el historial reciente de auditorías de este fichero.

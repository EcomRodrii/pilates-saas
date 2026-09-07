// Lógica pura: qué recibos COBRADO no tienen ninguna factura sellada.
//
// Auditoría 26ª pasada, P-3. `reintentarFacturasPendientesDeSellar`
// (lib/billing/confirmar-cobro.ts) solo reintenta sellar dentro de una
// ventana de 72h, A PROPÓSITO: sellar HOY una factura de hace semanas tiene
// implicación de trimestre fiscal, y esa decisión es de una persona, no de un
// cron (ver la cabecera de esa función — no se toca esa ventana aquí). Los
// cobros anteriores a que `entregarPlanComprado` empezara a sellar factura al
// entregar se quedaron fuera de esa ventana PARA SIEMPRE, sin ninguna señal
// de que existieran: 32 de 60 recibos COBRADO sin factura, medido en
// producción el 7-sep-2026 (11 `rec-web-*`, 6 `rec-renov-*`, el resto de
// mostrador/siembra).
//
// Sin BD ni Sentry, para poder testearlo con `node --test` — mismo motivo que
// lib/verifactu-cadena.ts. La query y el aviso viven en
// lib/inngest/conciliar-cobros.ts.
export interface ReciboCobrado { id: string; studioId: string; fechaCobro: string | null }

export function recibosCobradosSinFactura(
  recibos: ReciboCobrado[],
  idsConFactura: ReadonlySet<string>,
): ReciboCobrado[] {
  return recibos.filter(r => !idsConFactura.has(r.id));
}

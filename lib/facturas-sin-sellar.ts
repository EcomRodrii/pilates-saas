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
import { emiteFacturaAutomatica } from './factura-automatica.ts';
export interface ReciboCobrado {
  id: string; studioId: string; fechaCobro: string | null;
  /** Cómo se cobró. `null` = no consta (cobros antiguos y de pasarela). */
  metodoCobro?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 60ª auditoría (14-sep-2026), C-3. Aquí había UNA función contestando DOS
// preguntas distintas, y por eso la vigilancia era ciega justo donde más falta
// hacía:
//
//   1. «¿Está cobrado y sin factura?» → la pregunta de VIGILANCIA y la que
//      importa para la obligación de facturar, que en España no depende del
//      medio de pago.
//   2. «¿Le falta la factura que debería haberse emitido sola?» → la pregunta
//      de AVERÍA: si falta, hay un fallo de software que arreglar.
//
// El filtro por `emiteFacturaAutomatica` contestaba la 2 y se usaba para la 1,
// así que el cron de Sentry NO PODÍA avisar nunca de un cobro en efectivo sin
// factura. Medido en producción el 13-sep y otra vez el 14-sep, sin moverse:
// 33 recibos COBRADO sin factura (1.610,05 €), 3 de ellos en efectivo e
// invisibles para la alarma.
//
// La justificación que sostenía el filtro además ya no es cierta: decía
// proteger «el botón rojo «Sin factura» del panel de cobros», y ese botón
// nunca llamó a esta función (lee `facturas` del estado del cliente) y desde
// #1940 explícitamente no se oculta por método de pago.
//
// El ruido se evita separando las dos cifras en el aviso, no escondiendo una.
// ─────────────────────────────────────────────────────────────────────────────

/** Pregunta 1 — VIGILANCIA: cobrado y sin ninguna factura, se cobrara como se cobrara. */
export function recibosCobradosSinFactura(
  recibos: ReciboCobrado[],
  idsConFactura: ReadonlySet<string>,
): ReciboCobrado[] {
  return recibos.filter(r => !idsConFactura.has(r.id));
}

/**
 * Pregunta 2 — AVERÍA: de los anteriores, los que SÍ tenían que haberse
 * facturado solos. Es la cifra accionable por ingeniería; el resto (hoy, el
 * efectivo) es una decisión de negocio que se resuelve con el asesor fiscal.
 */
export function recibosConFacturaAutomaticaAusente(
  recibos: ReciboCobrado[],
  idsConFactura: ReadonlySet<string>,
): ReciboCobrado[] {
  return recibosCobradosSinFactura(recibos, idsConFactura).filter(r => emiteFacturaAutomatica(r.metodoCobro));
}

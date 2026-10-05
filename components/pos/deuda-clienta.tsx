'use client';

import { useMemo, useState, useEffect } from 'react';
import { Banknote, CreditCard, Smartphone, Loader2, AlertCircle } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { formatEuro, uuidV4 } from '@/lib/utils';
import { cobrarReciboEnMostrador, confirmarCobroRecibo, esError } from '@/lib/pos/cliente';
import { esEstadoFinal, type EstadoPagoPOS } from '@/lib/pos/tipos';
import { bizumPermitidoPara, tipoDeReciboParaBizum } from '@/lib/billing/bizum-permitido';
import { MENSAJE_YA_ESTABA } from '@/lib/cobros/marcar-cobrado';
import { situacionRecibo } from '@/lib/billing/situacion-recibo';
import { estadoBotonDatafono, mensajeSinConexion } from '@/lib/pos/datafono';
import { ConectarDatafono } from './conectar-datafono';
import { useDatafono } from './use-datafono';

// ─────────────────────────────────────────────────────────────────────────────
// «Vengo a pagar la cuota.»
//
// Es de las cosas más normales que pasan en un mostrador, y el TPV no sabía
// hacerla: había que salir a /cobros, buscar a la socia y marcarlo allí. Peor,
// ese camino NO apuntaba nada en la caja, así que el efectivo entraba en el
// cajón sin constar y el arqueo del día salía sobrado sin explicación.
//
// ─── Dos caminos, y la diferencia NO es cosmética ────────────────────────────
//
// **Efectivo** lo confirma quien cobra: hay alguien contándolo y el recuento
// del cierre lo verifica. Reutiliza `marcarCobrado` del contexto —la MISMA que
// usa /cobros, que va a `/api/cobros/marcar-cobrado`: compare-and-set, sellado
// fiscal, renovación de bono y apunte de caja en el servidor— en vez de
// duplicarla. El recibo solo desaparece de aquí cuando el servidor lo confirma.
//
// **Datáfono y Bizum** los confirma STRIPE. El mostrador arranca el cobro y
// luego PREGUNTA; hasta que el proveedor dice que sí, aquí no se marca nada.
// Un botón que diera el cobro por bueno porque alguien lo pulsó es exactamente
// lo que este rediseño existe para eliminar.
// ─────────────────────────────────────────────────────────────────────────────

// Lo que se debe: sin cobrar o impagado (rechazado, o devuelto POR EL BANCO).
// Es el mismo criterio con el que el servidor deja cobrarlo (`esReciboCobrable`
// en /api/pos/recibo) y con el que Cobros lo cuenta (lib/billing/situacion-recibo.ts):
// antes la lista se dejaba fuera el devuelto por el banco, que bloquea las
// reservas por impago y sí se podía cobrar.
const esDeuda = (r: Parameters<typeof situacionRecibo>[0]) => {
  const s = situacionRecibo(r);
  return s === 'POR_COBRAR' || s === 'IMPAGADO';
};
const MS_ENTRE_CONSULTAS = 2000;
// ⚠️ Tope de sondeo. Sin él, un pago que nunca se resuelve deja el mostrador
// preguntando para siempre. Al agotarse NO se marca nada como fallido: el
// recibo sigue pendiente —que es la verdad— y si el pago acaba llegando lo
// cierra el webhook. Tres minutos es de sobra para pasar una tarjeta.
const MAX_CONSULTAS = 90;

type Fase =
  | { f: 'quieto' }
  | { f: 'efectivo'; reciboId: string }
  | { f: 'esperando'; reciboId: string; metodo: 'DATAFONO' | 'BIZUM'; estado: EstadoPagoPOS; url: string | null; intentos: number }
  | { f: 'hecho'; reciboId: string };

export function DeudaClienta({ socioId, onCobrado }: { socioId: string; onCobrado: () => void }) {
  const { recibos, marcarCobrado, suscripciones, planesTarifa } = useStudio();
  const [fase, setFase] = useState<Fase>({ f: 'quieto' });
  const [error, setError] = useState<string | null>(null);
  const pendientes = useMemo(
    () => recibos
      .filter((r) => r.socioId === socioId && esDeuda(r))
      .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento)),
    [recibos, socioId],
  );

  // El datáfono, con su estado real. Sin respuesta del servidor se intenta como
  // siempre (el servidor dice si no hay lector); sin lector, el botón lo conecta.
  const datafono = useDatafono(pendientes.length > 0);
  const [conectandoDatafono, setConectandoDatafono] = useState(false);
  const lectorDatafono = datafono.estado ? datafono.estado.lector : undefined;
  const estadoDatafono = estadoBotonDatafono({
    stripeConectado: datafono.estado?.stripeConectado ?? true,
    sumupDisponible: datafono.estado?.sumup.disponible ?? false,
    proveedor: datafono.estado?.proveedor ?? null,
    emparejado: datafono.estado?.emparejado ?? true,
    lector: lectorDatafono,
  });
  const etiquetaDatafono = lectorDatafono?.etiqueta ?? null;

  function pulsarDatafono(reciboId: string) {
    if (estadoDatafono === 'sin-conectar') { setConectandoDatafono(true); return; }
    if (estadoDatafono === 'sin-conexion') { setError(mensajeSinConexion(etiquetaDatafono)); datafono.recargar(); return; }
    void cobrarConProveedor(reciboId, 'DATAFONO');
  }

  // ¿Se le puede ofrecer Bizum a ESTE recibo? Mismo veredicto que da el
  // servidor en `/api/pos/recibo` (`lib/billing/tipo-plan-de-recibo.ts`), y por
  // los mismos dos saltos: `entrega_tipo` se escribe DESPUÉS de cobrar, así que
  // un pendiente casi siempre llega sin él y hay que mirar el plan de su
  // suscripción. Sin esto, el mostrador pintaba «Bizum» en la cuota de una
  // socia y el servidor lo rechazaba con un 400 — que es justo el «botón que el
  // servidor no va a atender» que el módulo de Bizum existe para evitar.
  const bizumPermitidoDe = (r: { entregaTipo?: string | null; suscripcionId: string | null }) => {
    const veredicto = tipoDeReciboParaBizum(r.entregaTipo ?? null, r.suscripcionId);
    if (veredicto !== 'CONSULTAR_PLAN') return bizumPermitidoPara(veredicto);
    const sus = suscripciones.find((s) => s.id === r.suscripcionId);
    const plan = planesTarifa.find((p) => p.id === sus?.planId);
    // `plan?.tipo` indefinido = no se sabe → sin Bizum, igual que en servidor.
    return bizumPermitidoPara(plan?.tipo);
  };

  // Sondeo mientras la clienta pasa la tarjeta. El estado lo decide SIEMPRE el
  // servidor releyendo el PaymentIntent; esto solo pregunta.
  useEffect(() => {
    if (fase.f !== 'esperando') return;
    const { reciboId, metodo } = fase;
    if (fase.intentos >= MAX_CONSULTAS) return;
    let vivo = true;
    const t = setTimeout(() => {
      confirmarCobroRecibo(reciboId, metodo).then((r) => {
        if (!vivo) return;
        if (esError(r)) { setError(r.error); setFase({ f: 'quieto' }); return; }
        if (r.cobrado) { setFase({ f: 'hecho', reciboId }); onCobrado(); return; }
        if (esEstadoFinal(r.pagoEstado)) {
          setError(r.motivo ?? 'El cobro no ha salido. Puedes volver a intentarlo.');
          setFase({ f: 'quieto' });
          return;
        }
        setFase((prev) => (prev.f === 'esperando' ? { ...prev, estado: r.pagoEstado, intentos: prev.intentos + 1 } : prev));
      });
    }, MS_ENTRE_CONSULTAS);
    return () => { vivo = false; clearTimeout(t); };
  }, [fase, onCobrado]);

  const total = pendientes.reduce((s, r) => s + r.importe, 0);
  if (pendientes.length === 0) return null;

  async function cobrarEnEfectivo(reciboId: string) {
    setFase({ f: 'efectivo', reciboId });
    setError(null);
    const r = await marcarCobrado(reciboId, 'EFECTIVO');
    setFase({ f: 'quieto' });
    if (!r.ok) {
      // `cobroRegistrado` distingue «no se cobró» de «se cobró pero falló el
      // sellado». Decir «no se ha podido cobrar» en el segundo caso haría que
      // alguien lo intentara otra vez y cobrase dos veces.
      const selladoAparte = 'cobroRegistrado' in r && r.cobroRegistrado;
      setError(selladoAparte ? 'Cobrado. La factura se emitirá en unos minutos.' : r.error);
      if (!selladoAparte) return;
    } else if (r.yaEstaba) {
      // Lo cobró otra pestaña o el webhook entre medias: no es un fallo, y no hay
      // que volver a cobrarlo.
      setError(MENSAJE_YA_ESTABA);
    }
    onCobrado();
  }

  async function cobrarConProveedor(reciboId: string, metodo: 'DATAFONO' | 'BIZUM') {
    setError(null);
    setFase({ f: 'esperando', reciboId, metodo, estado: 'PENDIENTE', url: null, intentos: 0 });
    // Un intento nuevo por toque: si no, tras cancelar o un rechazo el proveedor
    // devolvía el cobro muerto y el datáfono no pedía la tarjeta.
    const r = await cobrarReciboEnMostrador(reciboId, metodo, uuidV4());
    if (esError(r)) { setError(r.error); setFase({ f: 'quieto' }); return; }
    setFase({ f: 'esperando', reciboId, metodo, estado: r.pagoEstado, url: r.url, intentos: 0 });
  }

  async function cancelar() {
    if (fase.f !== 'esperando') return;
    const { reciboId, metodo } = fase;
    // Sin tope aquí: agotado el sondeo es justo CUANDO más falta hace poder
    // salir de la pantalla de espera.
    setFase({ f: 'quieto' });
    await confirmarCobroRecibo(reciboId, metodo, 'cancelar');
  }

  if (fase.f === 'esperando') {
    return (
      <div className="rounded-xl border border-brand/40 bg-brand/5 p-4 space-y-2 text-center">
        <Loader2 size={20} className="animate-spin text-brand mx-auto" />
        <p className="text-[13.5px] font-semibold text-foreground">
          {fase.metodo === 'DATAFONO' ? `Acerca la tarjeta al datáfono${etiquetaDatafono ? ` ${etiquetaDatafono}` : ''}…` : 'Esperando el Bizum…'}
        </p>
        <p className="text-[12px] text-muted-foreground">
          {fase.intentos >= MAX_CONSULTAS
            ? 'Llevamos un rato sin respuesta. El recibo sigue pendiente; si el pago llega, se cerrará solo.'
            : 'No lo damos por cobrado hasta que lo confirme el banco.'}
        </p>
        {fase.url && (
          <a href={fase.url} target="_blank" rel="noopener noreferrer"
            className="inline-block text-[12.5px] font-semibold text-brand underline">
            Abrir el pago
          </a>
        )}
        <button onClick={cancelar} className="block w-full h-10 rounded-lg text-[13px] font-medium text-muted-foreground">
          Cancelar el cobro
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertCircle size={15} className="text-warning shrink-0" />
        <p className="text-[13px] font-semibold text-warning">
          Debe {formatEuro(total)}
          {pendientes.length > 1 && ` en ${pendientes.length} recibos`}
        </p>
      </div>
      {error && <p role="alert" className="text-[12px] text-muted-foreground">{error}</p>}
      {conectandoDatafono && (
        <ConectarDatafono
          direccionEstudio={datafono.estado?.direccion ?? null}
          esTest={datafono.estado?.test ?? false}
          textoVolver="Volver"
          textoFinal="Volver a cobrar"
          stripeConectado={datafono.estado?.stripeConectado ?? true}
          sumup={datafono.estado?.sumup}
          onConectado={(l, proveedor) => { datafono.ponerLector(l, proveedor); setError(null); }}
          onCerrar={() => setConectandoDatafono(false)}
        />
      )}
      {pendientes.map((r) => {
        const ocupado = fase.f === 'efectivo' && fase.reciboId === r.id;
        return (
          <div key={r.id} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-[12.5px] text-foreground truncate">{r.concepto}</span>
              <span className="text-[13px] font-bold tabular-nums text-foreground shrink-0">{formatEuro(r.importe)}</span>
            </div>
            <div className="flex gap-1.5">
              <BotonCobro icono={Banknote} etiqueta="Efectivo" cargando={ocupado}
                onClick={() => cobrarEnEfectivo(r.id)} />
              {estadoDatafono !== 'sin-stripe' && (
                <BotonCobro icono={CreditCard} etiqueta={estadoDatafono === 'sin-conectar' ? 'Conectar datáfono' : 'Datáfono'} cargando={false}
                  apagado={estadoDatafono === 'sin-conexion'}
                  onClick={() => pulsarDatafono(r.id)} />
              )}
              {bizumPermitidoDe(r) && (
                <BotonCobro icono={Smartphone} etiqueta="Bizum" cargando={false}
                  onClick={() => cobrarConProveedor(r.id, 'BIZUM')} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BotonCobro({ icono: Icono, etiqueta, cargando, onClick, apagado }: {
  icono: typeof Banknote; etiqueta: string; cargando: boolean; onClick: () => void;
  /** Se ve apagado pero se puede pulsar (el datáfono sin conexión dice qué hacer). */
  apagado?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={cargando}
      className={`flex-1 h-10 rounded-lg bg-card border border-border text-[12.5px] font-semibold text-foreground inline-flex items-center justify-center gap-1.5 disabled:opacity-50${apagado ? ' opacity-60' : ''}`}
    >
      {cargando ? <Loader2 size={13} className="animate-spin" /> : <Icono size={13} />}
      {etiqueta}
    </button>
  );
}

'use client';

import { useMemo, useState, useEffect } from 'react';
import { Banknote, CreditCard, Smartphone, Loader2, AlertCircle } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { formatEuro } from '@/lib/utils';
import { cobrarReciboEnMostrador, confirmarCobroRecibo, esError } from '@/lib/pos/cliente';
import { esEstadoFinal, type EstadoPagoPOS } from '@/lib/pos/tipos';

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
// usa /cobros, con su compare-and-set, su sellado fiscal y su renovación de
// bono— en vez de duplicarla.
//
// **Datáfono y Bizum** los confirma STRIPE. El mostrador arranca el cobro y
// luego PREGUNTA; hasta que el proveedor dice que sí, aquí no se marca nada.
// Un botón que diera el cobro por bueno porque alguien lo pulsó es exactamente
// lo que este rediseño existe para eliminar.
// ─────────────────────────────────────────────────────────────────────────────

const COBRABLES = ['PENDIENTE', 'FALLIDO'] as const;
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
  const { recibos, marcarCobrado } = useStudio();
  const [fase, setFase] = useState<Fase>({ f: 'quieto' });
  const [error, setError] = useState<string | null>(null);

  const pendientes = useMemo(
    () => recibos
      .filter((r) => r.socioId === socioId && (COBRABLES as readonly string[]).includes(r.estado))
      .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento)),
    [recibos, socioId],
  );

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
    }
    onCobrado();
  }

  async function cobrarConProveedor(reciboId: string, metodo: 'DATAFONO' | 'BIZUM') {
    setError(null);
    setFase({ f: 'esperando', reciboId, metodo, estado: 'PENDIENTE', url: null, intentos: 0 });
    const r = await cobrarReciboEnMostrador(reciboId, metodo);
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
          {fase.metodo === 'DATAFONO' ? 'Acerca la tarjeta al datáfono…' : 'Esperando el Bizum…'}
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
      {error && <p className="text-[12px] text-muted-foreground">{error}</p>}
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
              <BotonCobro icono={CreditCard} etiqueta="Datáfono" cargando={false}
                onClick={() => cobrarConProveedor(r.id, 'DATAFONO')} />
              <BotonCobro icono={Smartphone} etiqueta="Bizum" cargando={false}
                onClick={() => cobrarConProveedor(r.id, 'BIZUM')} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BotonCobro({ icono: Icono, etiqueta, cargando, onClick }: {
  icono: typeof Banknote; etiqueta: string; cargando: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={cargando}
      className="flex-1 h-10 rounded-lg bg-card border border-border text-[12.5px] font-semibold text-foreground inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
    >
      {cargando ? <Loader2 size={13} className="animate-spin" /> : <Icono size={13} />}
      {etiqueta}
    </button>
  );
}

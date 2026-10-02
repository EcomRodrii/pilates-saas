'use client';

// «Nuevo cobro» (rediseño de Cobros, 2-oct-2026): UN diálogo para Cobros y para la
// ficha de la clienta (decisión 5), que dice antes de pulsar qué va a pasar.
//
//  · «Sí, ahora» → el recibo se crea PENDIENTE y lo cobra el servidor
//    (`crearFacturaDirecta`): un recibo no nace cobrado desde el navegador.
//    El método es obligatorio: sin él el cobro no entra en la caja ni en el desglose.
//  · «Lo paga después» → un recibo PENDIENTE con su vencimiento (`addRecibo`), que
//    queda en «Quién me debe».
//
// Lo que va a pasar (caja, factura) lo decide `queVaAPasar`, que es lo que hace el
// servidor; «Hacerle factura» solo se ofrece en efectivo (decisión 4).
// El dinero no se cobra dos veces: cerrojo síncrono además del estado, y un cobro
// que el servidor no confirmó cierra el diálogo —reenviarlo crearía otro recibo—.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import type { MetodoCobro } from '@/lib/types';
import { cn, formatEuro, hoyEnEstudio } from '@/lib/utils';
import { leerImporte, queVaAPasar, renovacionYaPendiente } from '@/lib/cobros/que-va-a-pasar';
import { desglosarIvaDesdeTotal } from '@/lib/fiscal/cierre-engine';
import { cargarCaja } from '@/lib/pos/cliente';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CasillaRenovacion } from './casilla-renovacion';
import { BuscarClienta } from './buscar-clienta';
import type { AvisosCobros } from './use-acciones-recibo';

const METODOS: { id: MetodoCobro; texto: string }[] = [
  { id: 'EFECTIVO', texto: 'Efectivo' },
  { id: 'TARJETA', texto: 'Tarjeta' },
  { id: 'BIZUM', texto: 'Bizum' },
  { id: 'TRANSFERENCIA', texto: 'Transferencia' },
];

const inputCls = 'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors focus:border-brand focus:outline-none';

export function DialogoNuevoCobro({ abierto, onCerrar, avisos, socioId }: {
  abierto: boolean;
  onCerrar: () => void;
  avisos: AvisosCobros;
  /** Desde la ficha de la clienta: ya elegida, sin buscador. */
  socioId?: string;
}) {
  // Mientras se cobra no se cierra: cerrarlo desmontaría el cerrojo y, al volver a
  // abrir y enviar, se crearía y cobraría otro recibo.
  const [ocupado, setOcupado] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o && !ocupado) onCerrar(); }}>
      <DialogContent className="max-w-md" data-testid="dialogo-nuevo-cobro">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">Nuevo cobro</DialogTitle>
        </DialogHeader>
        {/* El contenido se desmonta al cerrar: cada apertura empieza en blanco. */}
        {abierto && <Formulario onCerrar={onCerrar} onOcupado={setOcupado} avisos={avisos} socioFijo={socioId} />}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({ onCerrar, onOcupado, avisos, socioFijo }: {
  onCerrar: () => void; onOcupado: (ocupado: boolean) => void; avisos: AvisosCobros; socioFijo?: string;
}) {
  const { studio, socios, suscripciones, planesTarifa, recibos, addRecibo, crearFacturaDirecta } = useStudio();
  const [socioId, setSocioId] = useState(socioFijo ?? '');
  const [concepto, setConcepto] = useState('');
  const [importeTexto, setImporteTexto] = useState('');
  const [pagado, setPagado] = useState<'ahora' | 'despues'>('ahora');
  const [metodo, setMetodo] = useState<MetodoCobro | null>(null);
  const [vence, setVence] = useState(() => hoyEnEstudio());
  const [esRenovacion, setEsRenovacion] = useState(false);
  const [hacerFactura, setHacerFactura] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enCurso = useRef(false);

  // ¿Hay caja abierta? Solo para decir si el cobro se apunta en ella; si no se
  // puede leer (o el rol no la ve) no se dice nada, nunca «no hay caja».
  const [cajaAbierta, setCajaAbierta] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    void cargarCaja().then(r => { if (vivo) setCajaAbierta('error' in r ? null : !!r.caja); });
    return () => { vivo = false; };
  }, []);

  const clienta = socios.find(s => s.id === socioId);
  // El plan activo de la clienta: el que se renovaría al cobrarlo si se marca la casilla.
  const sus = useMemo(
    () => suscripciones.find(s => s.socioId === socioId && s.estado === 'ACTIVA'),
    [suscripciones, socioId],
  );
  const planNombre = sus ? (planesTarifa.find(p => p.id === sus.planId)?.nombre ?? 'su plan') : null;
  const yaPendiente = renovacionYaPendiente(sus?.id ?? null, recibos);
  const renovacion = !!sus && esRenovacion && !yaPendiente;
  // Solo la renovación va enlazada a su cuota. Una venta enlazada contaba como cuota
  // en Informes, la anulaba la política al cancelar la cuota y, si se le cobraba
  // con su tarjeta y acababa impagada, el reintento le CANCELABA el plan.
  // La ficha de la clienta lista sus recibos por clienta, no por cuota.

  const importe = leerImporte(importeTexto);
  const ahora = pagado === 'ahora';
  const factura = studio?.modoFacturacion === 'verifactu';
  const q = queVaAPasar({
    metodo: ahora ? metodo : null,
    cajaAbierta,
    modoFacturacion: studio?.modoFacturacion ?? null,
    nifEstudio: studio?.nif ?? null,
    hacerFactura,
  });
  const desglose = factura && importe ? desglosarIvaDesdeTotal(importe, studio?.ivaPorDefecto ?? 21) : null;

  const listo = !!socioId && concepto.trim() !== '' && importe != null && (ahora ? !!metodo : !!vence);

  async function enviar() {
    if (!listo || importe == null || enCurso.current) return;
    enCurso.current = true;
    setEnviando(true);
    onOcupado(true);
    setError(null);
    const nombre = clienta ? clienta.nombre : 'la clienta';
    try {
      if (ahora && metodo) {
        const res = await crearFacturaDirecta(
          { socioId, concepto: concepto.trim(), importe, suscripcionId: renovacion ? sus?.id ?? null : null, esRenovacion: renovacion },
          { metodo, hacerFactura: q.ofrecerHacerFactura && hacerFactura && q.saleFactura },
        );
        if (res.ok) {
          avisos.ok(`Cobrado: ${formatEuro(importe)} de ${nombre}.`);
          onCerrar();
          return;
        }
        // El recibo ya existe (cobrado, o pendiente en «Quién me debe»): reenviar el
        // formulario lo duplicaría. Se cierra y se dice qué ha pasado.
        if ('cobroRegistrado' in res || 'cobroSinConfirmar' in res) {
          avisos.error(res.error);
          onCerrar();
          return;
        }
        setError(res.error);
      } else {
        const res = await addRecibo({
          socioId, suscripcionId: renovacion ? sus?.id ?? null : null, concepto: concepto.trim(), importe,
          fechaVencimiento: vence, esRenovacion: renovacion,
        });
        if (res.ok) {
          avisos.ok(`Cobro de ${formatEuro(importe)} creado: queda en «Quién me debe».`);
          onCerrar();
          return;
        }
        setError(res.error);
      }
    } finally {
      enCurso.current = false;
      setEnviando(false);
      onOcupado(false);
    }
  }

  return (
    <div className="mt-2 space-y-4">
      <Campo texto="Clienta">
        {socioFijo ? (
          <p className="rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm font-medium text-foreground">
            {clienta ? `${clienta.nombre} ${clienta.apellidos}` : 'Clienta'}
          </p>
        ) : (
          // Otra clienta, otro plan: la casilla no se arrastra de una a otra.
          <BuscarClienta socios={socios} valor={socioId} onCambio={id => { setSocioId(id); setEsRenovacion(false); }} />
        )}
      </Campo>
      <Campo texto="Concepto">
        <input className={inputCls} placeholder="Bono 10 clases" value={concepto} onChange={e => setConcepto(e.target.value)} aria-label="Concepto" />
      </Campo>
      <Campo texto={factura ? 'Importe (con IVA)' : 'Importe'}>
        <div className="relative">
          <input
            className={cn(inputCls, 'pr-8')} inputMode="decimal" placeholder="85,00" aria-label="Importe"
            value={importeTexto} onChange={e => setImporteTexto(e.target.value)}
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
        </div>
        {importeTexto.trim() !== '' && importe == null && (
          <p className="mt-1 text-[12px] text-destructive">Escribe un importe mayor que 0, con dos decimales como mucho.</p>
        )}
        {desglose && (
          <p className="mt-1 text-[12px] text-muted-foreground">
            Base {formatEuro(desglose.base)} + IVA {formatEuro(desglose.cuota)} ({studio?.ivaPorDefecto ?? 21} %, el del estudio)
          </p>
        )}
      </Campo>

      <fieldset>
        <legend className="mb-1.5 text-[12.5px] font-semibold text-foreground">¿Ya te lo ha pagado?</legend>
        <div className="grid grid-cols-2 gap-2">
          <Opcion activa={ahora} onClick={() => setPagado('ahora')}>Sí, ahora</Opcion>
          <Opcion activa={!ahora} onClick={() => setPagado('despues')}>Lo paga después</Opcion>
        </div>
      </fieldset>

      {ahora ? (
        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-semibold text-foreground">¿Cómo te ha pagado?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METODOS.map(m => (
              <Opcion key={m.id} activa={metodo === m.id} onClick={() => { setMetodo(m.id); if (m.id !== 'EFECTIVO') setHacerFactura(false); }}>{m.texto}</Opcion>
            ))}
          </div>
        </fieldset>
      ) : (
        <Campo texto="Vence el">
          <input type="date" className={inputCls} value={vence} onChange={e => setVence(e.target.value)} aria-label="Vence el" />
        </Campo>
      )}

      {sus && planNombre && (
        <CasillaRenovacion
          planNombre={planNombre}
          marcada={esRenovacion}
          onCambio={setEsRenovacion}
          desactivada={yaPendiente ? 'Su cuota ya tiene una renovación sin cobrar: cóbrala desde «Quién me debe» en vez de crear otra.' : null}
        />
      )}

      {ahora && q.ofrecerHacerFactura && (
        <label className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-xs text-foreground">
          <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={hacerFactura} onChange={e => setHacerFactura(e.target.checked)} />
          <span>
            <span className="font-semibold">Hacerle factura</span>
            <span className="mt-0.5 block text-muted-foreground">Si te la pide. Una factura con número fiscal ya no se puede borrar.</span>
          </span>
        </label>
      )}

      {ahora && metodo && (renovacion || q.caja || q.factura) && (
        <ul className="space-y-0.5 rounded-lg bg-muted/50 px-3 py-2 text-[12.5px] text-muted-foreground" aria-label="Qué va a pasar">
          {renovacion && <li>Se renueva su plan ({planNombre}).</li>}
          {q.caja && <li>{q.caja}</li>}
          {q.factura && <li>{q.factura}</li>}
        </ul>
      )}

      {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="button" onClick={onCerrar} disabled={enviando}
          className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-background disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="button" onClick={() => void enviar()} disabled={!listo || enviando}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enviando && <Loader2 size={15} className="animate-spin" aria-hidden />}
          {ahora ? (importe ? `Cobrar ${formatEuro(importe)}` : 'Cobrar') : 'Crear el cobro'}
        </button>
      </div>
    </div>
  );
}

function Campo({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[12.5px] font-semibold text-foreground">{texto}</p>
      {children}
    </div>
  );
}

function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={activa}
      className={cn(
        'min-h-10 rounded-xl border px-3 text-[13px] font-medium transition-colors',
        activa ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

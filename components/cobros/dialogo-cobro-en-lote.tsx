'use client';

// «Seleccionar varias» → «Cobrar las N» (decisión 5): la confirmación, el
// progreso y el resultado del cobro de varias a la vez, tal cual eran en el panel
// anterior. La confirmación dice qué va a pasar con cada recibo y que no se
// deshace; el resultado cuenta lo que DIJO el servidor de cada uno, nunca «N
// procesados» a secas.

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCheck, Loader2 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import type { MetodoCobro } from '@/lib/types';
import { cn, formatEuro } from '@/lib/utils';
import { esCobroConfirmado } from '@/lib/cobros/marcar-cobrado';
import { emiteFacturaAutomatica } from '@/lib/factura-automatica';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import type { AvisosCobros } from './use-acciones-recibo';

export const ETIQUETA_METODO: Partial<Record<MetodoCobro, string>> = {
  EFECTIVO: 'en efectivo', TARJETA: 'con tarjeta', BIZUM: 'por Bizum', TRANSFERENCIA: 'por transferencia',
};

type Fase = 'confirmar' | 'cobrando' | 'hecho';

export function DialogoCobroEnLote({ ids, metodo, abierto, onCerrar, avisos }: {
  ids: string[];
  metodo: MetodoCobro;
  abierto: boolean;
  /** `cobrado`: si llegó a cobrar algo (para salir del modo selección). */
  onCerrar: (cobrado: boolean) => void;
  avisos: AvisosCobros;
}) {
  const { studio, recibos, marcarCobradoVarios } = useStudio();
  const [fase, setFase] = useState<Fase>('confirmar');
  const [hechos, setHechos] = useState(0);
  const [resultado, setResultado] = useState<{ guardados: number; yaEstaban: number; fallidos: number; sinConfirmar: number; anuladas: number } | null>(null);
  // El dinero no se cobra dos veces: cerrojo síncrono además del estado.
  const enCurso = useRef(false);

  const seleccion = useMemo(() => recibos.filter(r => ids.includes(r.id)), [recibos, ids]);
  const importe = seleccion.reduce((t, r) => t + r.importe, 0);
  const cuotas = new Set(seleccion.filter(r => r.suscripcionId && r.esRenovacion).map(r => r.suscripcionId)).size;

  async function cobrar() {
    if (enCurso.current) return;
    enCurso.current = true;
    setFase('cobrando');
    setHechos(0);
    try {
      const desenlaces = await marcarCobradoVarios(ids, metodo, setHechos);
      const fallidos = desenlaces.filter(d => !esCobroConfirmado(d) && d.resultado !== 'sin_confirmar' && d.resultado !== 'penalizacion_anulada').length;
      const sinConfirmar = desenlaces.filter(d => d.resultado === 'sin_confirmar').length;
      const yaEstaban = desenlaces.filter(d => d.resultado === 'ya_estaba' || d.resultado === 'cobrado_al_releer').length;
      const guardados = desenlaces.filter(d => d.resultado === 'aplicada').length;
      const sinRenovar = desenlaces.filter(d => d.resultado === 'aplicada' && d.renovacionFallida).length;
      if (sinRenovar > 0) {
        avisos.error(`${sinRenovar} ${sinRenovar === 1 ? 'cobro registrado' : 'cobros registrados'}, pero sin poder renovar el plan: renuévalo a mano desde la ficha de la clienta.`);
      }
      const anuladas = desenlaces.filter(d => d.resultado === 'penalizacion_anulada').length;
      setResultado({ guardados, yaEstaban, fallidos, sinConfirmar, anuladas });
    } catch {
      setResultado({ guardados: 0, yaEstaban: 0, fallidos: 0, sinConfirmar: ids.length, anuladas: 0 });
    } finally {
      setFase('hecho');
      enCurso.current = false;
    }
  }

  function cerrar() {
    if (fase === 'cobrando') return;
    const cobrado = (resultado?.guardados ?? 0) > 0;
    setFase('confirmar');
    setResultado(null);
    onCerrar(cobrado);
  }

  const problemas = !!resultado && resultado.fallidos + resultado.sinConfirmar > 0;

  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o) cerrar(); }}>
      <DialogContent className="max-w-md" data-testid="dialogo-cobro-en-lote">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">Cobrar varias a la vez</DialogTitle>
        </DialogHeader>
        {fase === 'confirmar' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2 rounded-xl border border-warning bg-warning/10 p-4">
              <p className="text-sm font-bold text-foreground">
                Vas a cobrar {ids.length} recibo{ids.length !== 1 ? 's' : ''} por <CifraPrivada inline>{formatEuro(importe)}</CifraPrivada>
              </p>
              <p className="text-[13px] text-muted-foreground">Te han pagado {ETIQUETA_METODO[metodo]}. Al confirmar, para cada recibo:</p>
              <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
                <li>se marca <strong className="text-foreground">cobrado</strong>{metodo !== 'TRANSFERENCIA' ? ' y se apunta en la caja si está abierta' : ''};</li>
                {emiteFacturaAutomatica(metodo, studio?.modoFacturacion ?? null, studio?.facturarAutomatico ?? true) && (
                  <li>se emite una <strong className="text-foreground">factura con número fiscal</strong>, que ya no se puede borrar;</li>
                )}
                {cuotas > 0 && (
                  <li>se renuevan <strong className="text-foreground">{cuotas} cuota{cuotas !== 1 ? 's' : ''}</strong> (se recarga el bono o se alarga el mes).</li>
                )}
              </ul>
              <p className="pt-1 text-[13px] font-semibold text-foreground">Esto no se puede deshacer: si después le devuelves el dinero, la renovación no se deshace sola.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={cerrar} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-background">
                Volver a la lista
              </button>
              <button onClick={cobrar} className="flex-1 rounded-xl bg-success py-2.5 text-sm font-bold text-white transition-colors hover:brightness-95">
                Sí, cobrar {ids.length}
              </button>
            </div>
          </div>
        )}
        {fase === 'cobrando' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-warning/10">
              <Loader2 size={32} className="animate-spin text-warning" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">Cobrando {hechos} / {ids.length}</p>
              <div className="mx-auto mt-3 h-2 w-48 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-success transition-all duration-200" style={{ width: `${(hechos / Math.max(1, ids.length)) * 100}%` }} />
              </div>
            </div>
          </div>
        )}
        {fase === 'hecho' && resultado && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className={cn('flex h-16 w-16 items-center justify-center rounded-2xl', problemas ? 'bg-warning/10' : 'bg-success/10')}>
              {problemas ? <AlertTriangle size={32} className="text-warning" /> : <CheckCheck size={32} className="text-success" />}
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">
                {resultado.guardados} cobro{resultado.guardados !== 1 ? 's' : ''} guardado{resultado.guardados !== 1 ? 's' : ''}
              </p>
              {resultado.yaEstaban > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">{resultado.yaEstaban} ya {resultado.yaEstaban === 1 ? 'estaba cobrado' : 'estaban cobrados'}.</p>
              )}
              {resultado.anuladas > 0 && (
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {resultado.anuladas === 1 ? '1 penalización estaba anulada y no se ha cobrado' : `${resultado.anuladas} penalizaciones estaban anuladas y no se han cobrado`}.
                </p>
              )}
              {resultado.sinConfirmar > 0 && (
                <p className="mt-1 max-w-sm text-sm text-warning">
                  {resultado.sinConfirmar} no se {resultado.sinConfirmar === 1 ? 'ha' : 'han'} podido confirmar. Comprueba si {resultado.sinConfirmar === 1 ? 'figura cobrado' : 'figuran cobrados'} antes de volver a intentarlo.
                </p>
              )}
              {resultado.fallidos > 0 && (
                <p className="mt-1 max-w-sm text-sm text-warning">
                  {resultado.fallidos} no se {resultado.fallidos === 1 ? 'ha podido guardar' : 'han podido guardar'} y {resultado.fallidos === 1 ? 'sigue' : 'siguen'} sin cobrar. Vuelve a intentarlo.
                </p>
              )}
            </div>
            <button onClick={cerrar} className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:brightness-95">
              Cerrar
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

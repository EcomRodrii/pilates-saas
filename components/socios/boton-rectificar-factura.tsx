'use client';

import { useId, useState } from 'react';
import { FileWarning } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { rectificarFactura } from '@/lib/api-client';
import { formatEuro } from '@/lib/utils';
import type { Factura } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Issue #769, Fase A: emite una factura rectificativa para un recibo DEVUELTO
// cuya factura de alta ya está sellada. Disparo MANUAL a propósito (no hay
// ningún trigger automático desde el webhook de Stripe todavía) — el tipo
// R1-R5, el método (S/I) y los importes los decide quien lo pulsa, con la
// gestoría si hace falta. El servidor no adivina ninguna fórmula fiscal.
//
// No se ofrece si ya existe una rectificativa sellada para esta factura
// (`facturas` con `rectificaA === factura.id` y `verifactuHash` no null) —
// evita duplicar por un doble clic, aunque el issue no descarta que algún día
// haga falta más de una (devoluciones parciales sucesivas).
// ─────────────────────────────────────────────────────────────────────────────

export function BotonRectificarFactura({
  factura, facturas, onHecho,
}: {
  factura: Factura;
  facturas: Factura[];
  onHecho: (mensaje: string) => void;
}) {
  const uid = useId();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [tipoFactura, setTipoFactura] = useState<'R1' | 'R2' | 'R3' | 'R4' | 'R5'>('R1');
  const [metodo, setMetodo] = useState<'S' | 'I'>('I');
  const [importe, setImporte] = useState(() => String(-Math.abs(factura.total)));

  if (!factura.verifactuHash) return null; // no se rectifica lo que nunca se selló de verdad.
  const yaRectificada = facturas.some(f => f.rectificaA === factura.id && f.verifactuHash);
  if (yaRectificada) return null;

  async function confirmar() {
    const total = Number(importe);
    if (!Number.isFinite(total)) return;
    setEnviando(true);
    // Método I (por diferencia): base/cuota reparten el mismo total con el
    // tipo de IVA de la factura original. Método S (sustitución): se ofrece
    // el mismo desglose como punto de partida — quien confirma puede
    // cambiarlo si la sustitución no es "a cero".
    const divisor = 1 + factura.tipoIVA / 100;
    const base = Math.round((total / divisor) * 100) / 100;
    const cuota = Math.round((total - base) * 100) / 100;
    const res = await rectificarFactura({
      facturaOriginalId: factura.id,
      tipoFactura,
      tipoRectificativa: metodo,
      baseImponible: base,
      cuotaIVA: cuota,
      total,
      importeRectificacion: total,
    });
    setEnviando(false);
    setAbierto(false);
    if ('ok' in res) {
      onHecho(res.aviso ?? 'Rectificativa emitida.');
    } else {
      onHecho(res.error);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg transition-colors"
        style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 12%, var(--card))', color: 'var(--warning)' }}
      >
        <FileWarning size={12} />Rectificativa
      </button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Emitir factura rectificativa de {factura.numeroCompleto}</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-xs text-muted-foreground rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
              La transmisión a Fiskaly/AEAT todavía no está activada para rectificativas — quedará sellada y
              encadenada en Tentare, pero hay que transmitirla aparte hasta que se verifique el envío.
            </p>
            <div>
              <span id={`${uid}-tipo`} className="text-xs font-semibold text-muted-foreground mb-1.5 block">Tipo (catálogo AEAT)</span>
              <div role="group" aria-labelledby={`${uid}-tipo`} className="flex flex-wrap gap-1.5">
                {(['R1', 'R2', 'R3', 'R4', 'R5'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setTipoFactura(t)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${tipoFactura === t ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span id={`${uid}-metodo`} className="text-xs font-semibold text-muted-foreground mb-1.5 block">Método</span>
              <div role="group" aria-labelledby={`${uid}-metodo`} className="flex gap-1.5">
                <button type="button" onClick={() => setMetodo('I')}
                  className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors ${metodo === 'I' ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground'}`}>
                  Por diferencia (I)
                </button>
                <button type="button" onClick={() => setMetodo('S')}
                  className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors ${metodo === 'S' ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground'}`}>
                  Sustitución (S)
                </button>
              </div>
            </div>
            <div>
              <label htmlFor={`${uid}-importe`} className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Importe de la rectificativa (IVA incluido, con signo)
              </label>
              <input id={`${uid}-importe`} type="number" step="0.01" value={importe} onChange={e => setImporte(e.target.value)}
                className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Factura original: {formatEuro(factura.total)}. Precargado como devolución total en negativo — ajústalo si es parcial.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button onClick={() => setAbierto(false)} className="text-xs font-semibold px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancelar</button>
            <button
              disabled={enviando || !Number.isFinite(Number(importe))}
              onClick={() => void confirmar()}
              className="text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {enviando ? 'Emitiendo…' : 'Emitir rectificativa'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

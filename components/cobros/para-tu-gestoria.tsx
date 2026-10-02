'use client';

// «Para tu gestoría» (decisión 8 de las maquetas del 2-oct-2026): la pestaña de un
// estudio que NO factura con Tentare. Lo que su gestoría necesita, por trimestre
// natural (el del IVA): el anterior, el que va y el año anterior. Las cifras son
// las de «Lo que he cobrado» (`cobradoEnTramo`) y el fichero, el mismo.
//
// «Enviar a mi gestoría» queda para otro PR (decisión 1 del fundador): hoy el
// envío del cierre solo lleva facturas e ingresos manuales.
// El fichero no lleva el IVA de cada cobro: no se promete.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronRight, Download, FileText, Loader2 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { cn, formatEuro } from '@/lib/utils';
import { bloquesDeGestoria, type BloqueGestoria } from '@/lib/cobros/gestoria';
import { cobradoEnTramo } from '@/lib/cobros/lo-cobrado';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { PanelFacturas } from './panel-facturas';
import type { AvisosCobros } from './use-acciones-recibo';
import { useDescargaCobrado } from './use-descarga-cobrado';

export function ParaTuGestoria({ hoy, avisos }: { hoy: string; avisos: AvisosCobros }) {
  const { recibos, facturas } = useStudio();
  const esPropietaria = useRol() === 'PROPIETARIO';
  const descargas = useDescargaCobrado(avisos);
  const [verFacturas, setVerFacturas] = useState(false);

  const bloques = useMemo(() => bloquesDeGestoria(hoy), [hoy]);
  const cifras = useMemo(() => ({
    anterior: cobradoEnTramo(recibos, bloques.anterior.tramo),
    enCurso: cobradoEnTramo(recibos, bloques.enCurso.tramo),
    anio: cobradoEnTramo(recibos, bloques.anioAnterior.tramo),
  }), [recibos, bloques]);

  const anioUltimaFactura = facturas.reduce((max, f) => (f.fechaEmision > max ? f.fechaEmision : max), '').slice(0, 4);

  const boton = (bloque: BloqueGestoria, texto: string) => (
    <BotonDescargar fase={descargas.fase(bloque.tramo)} ocupado={descargas.ocupado} onClick={() => void descargas.descargar(bloque.tramo)} texto={texto} />
  );

  return (
    <div className="space-y-4">
      <p className="max-w-[760px] text-[13.5px] text-muted-foreground text-pretty">
        Tus facturas las hace tu gestoría (no facturas con Tentare). Aquí tienes lo que necesita, por trimestre natural (el del IVA).
        {esPropietaria && (
          <>
            {' '}
            <Link href="/configuracion?tab=cobros#facturacion" className="inline-flex items-center font-medium text-brand-medio hover:underline">
              Facturar con Tentare <ChevronRight size={12} aria-hidden />
            </Link>
          </>
        )}
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <Bloque
          destacado titulo={bloques.anterior.etiqueta} cifra={cifras.anterior.neto}
          detalle={`Con IVA, neto de lo devuelto · ${cifras.anterior.nCobros} ${cifras.anterior.nCobros === 1 ? 'cobro' : 'cobros'} · el fichero lleva fecha, clienta, concepto y método de cada uno`}
          acciones={boton(bloques.anterior, 'Descargar')}
        />
        <Bloque
          titulo={bloques.enCurso.etiqueta} cifra={cifras.enCurso.neto}
          detalle={`Va sumando · ${cifras.enCurso.nCobros} ${cifras.enCurso.nCobros === 1 ? 'cobro' : 'cobros'} hasta hoy`}
          acciones={boton(bloques.enCurso, 'Descargar lo que va')}
        />
        <Bloque
          titulo={bloques.anioAnterior.etiqueta} cifra={cifras.anio.neto}
          detalle="Lo que tu gestoría necesita para cerrar el año"
          acciones={(
            <>
              {boton(bloques.anioAnterior, 'Descargar')}
              <Link href="/cierre" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted">
                <FileText size={15} aria-hidden />Abrir el cierre
              </Link>
            </>
          )}
        />
      </div>

      {facturas.length > 0 && (
        <div className="rounded-2xl border border-border bg-card">
          <button type="button" onClick={() => setVerFacturas(v => !v)} aria-expanded={verFacturas} className="flex w-full items-center gap-3 p-4 text-left">
            <FileText size={16} className="text-muted-foreground" aria-hidden />
            <span className="text-[13.5px] text-foreground">
              {facturas.length} {facturas.length === 1 ? 'factura emitida' : 'facturas emitidas'} con Tentare antes de dejar de facturar aquí
              {anioUltimaFactura ? ` (hasta ${anioUltimaFactura})` : ''}
            </span>
            <span className="ml-auto inline-flex items-center text-[13px] font-medium text-brand-medio">
              {verFacturas ? 'Ocultarlas' : 'Verlas'} <ChevronRight size={12} className={cn('transition-transform', verFacturas && 'rotate-90')} aria-hidden />
            </span>
          </button>
          {verFacturas && <div className="border-t border-border p-4"><PanelFacturas /></div>}
        </div>
      )}
    </div>
  );
}

function Bloque({ titulo, cifra, detalle, acciones, destacado }: { titulo: string; cifra: number; detalle: string; acciones: React.ReactNode; destacado?: boolean }) {
  return (
    <section aria-label={titulo} className={cn('rounded-2xl border bg-card p-5', destacado ? 'border-foreground/25' : 'border-border')}>
      <h2 className="text-[12.5px] font-medium text-muted-foreground">{titulo}</h2>
      <p className="mt-1 text-[26px] font-semibold tracking-tight tabular-nums text-foreground"><CifraPrivada>{formatEuro(cifra)}</CifraPrivada></p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground text-pretty">{detalle}</p>
      <div className="mt-3 flex flex-wrap gap-2">{acciones}</div>
    </section>
  );
}

function BotonDescargar({ fase, ocupado, onClick, texto }: { fase: 'idle' | 'loading' | 'done'; ocupado: boolean; onClick: () => void; texto: string }) {
  return (
    <button
      type="button" onClick={onClick} disabled={ocupado}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors disabled:opacity-60',
        fase === 'done' ? 'border-success/30 bg-success/10 text-success' : 'border-border bg-card text-foreground hover:bg-muted',
      )}
    >
      {fase === 'loading' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : fase === 'done' ? <CheckCircle2 size={15} aria-hidden /> : <Download size={15} aria-hidden />}
      {fase === 'loading' ? 'Preparando…' : fase === 'done' ? 'Descargado' : texto}
    </button>
  );
}

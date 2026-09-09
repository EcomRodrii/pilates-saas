'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { abrirFacturaPDF } from '@/lib/factura-pdf';
import { selloParaCliente } from '@/lib/factura-sello-cliente';
import { cargarFacturaVenta, esError } from '@/lib/pos/cliente';
import type { Factura } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// «¿Me das la factura?» — la pregunta más normal del mostrador, y la única que
// el TPV no sabía responder: la factura se sellaba desde el primer día, pero
// para llegar a ella había que salir del TPV, entrar en Cobros → Facturas y
// buscar el número, con la clienta esperando.
//
// ⚠️ La factura se pide AL MONTAR, no al pulsar. `abrirFacturaPDF` abre una
// pestaña con `window.open`, y una pestaña abierta DESPUÉS de un `await` ya no
// cuenta como gesto del usuario: Safari la bloquea sin decir nada, que es
// exactamente cómo se ve un botón roto. Precargando, el clic es síncrono.
// Misma trampa que el portapapeles de Safari (#994): funciona en Chrome de
// escritorio y falla en el iPad del mostrador, que es donde se usa esto.
// ─────────────────────────────────────────────────────────────────────────────

type Estado =
  | { f: 'cargando' }
  | { f: 'lista'; factura: Factura; receptor: { telefono: string | null; email: string | null } | null }
  | { f: 'sin'; motivo: string };

const CARGANDO: Estado = { f: 'cargando' };

export function BotonFactura({ ventaId, compacto = false }: { ventaId: string; compacto?: boolean }) {
  const { studio } = useStudio();
  // El estado lleva SU venta dentro. Así el reinicio al cambiar de venta se
  // deriva en render en vez de con un setState en el cuerpo del efecto, que
  // este repo rechaza (`react-hooks/set-state-in-effect` como error).
  const [resultado, setResultado] = useState<{ ventaId: string; estado: Estado } | null>(null);

  useEffect(() => {
    let vivo = true;
    cargarFacturaVenta(ventaId).then((r) => {
      if (!vivo) return;
      const estado: Estado = esError(r)
        ? { f: 'sin', motivo: r.error }
        : r.factura
          ? { f: 'lista', factura: r.factura, receptor: r.receptor }
          : { f: 'sin', motivo: r.motivo ?? 'Esta venta todavía no tiene factura.' };
      setResultado({ ventaId, estado });
    });
    return () => { vivo = false; };
  }, [ventaId]);

  const estado = resultado && resultado.ventaId === ventaId ? resultado.estado : CARGANDO;

  function abrir() {
    if (estado.f !== 'lista') return;
    abrirFacturaPDF(
      estado.factura,
      {
        nombre: studio?.nombre ?? 'Tentare',
        nif: studio?.nif ?? '—',
        direccion: [studio?.direccion, studio?.ciudad].filter(Boolean).join(', ') || '—',
      },
      estado.receptor,
      // La factura del mostrador es la de la CLIENTA: sale con el sello de
      // cotejo si la AEAT tiene el registro, y nunca con la huella ni con el
      // aviso de entorno de pruebas. Ver `lib/factura-sello-cliente.ts`.
      selloParaCliente(estado.factura, studio?.nif ?? '', {
        produccion: process.env.NEXT_PUBLIC_VERIFACTU_ENTORNO === 'produccion',
      }),
    );
  }

  if (estado.f === 'sin') {
    return <p className="text-[12px] text-muted-foreground text-center max-w-[300px]">{estado.motivo}</p>;
  }

  const cargando = estado.f === 'cargando';
  return (
    <button
      onClick={abrir}
      disabled={cargando}
      className={
        compacto
          ? 'h-11 px-4 rounded-xl border border-border text-[14px] font-medium text-foreground inline-flex items-center gap-2 disabled:opacity-50'
          : 'w-full h-12 rounded-xl border border-border text-[15px] font-semibold text-foreground inline-flex items-center justify-center gap-2 disabled:opacity-50'
      }
    >
      {cargando ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
      {cargando ? 'Preparando la factura…' : `Factura ${estado.f === 'lista' ? estado.factura.numeroCompleto : ''}`}
    </button>
  );
}

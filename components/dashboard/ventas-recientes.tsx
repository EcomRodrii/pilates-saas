'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { cn, formatEuro } from '@/lib/utils';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import type { EstadoRecibo } from '@/lib/types';

// Resumen de ventas recientes pedido por el fundador junto al toast+sonido de
// nueva venta: "un apartado que liste bono/plan/clase suelta, importe, alumna,
// fecha, estado". Alcance deliberadamente pequeño, mismo criterio que
// `DevolucionesPendientes`/`PenalizacionesPendientes`: una lista, sin filtros
// ni paginación — el detalle completo con búsqueda ya vive en
// /cobros?tab=cobrado ("Lo que he cobrado"); esta tarjeta es solo el vistazo
// rápido del dashboard, de ahí el `deepLink` del toast y el enlace de abajo
// hacia esa misma pantalla en vez de duplicar sus filtros aquí.
//
// LECTURA pura sobre datos ya cargados por el estudio (recibos/socios de
// useStudio, RLS por estudio) — no dispara ninguna escritura, no puede
// reproducir el patrón de "escritura optimista sin comprobar" de este repo.

const N = 8;

const BADGE: Record<EstadoRecibo, { bg: string; text: string; label: string }> = {
  COBRADO:   { bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', text: 'var(--success)', label: 'Cobrado' },
  PENDIENTE: { bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))', text: 'var(--warning)', label: 'Sin cobrar' },
  DEVUELTO:  { bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', text: 'var(--destructive)', label: 'Devuelto' },
  EN_CURSO:  { bg: 'color-mix(in srgb, var(--info) 12%, var(--card))', text: 'var(--brand)', label: 'En curso' },
  FALLIDO:   { bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', text: '#7A2F1D', label: 'Fallido' },
};

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function VentasRecientes() {
  const { recibos, socios } = useStudio();

  const ventas = useMemo(() => {
    return [...recibos]
      // "Venta" = recibo con dueña (bono/plan/clase), no un ajuste sin socia.
      .filter(r => r.socioId)
      .sort((a, b) => {
        const fa = a.fechaCobro ?? a.fechaVencimiento;
        const fb = b.fechaCobro ?? b.fechaVencimiento;
        return new Date(fb).getTime() - new Date(fa).getTime();
      })
      .slice(0, N)
      .map(r => {
        const socio = socios.find(s => s.id === r.socioId);
        return {
          id: r.id,
          concepto: r.concepto,
          importe: r.importe,
          estado: r.estado,
          fecha: r.fechaCobro ?? r.fechaVencimiento,
          socia: socio ? `${socio.nombre} ${socio.apellidos}`.trim() : 'Clienta',
        };
      });
  }, [recibos, socios]);

  if (ventas.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Receipt className="size-4 text-brand" />
          <p className="text-[13px] font-medium text-foreground">Ventas recientes</p>
        </div>
        <Link href="/cobros?tab=cobrado" className="text-[12px] font-semibold text-brand-medio hover:underline">
          Ver todo
        </Link>
      </div>
      <div className="flex flex-col gap-1.5">
        {ventas.map(v => {
          const b = BADGE[v.estado];
          return (
            <div key={v.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-foreground">
                  <span className="font-semibold">{v.socia}</span>
                  <span className="text-muted-foreground"> · {v.concepto}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">{fecha(v.fecha)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CifraPrivada inline className="text-[13px] font-bold text-foreground">
                  {formatEuro(v.importe)}
                </CifraPrivada>
                <span
                  className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold')}
                  style={{ backgroundColor: b.bg, color: b.text }}
                >
                  {b.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

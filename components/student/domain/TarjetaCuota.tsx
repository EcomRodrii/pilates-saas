'use client';

import Link from 'next/link';
import type { Bono, Pago, PlazaFijaVista } from '@/lib/student/tipos';
import { textoTopes } from '@/lib/student/saldo-bono';
import { etiquetaPagos } from '@/lib/student/bonos-vista';
import { resumenClaseFija, textoRenovacionCuota } from '@/lib/student/mi-plan-vista';
import { SemanaCuota } from '@/components/student/domain/SemanaCuota';
import { Icono } from '@/components/student/ui/Icono';
import { euros } from '@/lib/student/formato';

// «Tu cuota» en Mi plan (maqueta «Clase fija y bonos, ordenados», 6-oct-2026): cómo va de pagos, su nombre, cuántas le
// quedan ESTA semana con su barra, la próxima renovación (solo si de verdad se renueva) y su clase fija en una línea que
// lleva a Mis clases → Clase fija.
//
// ⚠️ Nada de dinero que no sea verdad: «Al día» solo sin recibos debidos y con alguno pagado (los mismos estados que
// Recibos), y la renovación sale de `textoRenovacionCuota`. Una cuota no enseña ningún saldo de sesiones: el motor no lo
// gasta.
export function TarjetaCuota({ slug, cuota, pagos, fijas, nombresTipo, hoy, hrefClaseFija, debe = null }: {
  slug: string;
  cuota: Bono;
  pagos: Pago[];
  /** Sus clases fijas (`loQueTengo().fijas`). */
  fijas: PlazaFijaVista[];
  nombresTipo: Record<string, string>;
  hoy: string;
  hrefClaseFija: string;
  /** Un recibo de ESTA cuota sin pagar: se dice en vez de «Próxima renovación» (no se anuncia la siguiente con una debida). */
  debe?: { concepto: string; importe: number } | null;
}) {
  const pagosEtiqueta = etiquetaPagos(pagos, cuota.id);
  const topes = textoTopes(cuota, nombresTipo);
  const conTope = (cuota.limiteSemanal ?? 0) > 0 || Object.keys(cuota.limitePorTipo ?? {}).length > 0;
  const fija = resumenClaseFija(fijas, hoy);
  return (
    <section
      className="card card--pad-lg stack" data-testid="cuota-hero" aria-label={`Tu cuota: ${cuota.nombre}`}
      style={{ ['--gap' as string]: 'var(--s-3)' }}
    >
      <div className="row row--between">
        <p className="t-label" style={{ margin: 0 }}>Tu cuota</p>
        {pagosEtiqueta && (
          <span data-testid="cuota-pagos" className={'badge ' + (pagosEtiqueta === 'Al día' ? 'badge--ok' : 'badge--few')}>{pagosEtiqueta}</span>
        )}
      </div>
      <div>
        <p className="t-title" style={{ margin: 0 }}>{cuota.nombre}</p>
        {/* Sin tope semanal se dice; con él, la barra de abajo ya lo cuenta, y aquí solo los topes por actividad. */}
        {!conTope && <p className="t-meta" style={{ margin: '3px 0 0' }}>{topes ?? 'Sin máximo semanal'}</p>}
      </div>
      {conTope && <SemanaCuota slug={slug} suscripcionId={cuota.id} nombresTipo={nombresTipo} />}
      {debe
        // `.note--warn`: su pareja de tokens está calibrada a 4,5:1 también en los estilos oscuros (Carbón).
        ? <p className="note note--warn" data-testid="cuota-vigencia" style={{ margin: 0, fontWeight: 700 }}>Pendiente de pago: {debe.concepto} · {euros(debe.importe)}</p>
        : <p className="t-meta" data-testid="cuota-vigencia" style={{ margin: 0 }}>{textoRenovacionCuota(cuota)}</p>}
      {fija && (
        <Link
          href={hrefClaseFija} data-testid="cuota-fija" className="tap"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)', textDecoration: 'none' }}
        >
          <span aria-hidden style={{ display: 'flex' }}><Icono nombre="calendario" tamano={18} /></span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-small)' }}>
            <b>{fija.titulo}:</b> {fija.dias}
            {fija.sub && <span style={{ display: 'block', marginTop: 1 }}>{fija.sub}</span>}
          </span>
          <span aria-hidden style={{ display: 'flex' }}><Icono nombre="chevron-derecha" tamano={16} /></span>
        </Link>
      )}
    </section>
  );
}

'use client';

// Los planes a la venta en /reservar y en los widgets «Planes y precios» y
// «Bonos y packs». Dos maquetas (lib/reservar/tarjeta-plan.ts → maquetaPlanes):
// - «columnas» (referencia «Tarifas»): tipos distintos que se comparan.
// - «lista» (referencia «Pases y bonos»): un solo tipo, con la foto del estudio
//   arriba si la hay.
//
// El pago es el de siempre: cada tarjeta llama a `onContratar(plan)`. Nada se
// inventa: «EL MÁS ELEGIDO» solo sale si el servidor lo calculó con compras
// reales (planMasElegidoId), y el ahorro solo si hay clase suelta con la que
// comparar (ahorro-plan.ts). El botón se sigue llamando «Contratar»: es lo
// que dicen la app de la alumna y las pruebas.

import { useSyncExternalStore, type CSSProperties } from 'react';
import { Layers, Repeat, Ticket } from 'lucide-react';
import type { PlanTarifa } from '@/lib/types';
import { maquetaPlanes, precioEnEuros, resumenPlan, type TipoTarjetaPlan } from '@/lib/reservar/tarjeta-plan';
import { ahorroPorcentaje } from '@/lib/reservar/ahorro-plan';

interface Props {
  planes: PlanTarifa[];
  destacadoId: string | null;
  precioClaseSuelta: number | null;
  cargandoId: string | null;
  onContratar: (p: PlanTarifa) => void;
  /** Foto del estudio para la cabecera de la maqueta de lista (opcional). */
  fotoCabecera?: string | null;
}

// Estrecho (móvil, o el iframe metido en una columna): las columnas se apilan
// en tarjetas altas y comparar obliga a hacer scroll. Ahí va la lista compacta.
// Los planes llegan del cliente tras montar, así que no hay HTML de servidor
// que casar: el valor de servidor (false) solo existe un instante.
const ESTRECHO = '(max-width: 560px)';
function suscribirEstrecho(cb: () => void) {
  const mq = window.matchMedia(ESTRECHO);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const esEstrecho = () => window.matchMedia(ESTRECHO).matches;

const ICONO: Record<TipoTarjetaPlan, typeof Layers> = { cuota: Repeat, bono: Layers, suelta: Ticket };

const marca = 'var(--portal-brand)';
const sobreMarca = 'var(--portal-brand-foreground)';

function Icono({ tipo, tam = 40 }: { tipo: TipoTarjetaPlan; tam?: number }) {
  const Ic = ICONO[tipo];
  return (
    <span aria-hidden="true" style={{
      width: tam, height: tam, flex: '0 0 auto', borderRadius: 12, display: 'grid', placeItems: 'center',
      background: `color-mix(in srgb, ${marca} 11%, var(--portal-surface))`, color: marca,
    }}>
      <Ic size={Math.round(tam * 0.47)} strokeWidth={1.8} />
    </span>
  );
}

function Girando() {
  return <span style={{ width: 14, height: 14, border: '2px solid color-mix(in srgb, currentColor 30%, transparent)', borderTopColor: 'currentColor', borderRadius: 999, display: 'inline-block' }} className="animate-spin" />;
}

const pastilla: CSSProperties = {
  display: 'inline-block', background: marca, color: sobreMarca, fontSize: 10, fontWeight: 700,
  letterSpacing: '.08em', padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
};

export function PlanesPublicos({ planes, destacadoId, precioClaseSuelta, cargandoId, onContratar, fotoCabecera }: Props) {
  const estrecho = useSyncExternalStore(suscribirEstrecho, esEstrecho, () => false);
  const maqueta = estrecho ? 'lista' : maquetaPlanes([...new Set(planes.map(p => p.tipo))]);

  if (maqueta === 'lista') {
    return (
      <div style={{ maxWidth: 640, marginInline: 'auto', marginTop: 18, borderRadius: 22, overflow: 'hidden', background: 'var(--portal-surface)', border: '1px solid var(--portal-line)' }}>
        {fotoCabecera && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoCabecera} alt="" loading="lazy" decoding="async" style={{ display: 'block', width: '100%', height: 150, objectFit: 'cover' }} />
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 6 }}>
          {planes.map(p => {
            const r = resumenPlan(p);
            const destacado = p.id === destacadoId;
            const ahorro = ahorroPorcentaje(p, precioClaseSuelta);
            const detalle = [r.porClase, r.vigencia].filter(Boolean).join(' · ');
            return (
              <li key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 12px', borderRadius: 16,
                background: destacado ? `color-mix(in srgb, ${marca} 7%, var(--portal-surface))` : 'transparent',
              }}>
                <Icono tipo={r.tipo} />
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  {destacado && <span style={{ ...pastilla, marginBottom: 5 }}>EL MÁS ELEGIDO</span>}
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--portal-ink)', lineHeight: 1.25 }}>{p.nombre}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--portal-muted)', marginTop: 3 }}>{detalle}</div>
                  {ahorro !== null && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-accent)', marginTop: 3 }}>Ahorras un {ahorro} %</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flex: '0 0 auto' }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--portal-ink)', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                    {precioEnEuros(p.precio)}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--portal-muted)' }}>{r.sufijoPrecio}</span>
                  </div>
                  <button type="button" onClick={() => onContratar(p)} disabled={cargandoId === p.id}
                    style={{
                      height: 36, padding: '0 16px', borderRadius: 999, border: 0, background: marca, color: sobreMarca,
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                      opacity: cargandoId === p.id ? 0.7 : 1,
                    }}>
                    {cargandoId === p.id ? <Girando /> : 'Contratar'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    // Rejilla y no una pila: los planes se COMPARAN, y apilados obligaban a
    // recordar el precio anterior al bajar.
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 14, marginTop: 22, alignItems: 'stretch' }}>
      {planes.map(p => {
        const r = resumenPlan(p);
        const destacado = p.id === destacadoId;
        const ahorro = ahorroPorcentaje(p, precioClaseSuelta);
        return (
          <div key={p.id} style={{
            position: 'relative', display: 'flex', flexDirection: 'column', gap: 14,
            padding: '22px 20px 20px', borderRadius: 20, background: 'var(--portal-surface)',
            border: destacado ? `2px solid ${marca}` : '1px solid var(--portal-line)',
          }}>
            {destacado && (
              <span style={{ ...pastilla, position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)' }}>EL MÁS ELEGIDO</span>
            )}
            <Icono tipo={r.tipo} />
            <div style={{ flex: '1 1 auto' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--portal-ink)', lineHeight: 1.25 }}>{p.nombre}</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--portal-ink)', letterSpacing: '-0.02em', marginTop: 8, whiteSpace: 'nowrap' }}>
                {precioEnEuros(p.precio)}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--portal-muted)' }}>{r.sufijoPrecio}</span>
              </div>
              {r.porClase && <div style={{ fontSize: 13, color: 'var(--portal-muted)', marginTop: 4 }}>{r.porClase}</div>}
              <div style={{ fontSize: 13, color: 'var(--portal-muted)', marginTop: 2 }}>{r.vigencia}</div>
              {ahorro !== null && (
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--portal-accent)', marginTop: 6 }}>
                  Ahorras un {ahorro} % frente a clases sueltas
                </div>
              )}
            </div>
            <button type="button" onClick={() => onContratar(p)} disabled={cargandoId === p.id}
              style={{
                height: 46, borderRadius: 999, border: 0, background: marca, color: sobreMarca, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: cargandoId === p.id ? 0.7 : 1,
              }}>
              {cargandoId === p.id ? <Girando /> : 'Contratar'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

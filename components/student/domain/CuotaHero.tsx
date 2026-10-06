'use client';

import Link from 'next/link';
import type { Bono, Pago, PlazaFijaVista } from '@/lib/student/tipos';
import type { ProductoTienda } from '@/lib/student/tienda';
import { precioDeTienda } from '@/lib/student/tienda';
import { textoTopes } from '@/lib/student/saldo-bono';
import { etiquetaPagos, textoUltimoRecibo, textoVigencia } from '@/lib/student/bonos-vista';
import { nombreDia } from '@/lib/student/plaza-fija';
import { mayuscula } from '@/lib/genero';
import { SemanaCuota } from '@/components/student/domain/SemanaCuota';
import { FilaAccion } from '@/components/student/ui/FilaAccion';
import { ESTADO_PAGO } from '@/components/student/domain/PaymentItem';

// La cabecera de la cuota en Bonos (P4-E, maqueta app-alumna-2): «Tu cuota», cómo va de pagos, su nombre, lo que
// incluye (topes), hasta cuándo vale, «Esta semana», su clase fija y sus recibos, y «Si quieres más» solo si algo de la
// tienda da clases que la cuota NO incluye.
//
// ⚠️ Nada de dinero que no sea verdad: «Al día» solo sin recibos debidos y con alguno pagado (los mismos estados que
// /pagos), la vigencia nunca dice «se renueva sola» y el último recibo lleva la palabra de /pagos. Una cuota no enseña
// ningún saldo de sesiones: el motor no lo gasta.
export function CuotaHero({ slug, cuota, pagos, plazas, nombresTipo, mas, href }: {
  slug: string;
  cuota: Bono;
  pagos: Pago[];
  /** Sus clases fijas (para «Tu clase fija»). */
  plazas: PlazaFijaVista[];
  nombresTipo: Record<string, string>;
  /** «Si quieres más» (`masParaCuota`). */
  mas: { productos: ProductoTienda[]; noIncluye: string[] };
  href: (ruta: string) => string;
}) {
  const pagosEtiqueta = etiquetaPagos(pagos, cuota.id);
  const topes = textoTopes(cuota, nombresTipo);
  const ultimo = textoUltimoRecibo(pagos, cuota.id, (p) => ESTADO_PAGO[p.estado].txt);
  const conTope = (cuota.limiteSemanal ?? 0) > 0 || Object.keys(cuota.limitePorTipo ?? {}).length > 0;
  const fijas = plazas.filter((p) => p.estado === 'ACTIVA' || p.pausa);
  const detalleFija = fijas.map((p) => `${mayuscula(nombreDia(p.diaSemana))} ${p.hora}`).join(' · ');
  return (
    <>
      <section className="card card--pad-lg" data-testid="cuota-hero" aria-label={`Tu cuota: ${cuota.nombre}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <p className="t-label" style={{ margin: 0 }}>Tu cuota</p>
          {pagosEtiqueta && (
            <span data-testid="cuota-pagos" className={'badge ' + (pagosEtiqueta === 'Al día' ? 'badge--ok' : 'badge--few')}>{pagosEtiqueta}</span>
          )}
        </div>
        <p className="t-title" style={{ margin: '8px 0 0' }}>{cuota.nombre}</p>
        <p className="t-small t-dim" style={{ margin: '4px 0 0' }}>{topes ?? 'Sin máximo semanal'}</p>
        <p className="t-small t-dim" data-testid="cuota-vigencia" style={{ margin: '2px 0 0' }}>{textoVigencia(cuota)}</p>
        {conTope && <SemanaCuota slug={slug} suscripcionId={cuota.id} nombresTipo={nombresTipo} />}
      </section>

      {(fijas.length > 0 || ultimo) && (
        <section className="card" style={{ padding: '0 16px' }}>
          {fijas.length > 0 && (
            <FilaAccion
              icono="calendario"
              titulo={fijas.length === 1 ? 'Tu clase fija' : 'Tus clases fijas'}
              detalle={detalleFija}
              href={`${href('/mis-reservas')}?tab=fijas`}
              testId="cuota-fija"
            />
          )}
          {ultimo && (
            <FilaAccion icono="recibo" titulo="Recibos y facturas" detalle={ultimo} href={href('/pagos')} testId="cuota-recibos" />
          )}
        </section>
      )}

      {mas.productos.length > 0 && (
        <section data-testid="cuota-mas" aria-label="Si quieres más">
          <p className="t-label" style={{ margin: '4px 0 6px' }}>Si quieres más</p>
          <p className="t-meta" style={{ margin: '0 0 8px' }}>Para las clases que tu cuota no incluye{mas.noIncluye.length > 0 ? `: ${mas.noIncluye.join(', ')}` : ''}.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mas.productos.slice(0, 3).map((p) => (
              <div key={p.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                <span style={{ minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: 'var(--t-body)' }}>{p.nombre}</b>
                  {p.sesiones != null && p.sesiones > 0 && <span className="t-meta">{p.sesiones === 1 ? '1 sesión' : `${p.sesiones} sesiones`}</span>}
                </span>
                <span className="t-num" style={{ fontWeight: 800, flexShrink: 0 }}>{precioDeTienda(p)}</span>
              </div>
            ))}
          </div>
          <Link href={href('/comprar')} className="tap t-small" style={{ display: 'inline-block', marginTop: 8, fontWeight: 800, color: 'var(--accent)' }}>Ver en la tienda</Link>
        </section>
      )}
    </>
  );
}

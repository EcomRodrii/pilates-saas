'use client';

import Link from 'next/link';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';
import type { Bono } from '@/lib/student/tipos';
import { textoPrecioPorClase, textoReservadas, textoSirvePara } from '@/lib/student/bonos-vista';
import { SE_USA_SI_LA_CUOTA_NO_CUBRE, etiquetaCaducidad, textoHasta, textoSaldoDe } from '@/lib/student/mi-plan-vista';
import { Icono } from '@/components/student/ui/Icono';

// «Tu bono» en Mi plan (maqueta «Clase fija y bonos, ordenados», 6-oct-2026): el bono que se gasta primero, con el anillo
// de lo que le queda. Con una cuota además, el rótulo es «También tienes» y dice cuándo se usa («la mensual gana»).
//
// ⚠️ El anillo dice DE QUÉ queda: la cifra y, debajo, «de 10» solo si es verdad (`saldoBono`); a su lado, «7 de 10
// sesiones». Nunca «Te quedan» con el 10 suelto (se leía «llevo 7 hechas»).
// ⚠️ El anillo son dos `<circle>` y la cifra va en HTML encima: sin `<path>` sueltos (la guardia de iconos).
// ⚠️ Con una sesión o menos, el anillo en `--warning`: nunca el verde de «ha ido bien».
export function TarjetaBono({ bono, saldo, secundaria = false, reservadas, nombresTipo, hoy, hrefDetalle, hrefMisClases, aviso, hrefTienda }: {
  bono: Bono;
  saldo: { quedan: number; de: number | null };
  /** Tiene además una cuota: el bono es lo de «también tienes». */
  secundaria?: boolean;
  /** Sus próximas clases ya pagadas con este bono (`reservadasConBono`). */
  reservadas: { fecha: string }[];
  nombresTipo: Record<string, string>;
  hoy: string;
  hrefDetalle: string;
  hrefMisClases: string;
  /** Caduca pronto o le queda poco (`avisoBono`). */
  aviso?: string | null;
  hrefTienda?: string | null;
}) {
  const { quedan, de } = saldo;
  const base = de ?? (bono.sesionesDelPlan && bono.sesionesDelPlan > 0 ? Math.max(bono.sesionesDelPlan, quedan) : Math.max(quedan, 1));
  const pct = Math.max(0, Math.min(1, quedan / base));
  const r = 46;
  const c = 2 * Math.PI * r;
  const pocas = quedan <= 1;
  const caduca = etiquetaCaducidad(bono, hoy);
  const precio = textoPrecioPorClase(bono);
  const yaReservadas = textoReservadas(reservadas);
  const deQue = textoSaldoDe(saldo);
  return (
    <section className="card card--pad-lg stack" data-testid="bono-hero" aria-label={`${secundaria ? 'También tienes' : 'Tu bono'}: ${bono.nombre}`} style={{ ['--gap' as string]: 'var(--s-3)' }}>
      <div className="row row--between">
        <p className="t-label" style={{ margin: 0 }}>{secundaria ? 'También tienes' : 'Tu bono'}</p>
        {/* La píldora solo cuando la caducidad importa (un mes o menos); si no, ya lo dice «hasta el …». */}
        {caduca && caduca.dias <= 30 && <span data-testid="bono-caduca-pronto" className={'badge ' + (caduca.aviso ? 'badge--few' : 'badge--neutral')}>{caduca.texto}</span>}
      </div>
      <Link href={hrefDetalle} transitionTypes={TRANSICION_ADELANTE} className="tap row" style={{ ['--gap' as string]: '14px', color: 'inherit', textDecoration: 'none', alignItems: 'center' }}>
        <span role="img" aria-label={`Te quedan ${deQue}`} style={{ position: 'relative', width: 112, height: 112, flexShrink: 0 }}>
          <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden data-testid="anillo-bono">
            <circle cx="56" cy="56" r={r} fill="none" stroke="var(--muted)" strokeWidth="10" />
            <circle
              data-testid="anillo-progreso"
              cx="56" cy="56" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
              style={{ stroke: pocas ? 'var(--warning)' : 'var(--accent)' }}
              strokeDasharray={`${pct * c} ${c}`} transform="rotate(-90 56 56)"
            />
          </svg>
          <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span className="t-display t-num" data-testid="bono-restantes" style={{ lineHeight: 1 }}>{quedan}</span>
            <span className="t-meta t-num" style={{ marginTop: 2 }}>{de != null ? `de ${de}` : quedan === 1 ? 'sesión' : 'sesiones'}</span>
          </span>
        </span>
        <span className="stack" style={{ ['--gap' as string]: '4px', flex: 1, minWidth: 0 }}>
          <b className="t-card-title">{bono.nombre}</b>
          <span className="t-meta" data-testid="bono-caduca">{deQue} · {textoHasta(bono).toLowerCase()}</span>
          <span className="t-meta">{textoSirvePara(bono, nombresTipo)}</span>
          {secundaria && <span className="t-meta" data-testid="bono-se-usa" style={{ color: 'var(--foreground)' }}>{SE_USA_SI_LA_CUOTA_NO_CUBRE}</span>}
          {precio && <span className="t-meta" data-testid="bono-precio-clase">{precio}</span>}
        </span>
      </Link>
      {aviso && (
        <div data-testid="bono-aviso" className="note note--warn" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span aria-hidden style={{ display: 'flex' }}><Icono nombre="alerta" tamano={18} /></span>
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700 }}>{aviso}</span>
          {hrefTienda && <Link href={hrefTienda} className="tap no-shrink" style={{ fontWeight: 800, color: 'inherit', textDecoration: 'underline' }}>Tienda</Link>}
        </div>
      )}
      <div className="row row--between" style={{ ['--gap' as string]: '10px', alignItems: 'center' }}>
        {yaReservadas
          ? <Link href={hrefMisClases} className="tap t-meta" data-testid="bono-reservadas" style={{ color: 'inherit', minWidth: 0 }}>{yaReservadas}</Link>
          : <span />}
        <Link href={hrefDetalle} transitionTypes={TRANSICION_ADELANTE} className="tap no-shrink" data-testid="bono-movimientos" style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          Movimientos <Icono nombre="chevron-derecha" tamano={16} />
        </Link>
      </div>
    </section>
  );
}

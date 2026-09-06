'use client';

import Link from 'next/link';
import type { Bono } from '@/lib/student/tipos';
import type { DiaSemana } from '@/lib/student/ritmo';

// «TU RITMO» — una sola tarjeta, no tres.
//
// ⚠️ REDISEÑO DE COMPOSICIÓN. Antes eran tres bloques apilados: una tarjeta
// ancha con siete puntos de 8 px perdidos en medio de un espacio vacío, y
// debajo dos tarjetas gemelas —«Mi progreso» y «Mi bono»— con la MISMA forma
// exacta: etiqueta, cifra grande, pie y barra. Dos cajas idénticas una al lado
// de otra no crean jerarquía; crean ruido, y es lo que hacía que esta zona
// pareciese el panel de administración de otra aplicación en vez de la app de
// un estudio.
//
// Lo que cambia:
//
//  · La SEMANA pasa a ser lo primero y ocupa el ancho de verdad. Es el dato con
//    forma —siete marcas que se leen de un vistazo—, así que manda.
//  · «Esta semana» PIERDE SU BARRA. Medía lo mismo que los puntos de arriba,
//    contra una referencia que la propia app se inventaba (la mejor semana
//    conocida). Dos dibujos del mismo hecho, y uno de ellos con un eje que no
//    significa nada. Queda la cifra, que sí.
//  · El BONO conserva la suya, porque el consumo no se ve en ningún otro sitio.
//
// ⚠️ NINGUNA CIFRA ESTÁ INVENTADA. Bono, días y racha salen de sus reservas
// reales (`lib/student/ritmo.ts`). La META semanal del diseño original
// («meta 3/sem») no existe en el backend —ni tabla, ni campo, ni pantalla donde
// fijarla—, así que no se pinta: se cuenta lo que lleva.

/** Barra del sistema (`.bar` en student.css). El porcentaje lo pone el padre. */
function Barra({ hecho, total, tono }: { hecho: number; total: number; tono?: 'ok' }) {
  const pct = total > 0 ? Math.min(100, Math.round((hecho / total) * 100)) : 0;
  return (
    <div aria-hidden className={'bar' + (tono === 'ok' ? ' bar--ok' : '')} style={{ ['--pct' as string]: `${pct}%` }}>
      <i />
    </div>
  );
}

/**
 * Los siete días.
 *
 * Relleno = clase hecha. Anillo = hoy. El día de hoy sin clase se ve como
 * anillo vacío. Antes los puntos iban centrados en una fila con el título a la
 * izquierda y la racha a la derecha, así que en un móvil de 390 se apretaban en
 * un tercio del ancho; ahora se reparten por todo, que es lo que los hace
 * legibles de un vistazo.
 */
function Semana({ dias }: { dias: DiaSemana[] }) {
  return (
    <ul className="row" style={{ ['--gap' as string]: 'var(--s-1)', justifyContent: 'space-between', margin: 0, padding: 0, listStyle: 'none' }}>
      {dias.map((d) => (
        <li key={d.fecha} className="stack" style={{ ['--gap' as string]: '6px', alignItems: 'center', flex: 1 }}>
          <span className="t-mono t-faint" style={{ fontSize: 9.5, letterSpacing: '.06em' }}>{d.letra}</span>
          <span
            aria-hidden
            style={{
              width: 10, height: 10, borderRadius: 'var(--radius-pill)',
              background: d.hecha ? 'var(--accent)' : 'transparent',
              boxShadow: d.hecha ? 'none' : `inset 0 0 0 1.5px ${d.esHoy ? 'var(--foreground)' : 'var(--border-strong)'}`,
            }}
          />
        </li>
      ))}
    </ul>
  );
}

/** Un dato de la fila de abajo: rótulo pequeño arriba, hecho debajo. */
function Dato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="stack" style={{ ['--gap' as string]: '3px', minWidth: 0, flex: 1 }}>
      <span className="t-label">{rotulo}</span>
      {children}
    </div>
  );
}

export function TuRitmo({ dias, racha, estaSemana, bono, hrefBono, hrefBonos }: {
  dias: DiaSemana[];
  racha: number;
  estaSemana: number;
  /** `null` = todavía no tiene ninguno activo. */
  bono: Bono | null;
  hrefBono: string;
  hrefBonos: string;
}) {
  const ilimitado = bono ? !Number.isFinite(bono.creditosTotales) : false;
  const quedan = bono && !ilimitado ? bono.creditosTotales - bono.creditosUsados : null;

  return (
    <section className="card card--pad-lg stack" style={{ ['--gap' as string]: 'var(--s-4)' }} aria-label="Tu ritmo">
      <div className="row row--between">
        <p className="t-label">Tu ritmo</p>
        {/* La racha solo aparece si existe: «🔥 0 sem.» no motiva a nadie. */}
        {racha > 0 && (
          <p className="t-mono t-dim no-shrink" style={{ fontSize: 11 }}>🔥 {racha} sem.</p>
        )}
      </div>

      <Semana dias={dias} />

      <span className="sr-only">
        {estaSemana} {estaSemana === 1 ? 'clase' : 'clases'} esta semana
        {racha > 0 ? `, ${racha} semanas seguidas` : ''}
      </span>

      <div aria-hidden style={{ height: 1, background: 'var(--border)' }} />

      <div className="row row--top" style={{ ['--gap' as string]: 'var(--s-4)' }}>
        <Dato rotulo="Esta semana">
          <p className="t-card-title t-num">{estaSemana} {estaSemana === 1 ? 'clase' : 'clases'}</p>
        </Dato>

        {bono ? (
          <Link href={hrefBono} className="stack" style={{ ['--gap' as string]: '3px', minWidth: 0, flex: 1 }}>
            <span className="t-label">Tu bono</span>
            <p className="t-card-title t-num">
              {ilimitado ? 'Sin límite' : <>{quedan} {quedan === 1 ? 'sesión' : 'sesiones'}</>}
            </p>
            <p className="t-meta trunc">{bono.nombre}</p>
            <div style={{ marginTop: 3 }}>
              {ilimitado
                ? <Barra hecho={1} total={1} tono="ok" />
                : <Barra hecho={bono.creditosUsados} total={bono.creditosTotales} />}
            </div>
          </Link>
        ) : (
          <Dato rotulo="Tu bono">
            <p className="t-card-title">Sin bono activo</p>
            <Link href={hrefBonos} className="t-meta tap" style={{ color: 'var(--accent)', fontWeight: 800 }}>Ver bonos →</Link>
          </Dato>
        )}
      </div>
    </section>
  );
}

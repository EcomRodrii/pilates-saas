'use client';

import Link from 'next/link';
import type { Bono } from '@/lib/student/tipos';
import type { DiaSemana } from '@/lib/student/ritmo';

// Sección «TU RITMO» del diseño nuevo: bono, semana y progreso.
//
// ⚠️ RECONSTRUIDO DESDE UNA CAPTURA DE MÓVIL, no desde un paquete. La
// composición, el orden y la jerarquía se leen bien en la imagen; los tamaños
// exactos son aproximaciones medidas a ojo sobre ella. Donde había duda se ha
// reutilizado el valor que ya usa el kit (`--radius-card`, `.card`, `.t-label`)
// en vez de inventar uno nuevo.
//
// ⚠️ NINGUNA CIFRA ESTÁ INVENTADA. Bono, días y racha salen de sus reservas
// reales (`lib/student/ritmo.ts`). La META semanal del diseño («meta 3/sem») no
// existe en el backend: nadie la fija en ninguna parte, así que la tarjeta de
// progreso NO se pinta con una meta a dedo — se pinta sin ella, contando lo que
// lleva. El día que exista una meta configurable, entra aquí.

/** Barra de progreso del kit, en la proporción que le pasen. */
function Barra({ hecho, total, tono = 'accent' }: { hecho: number; total: number; tono?: 'accent' | 'warning' }) {
  const pct = total > 0 ? Math.min(100, Math.round((hecho / total) * 100)) : 0;
  return (
    <div aria-hidden style={{ height: 6, borderRadius: 99, background: 'var(--muted)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: tono === 'warning' ? 'var(--warning)' : 'var(--accent)', transition: 'width .5s var(--ease)' }} />
    </div>
  );
}

/**
 * Bono, en la MISMA forma que «Mi progreso»: etiqueta, cifra grande, pie, barra.
 *
 * La primera versión ponía el nombre del bono y «quedan N» en una fila. En la
 * columna estrecha de la rejilla —la mitad de un móvil de 375— «Bono 4 clases»
 * se partía en dos líneas y empujaba al número: se veía roto. Aquí la cifra
 * manda, que además es lo que la alumna viene a mirar, y el nombre del bono va
 * debajo en pequeño, donde puede partirse sin estorbar.
 */
export function BonoRitmo({ bono, href }: { bono: Bono; href: string }) {
  const ilimitado = !Number.isFinite(bono.creditosTotales);
  const quedan = ilimitado ? null : bono.creditosTotales - bono.creditosUsados;
  return (
    <Link href={href} className="card card--tap" style={{ display: 'block', padding: '13px 15px' }}>
      <p className="t-label">Mi bono</p>
      <p style={{ margin: '7px 0 0', fontSize: 15, fontWeight: 800 }}>
        {ilimitado ? 'Ilimitado' : <>{quedan} {quedan === 1 ? 'sesión' : 'sesiones'}</>}
      </p>
      <p className="t-meta" style={{ margin: '1px 0 9px', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {bono.nombre}
      </p>
      {ilimitado
        ? <Barra hecho={1} total={1} />
        : <Barra hecho={bono.creditosUsados} total={bono.creditosTotales} />}
    </Link>
  );
}

/**
 * «Tu semana»: siete puntos, uno por día.
 *
 * Relleno = clase hecha. Anillo = hoy. El día de hoy sin clase se ve como
 * anillo vacío, que es lo que hace la captura.
 */
export function TuSemana({ dias, racha }: { dias: DiaSemana[]; racha: number }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 15px' }}>
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, flexShrink: 0 }}>Tu semana</p>

      <ul style={{ display: 'flex', gap: 9, margin: 0, padding: 0, listStyle: 'none', flex: 1, justifyContent: 'center' }}>
        {dias.map((d) => (
          <li key={d.fecha} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span className="t-mono" style={{ fontSize: 9, color: 'var(--subtle-foreground)' }}>{d.letra}</span>
            <span
              aria-hidden
              style={{
                width: 8, height: 8, borderRadius: 99,
                background: d.hecha ? 'var(--accent)' : 'transparent',
                boxShadow: d.hecha ? 'none' : `inset 0 0 0 1.5px ${d.esHoy ? 'var(--foreground)' : 'var(--border-strong)'}`,
              }}
            />
          </li>
        ))}
      </ul>

      {/* La racha solo aparece si existe: «🔥 0 sem.» no motiva a nadie. */}
      {racha > 0 && (
        <p className="t-mono" style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)', flexShrink: 0 }}>
          🔥 {racha} sem.
        </p>
      )}

      <span className="sr-only">
        {dias.filter((d) => d.hecha).length} clases esta semana
        {racha > 0 ? `, ${racha} semanas seguidas` : ''}
      </span>
    </div>
  );
}

/**
 * «Mi progreso» de la captura, SIN la meta.
 *
 * El diseño rotula «meta 3/sem» y muestra «1 de 3». Esa meta no existe en el
 * backend —ni tabla, ni campo, ni pantalla donde fijarla— así que ponerla a 3
 * sería inventarse el objetivo de otra persona y medirla contra él. Se enseña
 * lo que sí es cierto: cuántas lleva. La barra usa la mejor semana conocida
 * como referencia, que es un dato suyo, no una cifra puesta a dedo.
 */
export function MiProgreso({ estaSemana, referencia }: { estaSemana: number; referencia: number }) {
  return (
    <div className="card" style={{ padding: '13px 15px' }}>
      <p className="t-label">Mi progreso</p>
      <p style={{ margin: '7px 0 0', fontSize: 15, fontWeight: 800 }}>
        {estaSemana} {estaSemana === 1 ? 'clase' : 'clases'}
      </p>
      <p className="t-meta" style={{ margin: '1px 0 9px', fontSize: 11.5 }}>esta semana</p>
      <Barra hecho={estaSemana} total={Math.max(referencia, 1)} />
    </div>
  );
}

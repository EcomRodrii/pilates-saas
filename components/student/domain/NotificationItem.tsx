'use client';
import Link from 'next/link';
import type { Notificacion } from '@/lib/student/tipos';
import { relativo } from '@/lib/student/formato';
// El icono es lo único que distingue un aviso de otro: el disco no cambia de
// color, así que un emoji equivocado es TODA la señal equivocada.
const ICO: Record<Notificacion['tipo'], string> = { 'plaza-liberada': '🎉', recordatorio: '⏰', bono: '🎟', estudio: '📣', valorar: '⭐', atencion: '⚠️' };
export function NotificationItem({ n, delay = 0 }: { n: Notificacion; delay?: number }) {
  const inner = (
    <>
      <span aria-hidden style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 999, background: n.leida ? 'var(--muted)' : 'var(--accent-soft)', fontSize: 'var(--t-h3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ICO[n.tipo]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: n.leida ? 700 : 800, lineHeight: 1.35 }}>{n.titulo}</p>
        <p className="t-meta" style={{ marginTop: 2, lineHeight: 1.45 }}>{n.cuerpo}</p>
        {/* ⚠️ `--muted-foreground` y NO `--subtle-foreground`, por el mismo motivo
          que ya documenta el conmutador de Mis clases: el token sutil está
          calibrado contra el crema del fondo (4,55:1) y la tarjeta blanca
          (4,80), pero la fila SIN LEER se pinta sobre `--accent-soft`, que es
          más oscura — y encima cambia con la marca del estudio. Medido en las
          nueve marcas reales: entre **3,97 y 4,15:1**, nunca llega a AA.
          Y es el peor sitio para quedarse corta: 10 px, el texto más pequeño de
          la app, justo en la fila que sí va a leer. `--muted-foreground` da
          5,76–6,02 ahí y 6,96 sobre la tarjeta blanca de las ya leídas, así
          que vale para las dos y no hace falta cambiar de tinta según el
          estado. */}
        <p style={{ margin: '4px 0 0', fontSize: 'var(--t-micro)', fontWeight: 600, color: 'var(--muted-foreground)' }}>{relativo(n.fecha)}</p>
      </div>
      {/* `--accent` y no `--success`. `student.css` lo deja escrito junto a
          `.badge--curso`: `--success` es el de «Reservada ✓», y «dos estados
          distintos con el mismo color se leen como el mismo estado». Aquí el
          punto de «sin leer» era verde —el color de una reserva confirmada—
          mientras que la bandeja hermana, Mensajes, ya lo pintaba en acento. */}
      {!n.leida && <span aria-label="Sin leer" style={{ width: 8, height: 8, flexShrink: 0, borderRadius: 99, background: 'var(--accent)', marginTop: 6 }} />}
    </>
  );
  const st: React.CSSProperties = { display: 'flex', gap: 11, padding: '12px 14px', background: n.leida ? 'var(--card)' : 'var(--accent-soft)', border: '1px solid ' + (n.leida ? 'var(--border)' : 'color-mix(in srgb, var(--accent-soft-foreground) 15%, var(--accent-soft))'), borderRadius: 14, animationDelay: delay + 'ms' };
  return n.enlace ? <Link href={n.enlace} className="card--tap a-up" style={st}>{inner}</Link> : <div className="a-up" style={st}>{inner}</div>;
}

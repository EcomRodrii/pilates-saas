'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Clase, Instructora, Reserva } from '@/lib/student/tipos';
import type { LogroVista } from '@/lib/student/gamificacion';
import { getHistorial } from '@/lib/student/historial';
import { decimal, estadisticasRecientes, type ClaseDelHistorial } from '@/lib/student/estadisticas';
import { etiquetaDia } from '@/lib/student/formato';
import { yaTermino } from '@/lib/student/estado-clase';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { Icono } from '@/components/student/ui/Icono';
import { Foto } from '@/components/student/ui/Foto';
import { Sheet } from '@/components/student/ui/Sheet';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';

// Los tres bloques de abajo de Mi plan (maqueta de oct-2026): sus próximas clases, sus cifras y sus logros. Cada uno se
// calla si no tiene nada que decir; ninguno pide nada que el resto de la pantalla no tenga ya, salvo las cifras (su
// historial, que el catálogo no trae).

function Cabecera({ id, titulo, href, enlace }: { id: string; titulo: string; href?: string; enlace?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
      <h2 id={id} className="t-h2" style={{ margin: 0 }}>{titulo}</h2>
      {href && enlace && (
        <Link href={href} transitionTypes={TRANSICION_ADELANTE} className="tap enlace-ver">
          {enlace} <Icono nombre="flecha-derecha" tamano={16} />
        </Link>
      )}
    </div>
  );
}

/** Sus dos próximas clases confirmadas, con foto. «Ver todas» lleva a Actividad. */
export function ProximasClases({ reservas, clases, instructoras, hoy, href, hrefTodas }: {
  reservas: Reserva[]; clases: Clase[]; instructoras: Instructora[]; hoy: string;
  href: (ruta: string) => string; hrefTodas: string;
}) {
  const ahoraMs = useAhoraMs();
  const proximas = reservas
    .filter((r) => r.estado === 'confirmada')
    .map((r) => ({ r, c: clases.find((c) => c.id === r.claseId) }))
    .filter((x): x is { r: Reserva; c: Clase } => !!x.c && x.c.fecha >= hoy && !yaTermino(x.c, ahoraMs))
    .sort((a, b) => (a.c.fecha + a.c.hora).localeCompare(b.c.fecha + b.c.hora))
    .slice(0, 2);
  if (proximas.length === 0) return null;
  return (
    <section aria-labelledby="mp-proximas-t" data-testid="mi-plan-proximas" className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
      <Cabecera id="mp-proximas-t" titulo="Próximas clases" href={hrefTodas} enlace="Ver todas" />
      {proximas.map(({ r, c }) => {
        const inst = instructoras.find((i) => i.id === c.instructoraId);
        return (
          <Link key={r.id} href={href('/mis-reservas/' + r.id)} transitionTypes={TRANSICION_ADELANTE} className="card card--tap tap" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, color: 'var(--foreground)' }}>
            <span className="t-num" style={{ width: 52, flexShrink: 0, textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
              <span className="t-meta">{etiquetaDia(c.fecha, hoy)}</span>
              <span style={{ fontSize: 'var(--t-body)', fontWeight: 800 }}>{c.hora}</span>
            </span>
            <span aria-hidden style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'var(--muted)' }}>
              <Foto src={c.fotoUrl} ancho={56} alto={56} sizes="56px" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span className="t-card-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</span>
              {inst?.nombre && <span className="t-meta">Con {inst.nombre}</span>}
              <span className="t-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {c.sala && <Icono nombre="ubicacion" tamano={13} />}{[c.sala, `${c.duracionMin} min`].filter(Boolean).join(' · ')}
              </span>
            </span>
            <Icono nombre="chevron-derecha" tamano={18} />
          </Link>
        );
      })}
    </section>
  );
}

/**
 * «Mis estadísticas»: clases hechas, media por semana y asistencia de las últimas cuatro semanas, de su historial
 * (`estadisticas.ts`). Sin poder leerlo, no se pinta; sin nada marcado, lo dice en vez de enseñar ceros.
 */
export function MisEstadisticas({ studioId }: { studioId: string }) {
  const [historial, setHistorial] = useState<ClaseDelHistorial[] | null | undefined>(undefined);
  // El periodo, como el selector de la maqueta. Hasta 12 semanas: el historial trae sus 100 últimas clases, de sobra.
  const [semanas, setSemanas] = useState(4);
  const [eligiendo, setEligiendo] = useState(false);
  const ahoraMs = useAhoraMs();
  useEffect(() => {
    let vivo = true;
    void getHistorial(studioId).then((h) => { if (vivo) setHistorial(h); });
    return () => { vivo = false; };
  }, [studioId]);
  if (historial === null) return null;
  const e = historial && ahoraMs !== null ? estadisticasRecientes(historial, ahoraMs, semanas) : null;
  const vacio = e !== null && e.clases === 0 && e.asistencia === null;
  return (
    <section id="estadisticas" aria-labelledby="mp-estadisticas-t" data-testid="mi-plan-estadisticas" className="stack" style={{ ['--gap' as string]: 'var(--s-2)', scrollMarginTop: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <h2 id="mp-estadisticas-t" className="t-h2" style={{ margin: 0 }}>Mis estadísticas</h2>
        {/* Un botón con su hoja y no un <select>: con letra de menos de 16 px, iOS hace zoom al tocar un select. */}
        <button type="button" className="tap selector-periodo" onClick={() => setEligiendo(true)} aria-haspopup="dialog">
          Últimas {semanas} semanas <Icono nombre="chevron-derecha" tamano={14} style={{ transform: 'rotate(90deg)' }} aria-hidden />
        </button>
      </div>
      {vacio ? (
        <p className="card card--pad t-meta" style={{ margin: 0 }}>Aún no hay clases marcadas como hechas en estas semanas.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }} aria-busy={e === null || undefined}>
          <Cifra icono={<Icono nombre="actividad" tamano={24} />} valor={e ? String(e.clases) : null} rotulo={e?.clases === 1 ? 'Clase' : 'Clases'} />
          <Cifra icono={<Icono nombre="calendario" tamano={24} />} valor={e ? decimal(e.semanaMedia) : null} rotulo="Semana media" />
          <Cifra icono={<Anillo pct={e?.asistencia ?? 0} />} valor={e ? (e.asistencia === null ? '—' : `${e.asistencia} %`) : null} rotulo="Asistencia" />
        </div>
      )}
      <Sheet open={eligiendo} onClose={() => setEligiendo(false)} label="Periodo de las estadísticas">
        <h3 className="t-h2">Periodo</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {[4, 8, 12].map((n) => (
            <button key={n} type="button" className="pill" aria-pressed={semanas === n} onClick={() => { setSemanas(n); setEligiendo(false); }}>
              Últimas {n} semanas
            </button>
          ))}
        </div>
      </Sheet>
    </section>
  );
}

/** El anillo de la asistencia: el mismo dato que la cifra, dibujado. */
function Anillo({ pct }: { pct: number }) {
  const R = 10;
  const C = 2 * Math.PI * R;
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <circle cx="13" cy="13" r={R} fill="none" stroke="var(--muted)" strokeWidth="3.5" />
      <circle cx="13" cy="13" r={R} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(C * Math.min(100, pct)) / 100} ${C}`} transform="rotate(-90 13 13)" />
    </svg>
  );
}

function Cifra({ icono, valor, rotulo }: { icono: ReactNode; valor: string | null; rotulo: string }) {
  return (
    <div className="card" style={{ padding: '16px 8px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
      <span aria-hidden style={{ color: 'var(--accent)', display: 'flex', height: 26, alignItems: 'center' }}>{icono}</span>
      {valor === null
        ? <span aria-hidden className="skel" style={{ width: 34, height: 26, borderRadius: 8 }} />
        : <span className="t-num" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1 }}>{valor}</span>}
      <span className="t-meta" style={{ whiteSpace: 'nowrap', fontSize: 'min(var(--t-meta), 12.5px)' }}>{rotulo}</span>
    </div>
  );
}

/**
 * «Mis logros», tres insignias: las conseguidas más recientes y, si faltan, las que lleva más avanzadas.
 *
 * ⚠️ HUECO. Logros, insignias y sus iconos los diseña otra sesión (FIDELIDAD, 19-oct-2026); esto pinta los datos que
 * YA existen (`logrosDe`, el mismo cálculo que `/logros`) y su componente lo sustituirá. Sin el emoji del estudio.
 */
export function MisLogros({ logros, hrefTodos }: { logros: LogroVista[]; hrefTodos: string }) {
  if (logros.length === 0) return null;
  const hechos = logros.filter((l) => l.completado).sort((a, b) => (b.completadoEn ?? '').localeCompare(a.completadoEn ?? ''));
  const enCurso = logros.filter((l) => !l.completado).sort((a, b) => (b.umbral > 0 ? b.progresoActual / b.umbral : 0) - (a.umbral > 0 ? a.progresoActual / a.umbral : 0));
  const tres = [...hechos, ...enCurso].slice(0, 3);
  return (
    <section aria-labelledby="mp-logros-t" data-testid="mi-plan-logros" className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
      <Cabecera id="mp-logros-t" titulo="Mis logros" href={hrefTodos} enlace="Ver todos" />
      <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
        {tres.map((l) => (
          <li key={l.id} className={'insignia-maqueta' + (l.completado ? ' insignia-maqueta--hecha' : '')}>
            <span aria-hidden className="disco-cifra" style={{ background: 'var(--card)' }}>
              <Icono nombre="trofeo" tamano={22} />
            </span>
            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 800, lineHeight: 1.2 }}>{l.nombre}</span>
            <span style={{ fontSize: 'var(--t-micro)', color: l.completado ? 'var(--accent)' : 'var(--muted-foreground)', fontWeight: 700 }}>
              {l.completado ? 'Completado' : 'En progreso'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

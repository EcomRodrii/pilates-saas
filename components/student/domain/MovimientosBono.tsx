'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useAsync } from '@/lib/student/useAsync';
import { getDetalleBonos, type MovimientosVista } from '@/lib/student/mis-bonos';
import { textoMovimiento, type MovimientoBonoVista } from '@/lib/student/movimientos-bono';
import { fechaCorta } from '@/lib/student/formato';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { Skeleton } from '@/components/student/ui/States';

// Los movimientos de un bono (P4-D, 5-oct-2026): cada sesión que entra y cada una que sale, del ledger de derechos
// (`POST /api/public/mis-bonos`). Compacta en Bonos (las 4 últimas y «Ver todo») y entera en el detalle («Ver más»).
//
// ⚠️ Con error o sin conexión NO hay frase de vacío: «Aún no hay movimientos» por un fallo de red sería mentira.
// ⚠️ El ledger empezó el 2-oct-2026: lo de antes llega como una sola fila de apertura («El 2 oct tenías N»), y si el
// historial no empieza en la compra se dice desde cuándo se apunta.
export function MovimientosBono({ slug, bonoId, compacta, hrefTodo }: {
  slug: string;
  bonoId: string;
  compacta: boolean;
  /** «Ver todo» (solo en compacta): el detalle del bono. */
  hrefTodo?: string;
}) {
  const limite = compacta ? 4 : 30;
  const cargar = useCallback(() => getDetalleBonos(slug, { bono: bonoId, limite }), [slug, bonoId, limite]);
  const { data, estado, reintentar } = useAsync(cargar, (d) => !d.movimientos || d.movimientos.movimientos.length === 0, `alumna:${slug}:bono-movimientos:${bonoId}:${limite}`);
  const ahoraMs = useAhoraMs();
  const [mas, setMas] = useState<MovimientoBonoVista[]>([]);
  const [hayMasExtra, setHayMasExtra] = useState<boolean | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [errorMas, setErrorMas] = useState(false);

  const m: MovimientosVista | null = data?.movimientos ?? null;
  const todos = [...(m?.movimientos ?? []), ...mas];
  const hayMas = hayMasExtra ?? m?.hayMas ?? false;

  const verMas = async () => {
    const ultimo = todos[todos.length - 1];
    if (!ultimo) return;
    setCargandoMas(true);
    setErrorMas(false);
    try {
      const r = await getDetalleBonos(slug, { bono: bonoId, limite, antes: { creadoEn: ultimo.fecha, id: ultimo.id } });
      setMas((prev) => [...prev, ...(r.movimientos?.movimientos ?? [])]);
      setHayMasExtra(r.movimientos?.hayMas ?? false);
    } catch {
      setErrorMas(true);
    } finally {
      setCargandoMas(false);
    }
  };

  const visibles = compacta ? todos.slice(0, 4) : todos;
  return (
    <section data-testid="movimientos-bono" aria-label="Movimientos del bono">
      <div className="row row--between" style={{ marginBottom: 7 }}>
        <p className="t-label" style={{ margin: 0 }}>Movimientos</p>
        {compacta && hrefTodo && estado === 'ready' && todos.length > 0 && (
          <Link href={hrefTodo} className="tap t-meta" style={{ fontWeight: 800, color: 'var(--accent)' }}>Ver todo</Link>
        )}
      </div>
      <div className="card" style={{ padding: '4px 15px' }}>
        {estado === 'loading' && <div style={{ padding: '10px 0' }}><Skeleton h={14} w="70%" /><div style={{ height: 10 }} /><Skeleton h={14} w="55%" /></div>}
        {estado === 'error' && (
          <div className="row row--between" style={{ padding: '12px 0' }}>
            <p className="t-small" data-testid="movimientos-error">No hemos podido cargar los movimientos.</p>
            <button type="button" className="btn btn--secondary btn--sm" onClick={reintentar}>Reintentar</button>
          </div>
        )}
        {estado === 'offline' && !data && <p className="t-small" style={{ padding: '12px 0' }}>Sin conexión. Los movimientos se cargan al volver la red.</p>}
        {estado === 'empty' && <p className="t-small t-dim" style={{ padding: '12px 0' }} data-testid="movimientos-vacio">Aún no hay movimientos apuntados de este bono.</p>}
        {estado === 'ready' && visibles.map((mv, i) => {
          const t = textoMovimiento(mv, ahoraMs);
          return (
            <div key={mv.id} data-testid="movimiento" className="row" style={{ ['--gap' as string]: '12px', padding: '10px 0', borderTop: i > 0 ? '1px solid var(--muted)' : 'none' }}>
              <span className="t-num" style={{ width: 34, flexShrink: 0, fontWeight: 800, color: mv.delta > 0 ? 'var(--accent)' : 'var(--foreground)' }}>{t.cifra}</span>
              <span className="stack" style={{ ['--gap' as string]: '1px', minWidth: 0 }}>
                <span className="t-small" style={{ fontWeight: 700 }}>{t.titulo}</span>
                {t.detalle && <span className="t-meta">{t.detalle}</span>}
              </span>
            </div>
          );
        })}
      </div>
      {estado === 'ready' && m && !m.cuadra && (
        <p className="t-meta" style={{ marginTop: 6 }} data-testid="movimientos-no-cuadra">Hay movimientos sin detalle. Tu saldo real es el de arriba.</p>
      )}
      {estado === 'ready' && m && !m.historialCompleto && m.desde && (
        <p className="t-meta" style={{ marginTop: 6 }}>Apuntamos cada movimiento desde el {fechaCorta(m.desde.slice(0, 10))}.</p>
      )}
      {!compacta && estado === 'ready' && hayMas && (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          {errorMas && <p className="t-meta" role="status">No hemos podido cargar más. Inténtalo de nuevo.</p>}
          <button type="button" className="btn btn--secondary btn--sm" disabled={cargandoMas} onClick={() => void verMas()}>
            {cargandoMas ? 'Cargando…' : 'Ver más'}
          </button>
        </div>
      )}
    </section>
  );
}

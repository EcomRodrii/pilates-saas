'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { fetchEstudios, type EstudioFila } from '@/lib/interno/client';

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function EstudiosInterno() {
  const [filas, setFilas] = useState<EstudioFila[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (busqueda: string) => {
    try { setFilas((await fetchEstudios(busqueda)).estudios); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(q); }, [cargar, q]);

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;

  const conActividad = (filas ?? []).filter(f => !f.vacio);
  const vacios = (filas ?? []).filter(f => f.vacio);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Buscar por nombre, slug o email…"
          className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[13.5px] outline-none focus:border-brand"
        />
      </div>

      {!filas ? <p className="text-[13.5px] text-muted-foreground">Cargando…</p> : (
        <>
          <Tabla titulo="Con actividad" filas={conActividad} />
          {/* Separados a propósito: mezclar 12 altas de prueba vacías con los
              clientes reales hace que la lista mienta sobre su tamaño. */}
          {vacios.length > 0 && (
            <Tabla
              titulo={`Altas sin usar (${vacios.length})`}
              pie="Ni una socia ni una clase. Casi siempre son pruebas propias."
              filas={vacios} apagado />
          )}
        </>
      )}
    </div>
  );
}

function Tabla({ titulo, filas, pie, apagado }: {
  titulo: string; filas: EstudioFila[]; pie?: string; apagado?: boolean;
}) {
  if (filas.length === 0) {
    return (
      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2">{titulo}</h2>
        <p className="text-[13px] text-muted-foreground">Ninguno.</p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2">{titulo}</h2>
      {pie && <p className="text-[12px] text-muted-foreground mb-2 -mt-1">{pie}</p>}
      <div className={`rounded-2xl border border-border bg-card overflow-hidden ${apagado ? 'opacity-70' : ''}`}>
        <div className="hidden sm:grid grid-cols-[2fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-border text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <span>Estudio</span><span className="text-right">Socias</span><span className="text-right">Clases</span>
          <span className="text-right">Equipo</span><span className="text-right">Alta</span>
        </div>
        {filas.map(f => (
          <Link key={f.id} href={`/interno/estudios/${f.id}`}
            className="grid sm:grid-cols-[2fr_auto_auto_auto_auto] gap-x-4 gap-y-1 px-4 py-3 border-b border-border/60 last:border-0 hover:bg-muted/40 transition-colors">
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-foreground truncate">{f.nombre}</span>
              <span className="block text-[11.5px] text-muted-foreground truncate">
                /{f.slug} · {f.plan}
                {f.tieneClienteStripe && <span className="text-emerald-600 font-semibold"> · Stripe</span>}
              </span>
            </span>
            <span className="text-[13px] tabular-nums text-right text-foreground">{f.socias}</span>
            <span className="text-[13px] tabular-nums text-right text-foreground">{f.clases}</span>
            <span className="text-[13px] tabular-nums text-right text-foreground">{f.equipo}</span>
            <span className="text-[12px] tabular-nums text-right text-muted-foreground">{fecha(f.creadoEn)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

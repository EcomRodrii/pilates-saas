'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NW_TINTA, NW_GRIS_VERDOSO, NW_PRODUCTO } from './tokens';

const POPULARES = [
  { label: 'Reformer', especialidad: 'reformer' },
  { label: 'Prenatal', especialidad: null },
  { label: 'Sustituciones', especialidad: null, disponibilidad: 'disponible_sustituciones' },
] as const;

// Buscador del hero (1a) — dos campos (qué/dónde) en una card blanca, navega
// a /network/instructoras con la query ya resuelta: el marketplace lee sus
// filtros de la URL (lib/network/publico.ts:filtroDesdeSearchParams), así
// que este buscador no necesita su propio estado de resultados, solo
// construir la URL correcta.
export function BuscadorHero() {
  const uid = useId();
  const router = useRouter();
  const [especialidad, setEspecialidad] = useState('');
  const [ciudad, setCiudad] = useState('');

  function buscar(e?: React.FormEvent, overrides?: { especialidad?: string; disponibilidad?: string }) {
    e?.preventDefault();
    const sp = new URLSearchParams();
    const esp = overrides?.especialidad ?? especialidad;
    if (esp) sp.set('especialidades', esp);
    if (ciudad.trim()) sp.set('ciudad', ciudad.trim());
    if (overrides?.disponibilidad) sp.set('disponibilidad', overrides.disponibilidad);
    router.push(`/network/instructoras${sp.toString() ? `?${sp}` : ''}`);
  }

  return (
    <div>
      <form onSubmit={buscar} className="bg-white rounded-[20px] p-2.5 flex flex-col sm:flex-row" style={{ boxShadow: '0 24px 48px -28px rgba(34,42,51,.22)' }}>
        <label className="flex-1 px-4 py-2.5">
          <span className="block text-[11px] font-bold uppercase tracking-wide" style={{ color: NW_GRIS_VERDOSO }}>¿Qué buscas?</span>
          <input
            id={`${uid}-que`}
            value={especialidad}
            onChange={e => setEspecialidad(e.target.value)}
            placeholder="Reformer"
            className="w-full mt-0.5 text-[15px] font-semibold bg-transparent outline-none"
            style={{ color: NW_TINTA }}
          />
        </label>
        <div className="hidden sm:block w-px my-2" style={{ background: '#E5E3DA' }} />
        <label className="flex-1 px-4 py-2.5">
          <span className="block text-[11px] font-bold uppercase tracking-wide" style={{ color: NW_GRIS_VERDOSO }}>¿Dónde?</span>
          <input
            id={`${uid}-donde`}
            value={ciudad}
            onChange={e => setCiudad(e.target.value)}
            placeholder="Barcelona"
            className="w-full mt-0.5 text-[15px] font-semibold bg-transparent outline-none"
            style={{ color: NW_TINTA }}
          />
        </label>
        <button
          type="submit"
          className="shrink-0 m-1 px-6 py-3.5 rounded-2xl text-[14px] font-bold text-white transition-all hover:brightness-110"
          style={{ background: NW_PRODUCTO }}
        >
          Buscar instructoras
        </button>
      </form>
      <p className="mt-3 text-[13px]" style={{ color: NW_GRIS_VERDOSO }}>
        Populares:{' '}
        {POPULARES.map((p, i) => (
          <span key={p.label}>
            <button
              type="button"
              onClick={() => buscar(undefined, { especialidad: p.especialidad ?? undefined, disponibilidad: 'disponibilidad' in p ? p.disponibilidad : undefined })}
              className="font-semibold hover:underline"
              style={{ color: NW_TINTA }}
            >
              {p.label}
            </button>
            {i < POPULARES.length - 1 ? ' · ' : ''}
          </span>
        ))}
      </p>
    </div>
  );
}

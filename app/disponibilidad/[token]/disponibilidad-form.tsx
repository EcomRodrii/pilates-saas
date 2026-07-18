'use client';

import { useState } from 'react';
import { DIAS, FRANJAS, celdaKey, type FranjaKey } from '@/lib/sustituciones/franjas';

// Rejilla de disponibilidad para la instructora: día × franja, a base de toques.
// Objetivo de las entrevistas: 5 segundos, móvil, sin login. Un tap marca/desmarca.

export function DisponibilidadForm({
  token,
  instructorNombre,
  estudioNombre,
  celdasIniciales,
}: {
  token: string;
  instructorNombre: string;
  estudioNombre: string;
  celdasIniciales: string[];
}) {
  const [activas, setActivas] = useState<Set<string>>(() => new Set(celdasIniciales));
  const [estado, setEstado] = useState<'idle' | 'guardando' | 'ok' | 'error'>('idle');

  function toggle(dow: number, franja: FranjaKey) {
    const clave = celdaKey(dow, franja);
    setActivas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
    setEstado('idle');
  }

  async function guardar() {
    setEstado('guardando');
    try {
      const res = await fetch('/api/public/disponibilidad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, celdas: Array.from(activas) }),
      });
      setEstado(res.ok ? 'ok' : 'error');
    } catch {
      setEstado('error');
    }
  }

  if (estado === 'ok') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm w-full rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="text-4xl mb-3">✅</div>
          <h1 className="text-lg font-semibold text-slate-900">¡Guardado!</h1>
          <p className="mt-2 text-sm text-slate-500">
            Tu estudio ya sabe cuándo puedes cubrir clases. Puedes cerrar esta página o
            <button onClick={() => setEstado('idle')} className="ml-1 text-brand underline">
              volver a editar
            </button>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-md">
        <header className="mb-5 pt-2">
          <h1 className="text-xl font-semibold text-slate-900">Hola, {instructorNombre}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {estudioNombre ? `${estudioNombre}. ` : ''}Marca cuándo puedes cubrir clases. Un toque
            por franja — sin más.
          </p>
        </header>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="grid grid-cols-[auto_repeat(3,1fr)] items-stretch">
            {/* cabecera de franjas */}
            <div className="border-b border-slate-100" />
            {FRANJAS.map((f) => (
              <div key={f.key} className="border-b border-slate-100 px-2 py-3 text-center">
                <div className="text-sm font-medium text-slate-700">{f.label}</div>
                <div className="text-[11px] text-slate-400">{f.horaInicio}–{f.horaFin}</div>
              </div>
            ))}

            {/* filas por día */}
            {DIAS.map((d) => (
              <FilaDia key={d.dow} dow={d.dow} label={d.label} activas={activas} onToggle={toggle} />
            ))}
          </div>
        </div>

        <div className="mt-5">
          <button
            onClick={guardar}
            disabled={estado === 'guardando'}
            className="w-full rounded-xl bg-brand py-3.5 text-center text-base font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
          >
            {estado === 'guardando' ? 'Guardando…' : 'Guardar disponibilidad'}
          </button>
          {estado === 'error' && (
            <p className="mt-2 text-center text-sm text-rose-600">
              No se pudo guardar. Revisa tu conexión e inténtalo otra vez.
            </p>
          )}
          <p className="mt-3 text-center text-xs text-slate-400">
            {activas.size === 0
              ? 'Ahora mismo no tienes ninguna franja marcada.'
              : `${activas.size} ${activas.size === 1 ? 'franja marcada' : 'franjas marcadas'}.`}
          </p>
        </div>
      </div>
    </main>
  );
}

function FilaDia({
  dow,
  label,
  activas,
  onToggle,
}: {
  dow: number;
  label: string;
  activas: Set<string>;
  onToggle: (dow: number, franja: FranjaKey) => void;
}) {
  return (
    <>
      <div className="flex items-center border-t border-slate-100 px-3 text-sm font-medium text-slate-600">
        {label}
      </div>
      {FRANJAS.map((f) => {
        const on = activas.has(celdaKey(dow, f.key));
        return (
          <button
            key={f.key}
            onClick={() => onToggle(dow, f.key)}
            aria-pressed={on}
            className={`m-1 flex h-12 items-center justify-center rounded-lg border text-sm font-medium transition ${
              on
                ? 'border-brand bg-brand text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-300 hover:border-slate-300'
            }`}
          >
            {on ? '✓' : ''}
          </button>
        );
      })}
    </>
  );
}

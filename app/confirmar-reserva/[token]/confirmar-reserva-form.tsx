'use client';

import { useState } from 'react';

// Confirmar que viene a su clase, sin login. Un solo botón a propósito: la
// validación de las entrevistas del resto del módulo de riesgo manda que sea
// un toque, no un formulario — pedir más solo consigue que no lo haga.
type Estado = 'idle' | 'enviando' | 'confirmada' | 'liberada' | 'error';

export function ConfirmarReservaForm({
  token, socioNombre, estudioNombre, claseNombre, cuando, yaConfirmado,
}: {
  token: string;
  socioNombre: string;
  estudioNombre: string;
  claseNombre: string;
  cuando: string;
  yaConfirmado: boolean;
}) {
  const [estado, setEstado] = useState<Estado>(yaConfirmado ? 'confirmada' : 'idle');

  async function confirmar() {
    setEstado('enviando');
    try {
      const res = await fetch('/api/public/confirmacion-reserva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; yaResuelta?: boolean };
      if (!res.ok) { setEstado('error'); return; }
      // Puede pasar que el corte la liberara justo antes de que confirmara —
      // se le dice la verdad, no se finge que sirvió de algo.
      setEstado(data.yaResuelta ? 'liberada' : 'confirmada');
    } catch {
      setEstado('error');
    }
  }

  if (estado === 'confirmada') {
    return (
      <Pantalla icono="✅" titulo="¡Confirmado!">
        <p className="mt-2 text-sm text-slate-500">
          {estudioNombre ? `${estudioNombre} ya sabe` : 'Ya sabemos'} que vienes a <span className="font-medium text-slate-700">{claseNombre}</span>
          {cuando ? ` (${cuando})` : ''}. Nos vemos allí.
        </p>
      </Pantalla>
    );
  }

  if (estado === 'liberada') {
    return (
      <Pantalla icono="🗓️" titulo="Tu plaza ya se liberó">
        <p className="mt-2 text-sm text-slate-500">
          No llegamos a tiempo con tu confirmación y ya se la ofrecimos a otra persona. Si quieres, reserva otra clase desde el portal de tu estudio.
        </p>
      </Pantalla>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-sm pt-12">
        <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            {socioNombre ? `Hola, ${socioNombre}` : 'Hola'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">¿Sigues viniendo a tu clase?</p>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-base font-semibold text-slate-900">{claseNombre}</p>
            <p className="mt-0.5 text-sm text-slate-500">{cuando}</p>
          </div>

          <button
            onClick={confirmar}
            disabled={estado === 'enviando'}
            className="mt-5 w-full rounded-xl bg-brand py-3.5 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
          >
            {estado === 'enviando' ? 'Confirmando…' : 'Sí, voy a venir'}
          </button>
          {estado === 'error' && (
            <p className="mt-2 text-sm text-rose-600">No se pudo confirmar. Revisa tu conexión e inténtalo otra vez.</p>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Si no confirmas, liberaremos tu plaza para que otra persona pueda venir.
          </p>
        </div>
      </div>
    </main>
  );
}

function Pantalla({ icono, titulo, children }: { icono: string; titulo: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm w-full rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="text-4xl mb-3">{icono}</div>
        <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
        {children}
      </div>
    </main>
  );
}

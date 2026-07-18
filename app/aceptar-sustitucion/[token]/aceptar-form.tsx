'use client';

import { useState } from 'react';

// Un tap: ACEPTO / No puedo. La confirmación de verdad (compare-and-set) ocurre
// en el servidor; aquí solo se dispara con el token del deep link.
type Resultado = 'idle' | 'enviando' | 'aceptada' | 'rechazada' | 'ya_cubierta' | 'error';

export function AceptarForm({
  token, instructorNombre, estudioNombre, claseNombre, cuando,
}: {
  token: string;
  instructorNombre: string;
  estudioNombre: string;
  claseNombre: string;
  cuando: string;
}) {
  const [estado, setEstado] = useState<Resultado>('idle');

  async function responder(accion: 'aceptar' | 'rechazar') {
    setEstado('enviando');
    try {
      const res = await fetch('/api/public/aceptar-sustitucion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, accion }),
      });
      if (res.status === 409) { setEstado('ya_cubierta'); return; }
      if (!res.ok) { setEstado('error'); return; }
      setEstado(accion === 'aceptar' ? 'aceptada' : 'rechazada');
    } catch {
      setEstado('error');
    }
  }

  if (estado === 'aceptada' || estado === 'rechazada' || estado === 'ya_cubierta') {
    const conf = {
      aceptada: { icono: '🎉', titulo: '¡Confirmado!', texto: `Gracias, ${instructorNombre}. Ya estás asignada a ${claseNombre}. ${estudioNombre} lo sabe.` },
      rechazada: { icono: '👍', titulo: 'Entendido', texto: 'Buscaremos a otra persona. ¡Gracias por responder tan rápido!' },
      ya_cubierta: { icono: '✅', titulo: 'Ya está cubierta', texto: 'Otra persona la cogió antes. ¡Gracias igualmente!' },
    }[estado];
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm w-full rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="text-5xl mb-3">{conf.icono}</div>
          <h1 className="text-xl font-semibold text-slate-900">{conf.titulo}</h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">{conf.texto}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm w-full rounded-2xl bg-white p-7 shadow-sm">
        <p className="text-[15px] text-slate-500">Hola {instructorNombre},</p>
        <h1 className="text-xl font-bold text-slate-900 mt-1 leading-snug">¿Puedes cubrir esta clase?</h1>
        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-4">
          <p className="text-[17px] font-bold text-slate-900">{claseNombre}</p>
          <p className="text-[15px] text-slate-500 mt-0.5">{cuando}</p>
          {estudioNombre && <p className="text-[13px] text-slate-400 mt-1">{estudioNombre}</p>}
        </div>
        <button
          onClick={() => responder('aceptar')} disabled={estado === 'enviando'}
          className="mt-5 w-full rounded-xl bg-brand py-3.5 text-center text-base font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
        >
          {estado === 'enviando' ? 'Un momento…' : '✓ Acepto, la cubro'}
        </button>
        <button
          onClick={() => responder('rechazar')} disabled={estado === 'enviando'}
          className="mt-2.5 w-full rounded-xl bg-white py-3 text-center text-[15px] font-semibold text-slate-600 border border-slate-200 transition disabled:opacity-60"
        >
          No puedo esta vez
        </button>
        {estado === 'error' && <p className="mt-3 text-center text-sm text-rose-600">No se pudo enviar. Inténtalo otra vez.</p>}
      </div>
    </main>
  );
}

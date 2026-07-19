'use client';

import { useState } from 'react';

// La alumna valora la clase que ha recibido: 1-5 estrellas + comentario opcional.
// Un tap, sin login. El servidor valida el token del deep link e inserta la
// valoración (idempotente por alumna+clase).
type Estado = 'idle' | 'enviando' | 'enviada' | 'error';

export function ValorarForm({
  token, instructorNombre, estudioNombre, claseNombre, cuando, yaValorada,
}: {
  token: string;
  instructorNombre: string;
  estudioNombre: string;
  claseNombre: string;
  cuando: string;
  yaValorada: boolean;
}) {
  const [estado, setEstado] = useState<Estado>(yaValorada ? 'enviada' : 'idle');
  const [puntuacion, setPuntuacion] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState('');

  async function enviar() {
    if (puntuacion < 1) return;
    setEstado('enviando');
    try {
      const res = await fetch('/api/public/valorar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, puntuacion, comentario: comentario.trim() || null }),
      });
      setEstado(res.ok ? 'enviada' : 'error');
    } catch {
      setEstado('error');
    }
  }

  if (estado === 'enviada') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm w-full rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="text-5xl mb-3">🙌</div>
          <h1 className="text-xl font-semibold text-slate-900">¡Gracias por tu valoración!</h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            {yaValorada && puntuacion === 0
              ? 'Ya habías valorado esta clase. ¡Gracias!'
              : `Le viene genial a ${estudioNombre || 'tu estudio'} para cuidar sus clases.`}
          </p>
        </div>
      </main>
    );
  }

  const nivel = hover || puntuacion;
  const etiqueta = ['', 'Mejorable', 'Regular', 'Bien', 'Muy bien', '¡Increíble!'][nivel] ?? '';

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm w-full rounded-2xl bg-white p-7 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900 leading-snug">
          ¿Qué tal la clase{instructorNombre ? <> con <span className="text-brand">{instructorNombre}</span></> : null}?
        </h1>
        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-4">
          <p className="text-[17px] font-bold text-slate-900">{claseNombre}</p>
          <p className="text-[15px] text-slate-500 mt-0.5">{cuando}</p>
          {estudioNombre && <p className="text-[13px] text-slate-400 mt-1">{estudioNombre}</p>}
        </div>

        {/* Estrellas */}
        <div className="mt-6 flex flex-col items-center">
          <div className="flex gap-1.5" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n} type="button" aria-label={`${n} estrellas`}
                onClick={() => setPuntuacion(n)} onMouseEnter={() => setHover(n)}
                className="p-1 transition active:scale-95"
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill={n <= nivel ? '#F5B301' : 'none'} stroke={n <= nivel ? '#F5B301' : '#CBD5E1'} strokeWidth="1.6" strokeLinejoin="round">
                  <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
                </svg>
              </button>
            ))}
          </div>
          <p className="mt-2 h-5 text-sm font-semibold text-slate-500">{etiqueta}</p>
        </div>

        {/* Comentario opcional */}
        <textarea
          value={comentario} onChange={e => setComentario(e.target.value)}
          placeholder="¿Algo que quieras contar? (opcional)" rows={3} maxLength={500}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 transition resize-none"
        />

        <button
          onClick={enviar} disabled={puntuacion < 1 || estado === 'enviando'}
          className="mt-4 w-full rounded-xl bg-brand py-3.5 text-center text-base font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-40"
        >
          {estado === 'enviando' ? 'Enviando…' : 'Enviar valoración'}
        </button>
        {estado === 'error' && <p className="mt-3 text-center text-sm text-rose-600">No se pudo enviar. Inténtalo otra vez.</p>}
      </div>
    </main>
  );
}

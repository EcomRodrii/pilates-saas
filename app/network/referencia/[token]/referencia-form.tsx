'use client';

import { useState } from 'react';
import { PartyPopper, ThumbsUp, CalendarX } from 'lucide-react';
import { IconoDesenlace } from '@/components/publico/icono-desenlace';

// Un formulario mínimo: confirmar/rechazar, con relación y comentario
// opcionales. La confirmación de verdad (token de un solo uso, compare-and-
// set) ocurre en el servidor — aquí solo se recoge la respuesta.
type Resultado = 'idle' | 'enviando' | 'confirmada' | 'rechazada' | 'ya_resuelta' | 'caducada' | 'error';

export function ReferenciaForm({
  token, nombreReferente, profesionalNombre, relacion,
}: {
  token: string;
  nombreReferente: string;
  profesionalNombre: string;
  relacion: string | null;
}) {
  const [estado, setEstado] = useState<Resultado>('idle');
  const [relacionInput, setRelacionInput] = useState(relacion ?? '');
  const [comentario, setComentario] = useState('');

  async function responder(accion: 'confirmar' | 'rechazar') {
    setEstado('enviando');
    try {
      const res = await fetch('/api/public/network/referencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, accion,
          relacion: relacionInput.trim() || undefined,
          comentario: comentario.trim() || undefined,
        }),
      });
      if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as { motivo?: string };
        setEstado(data.motivo === 'caducada' ? 'caducada' : 'ya_resuelta');
        return;
      }
      if (!res.ok) { setEstado('error'); return; }
      setEstado(accion === 'confirmar' ? 'confirmada' : 'rechazada');
    } catch {
      setEstado('error');
    }
  }

  if (estado === 'confirmada' || estado === 'rechazada' || estado === 'ya_resuelta' || estado === 'caducada') {
    const conf = {
      confirmada: { icono: PartyPopper, tono: 'exito' as const, titulo: '¡Gracias!', texto: `Tu confirmación ayuda a ${profesionalNombre} en Tentare Network.` },
      rechazada: { icono: ThumbsUp, tono: 'neutro' as const, titulo: 'Entendido', texto: 'Gracias por responder — no se mostrará esta referencia.' },
      ya_resuelta: { icono: ThumbsUp, tono: 'neutro' as const, titulo: 'Ya respondiste', texto: 'Esta solicitud ya quedó resuelta.' },
      caducada: { icono: CalendarX, tono: 'neutro' as const, titulo: 'Este enlace ha caducado', texto: 'Pide a la profesional que te lo envíe de nuevo si sigue interesándole.' },
    }[estado];
    return (
      <main className="min-h-dvh flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm w-full rounded-2xl bg-white p-8 text-center shadow-sm">
          <IconoDesenlace icono={conf.icono} tono={conf.tono} />
          <h1 className="text-xl font-semibold text-slate-900">{conf.titulo}</h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">{conf.texto}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm w-full rounded-2xl bg-white p-7 shadow-sm">
        <p className="text-[15px] text-slate-500">Hola {nombreReferente},</p>
        <h1 className="text-xl font-bold text-slate-900 mt-1 leading-snug">
          ¿Confirmas que conoces a {profesionalNombre}?
        </h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          Te ha puesto como referencia profesional en Tentare Network. No hace falta crear ninguna cuenta.
        </p>

        <div className="mt-4">
          <label className="block text-[12px] font-medium text-slate-600 mb-1" htmlFor="relacion">Cómo la conoces (opcional)</label>
          <input
            id="relacion" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none focus:border-slate-400"
            value={relacionInput} onChange={e => setRelacionInput(e.target.value)}
            placeholder="P. ej. fui su responsable de estudio"
          />
        </div>
        <div className="mt-3">
          <label className="block text-[12px] font-medium text-slate-600 mb-1" htmlFor="comentario">Comentario (opcional)</label>
          <textarea
            id="comentario" className="w-full min-h-16 resize-y rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none focus:border-slate-400"
            value={comentario} onChange={e => setComentario(e.target.value)}
          />
        </div>

        <button
          onClick={() => responder('confirmar')} disabled={estado === 'enviando'}
          className="mt-5 w-full rounded-xl bg-brand py-3.5 text-center text-base font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
        >
          {estado === 'enviando' ? 'Un momento…' : '✓ Confirmo que la conozco'}
        </button>
        <button
          onClick={() => responder('rechazar')} disabled={estado === 'enviando'}
          className="mt-2.5 w-full rounded-xl bg-white py-3 text-center text-[15px] font-semibold text-slate-600 border border-slate-200 transition disabled:opacity-60"
        >
          No la reconozco
        </button>
        {estado === 'error' && <p className="mt-3 text-center text-sm text-destructive">No se pudo enviar. Inténtalo otra vez.</p>}
      </div>
      <p className="mt-6 text-center text-[11px] text-slate-300">Tentare Network</p>
    </main>
  );
}

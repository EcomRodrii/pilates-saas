'use client';

import { useState } from 'react';
import { copiarAlPortapapeles } from '@/lib/utils';
import { diaLargo, textoDelPremio, type PremioResena } from '@/lib/valoraciones/premio';

// Lo que sale tras valorar desde el enlace del correo: el enlace a la página de reseñas
// (si le toca: 3 clases asistidas, una vez cada 180 días) como acción principal y, APARTE,
// el agradecimiento del estudio (si lo ofrece). Mismos dos bloques y mismas reglas que en
// la app (components/student/domain/PremioValoracion.tsx): el premio es por valorar en
// Tentare y no depende de la nota; el enlace no habla del premio. Se canjea en la Caja o al comprar un bono o un
// plan; el pago de una clase suelta no tiene campo de código.

export function PremioResena({ premio, enlace }: { premio?: PremioResena | null; enlace?: string | null }) {
  const [copiado, setCopiado] = useState<'no' | 'si' | 'fallo'>('no');
  if (!premio && !enlace) return null;

  async function copiar() {
    if (!premio) return;
    // Solo «Copiado» si de verdad se ha escrito: Safari rechaza sin gesto o sin permiso.
    setCopiado((await copiarAlPortapapeles(premio.codigo)) ? 'si' : 'fallo');
  }

  return (
    <div className="mt-5 space-y-3 text-left" data-testid="premio-valoracion">
      {enlace && (
        <div className="rounded-xl border border-slate-200 p-4" data-testid="enlace-resenas">
          <p className="text-base font-bold text-slate-900">¿Te ha gustado? Cuéntalo en público</p>
          <p className="mt-1 text-xs text-slate-500">Son 30 segundos y ayuda a que más gente encuentre el estudio.</p>
          <a href={enlace} target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-xl bg-brand py-3 text-center text-base font-semibold text-white shadow-sm">
            Dejar mi reseña
          </a>
        </div>
      )}
      {premio?.canjeado && <p className="text-center text-sm text-slate-500">Ya has usado tu premio por valorar. ¡Gracias!</p>}
      {premio && !premio.canjeado && !premio.vigente && (
        <p className="text-center text-sm text-slate-500">Tu premio por valorar caducó{premio.expira ? ` el ${diaLargo(premio.expira)}` : ''}.</p>
      )}
      {premio?.vigente && !premio.canjeado && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" data-testid="premio-codigo">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Gracias por valorar</p>
          <p className="mt-1 text-base font-bold text-slate-900">Te regalamos {textoDelPremio(premio)}</p>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 border border-slate-200">
            <code className="text-lg font-extrabold tracking-wider text-slate-900">{premio.codigo}</code>
            <button type="button" onClick={() => void copiar()} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 active:scale-95">
              {copiado === 'si' ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          {copiado === 'fallo' && <p className="mt-1.5 text-xs text-destructive" role="alert">No se ha podido copiar. Anótalo a mano.</p>}
          <p className="mt-2 text-xs text-slate-500 leading-relaxed">
            Úsalo al comprar un bono o un plan en la app del estudio, o díselo a recepción.{premio.expira ? ` Vale hasta el ${diaLargo(premio.expira)}.` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

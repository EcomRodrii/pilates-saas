'use client';

import { useState } from 'react';

// «Abrimos mañana» en la tarjeta de apertura: el día antes de abrir, un aviso
// (push + email) a cada socia con cuota de lanzamiento. Apagado por defecto;
// encenderlo es el visto bueno. Se enseña el texto tal cual le llegará.
export function AvisoAbrimos({ encendido, nombreEstudio, fechaAproximada, onGuardar }: {
  encendido: boolean;
  nombreEstudio: string;
  fechaAproximada: boolean;
  onGuardar: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(v: boolean) {
    setGuardando(true);
    setError(null);
    const e = await onGuardar({ avisarAbrimos: v });
    if (e) setError(e);
    setGuardando(false);
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-background px-3 py-2.5">
      <label className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[12.5px] font-semibold text-foreground">Avisar el día antes de abrir</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
            A quien ya tiene su cuota de lanzamiento, por notificación y correo:
            «¡Mañana abrimos! {nombreEstudio} abre sus puertas mañana. Tu cuota ya está lista: reserva tu primera clase desde la app.»
          </span>
          {fechaAproximada && (
            <span className="mt-0.5 block text-[11.5px] text-warning">Con una fecha aproximada no sale: pon el día exacto de apertura.</span>
          )}
        </span>
        <input
          type="checkbox" role="switch" aria-label="Avisar el día antes de abrir"
          className="mt-0.5 size-4 shrink-0 accent-[var(--brand-medio)]"
          checked={encendido} disabled={guardando} onChange={e => void cambiar(e.target.checked)}
        />
      </label>
      {error && <p role="alert" className="mt-2 text-[12px] text-destructive">{error}</p>}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import type { FranjaKey } from '@/lib/sustituciones/franjas';
import { authHeader } from '@/lib/api-client';
import { RejillaDisponibilidad, alternarCelda } from '@/components/sustituciones/rejilla-disponibilidad';

// Misma rejilla día × franja que el enlace público (app/disponibilidad/[token]),
// pero desde dentro del panel logueado — sin depender de que la propietaria le
// mande un enlace. Reemplazo total al guardar (mismo criterio del servidor):
// lo que se ve aquí es exactamente lo que queda tras pulsar "Guardar".

export function TabMiDisponibilidad({ showToast }: { showToast: (m: string) => void }) {
  const [activas, setActivas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch('/api/mi-disponibilidad', { headers: await authHeader() });
        if (!res.ok) return;
        const data = (await res.json()) as { celdas?: string[] };
        if (vivo) setActivas(new Set(data.celdas ?? []));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  function toggle(dow: number, franja: FranjaKey) {
    setActivas((prev) => alternarCelda(prev, dow, franja));
  }

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch('/api/mi-disponibilidad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ celdas: Array.from(activas) }),
      });
      showToast(res.ok ? 'Disponibilidad guardada' : 'No se pudo guardar. Inténtalo de nuevo.');
    } catch {
      showToast('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return <div className="rounded-2xl border border-border bg-card p-6 text-[13px] text-muted-foreground">Cargando tu disponibilidad…</div>;
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-[14px] font-semibold text-foreground">Tu disponibilidad</h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Marca cuándo puedes cubrir clases. Un toque por franja — el estudio la usa para buscarte cuando alguien no puede dar la suya.
      </p>

      <div className="mt-4">
        <RejillaDisponibilidad activas={activas} onToggle={toggle} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          {activas.size === 0
            ? 'Ahora mismo no tienes ninguna franja marcada.'
            : `${activas.size} ${activas.size === 1 ? 'franja marcada' : 'franjas marcadas'}.`}
        </p>
        <button
          onClick={guardar}
          disabled={guardando}
          className="shrink-0 px-4 py-2 rounded-lg text-[13px] font-semibold bg-brand text-brand-foreground hover:brightness-95 transition-colors disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

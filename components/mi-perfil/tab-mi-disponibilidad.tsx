'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { DIAS, FRANJAS, celdaKey, type FranjaKey } from '@/lib/sustituciones/franjas';
import { authHeader } from '@/lib/api-client';

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
    const clave = celdaKey(dow, franja);
    setActivas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
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

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[auto_repeat(3,1fr)] items-stretch">
          <div className="border-b border-border bg-muted/40" />
          {FRANJAS.map((f) => (
            <div key={f.key} className="border-b border-border bg-muted/40 px-2 py-2.5 text-center">
              <div className="text-[12px] font-semibold text-foreground">{f.label}</div>
              <div className="text-[10px] text-muted-foreground">{f.horaInicio}–{f.horaFin}</div>
            </div>
          ))}

          {DIAS.map((d) => (
            <FilaDia key={d.dow} dow={d.dow} label={d.label} activas={activas} onToggle={toggle} />
          ))}
        </div>
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

function FilaDia({
  dow, label, activas, onToggle,
}: {
  dow: number; label: string; activas: Set<string>; onToggle: (dow: number, franja: FranjaKey) => void;
}) {
  return (
    <>
      <div className="flex items-center border-t border-border px-3 text-[12px] font-medium text-muted-foreground">
        {label}
      </div>
      {FRANJAS.map((f) => {
        const on = activas.has(celdaKey(dow, f.key));
        return (
          <button
            key={f.key}
            onClick={() => onToggle(dow, f.key)}
            aria-pressed={on}
            className={`m-1 flex h-11 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
              on
                ? 'border-brand bg-brand text-brand-foreground'
                : 'border-border bg-background text-muted-foreground/40 hover:border-muted-foreground'
            }`}
          >
            {on ? <Check size={14} /> : ''}
          </button>
        );
      })}
    </>
  );
}

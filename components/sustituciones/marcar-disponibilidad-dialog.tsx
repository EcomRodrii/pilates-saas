'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «La marco yo» — la propietaria carga la disponibilidad de una instructora.
//
// ⚠️ POR QUÉ. `rankear_candidatas` excluye a quien no tiene ninguna franja
// cargada (correcto: sin horario no se sabe si puede). Hasta ahora la ÚNICA
// forma de cargarla era que la propia instructora abriera un enlace o entrara
// en «Mi perfil». En un estudio recién abierto eso significa que sustituciones
// —lo que más valora quien lo prueba— no puede enseñar ni una candidata hasta
// que el equipo entero conteste. Una propietaria real SABE qué mañanas tiene
// libres Carmen: se lo deja marcar ella, en un minuto, sin esperar a nadie
// (evaluación del 13-sep). El enlace para que la instructora lo haga sigue
// existiendo aparte.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { authHeader } from '@/lib/api-client';
import type { FranjaKey } from '@/lib/sustituciones/franjas';
import { RejillaDisponibilidad, alternarCelda } from '@/components/sustituciones/rejilla-disponibilidad';

export function MarcarDisponibilidadDialog({
  abierto,
  instructoras,
  inicialId,
  onClose,
  onGuardado,
}: {
  abierto: boolean;
  /** Instructoras del estudio a las que se les puede marcar. */
  instructoras: { id: string; nombre: string }[];
  /** La que se preselecciona (la primera sin disponibilidad). */
  inicialId: string | null;
  onClose: () => void;
  onGuardado: (nombre: string, franjas: number) => void;
}) {
  const [id, setId] = useState<string | null>(inicialId);
  const [activas, setActivas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (abierto) { setId(inicialId); setError(null); } }, [abierto, inicialId]);

  useEffect(() => {
    if (!abierto || !id) return;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    (async () => {
      try {
        const res = await fetch(`/api/equipo/disponibilidad?instructorId=${encodeURIComponent(id)}`, { headers: await authHeader() });
        const data = (await res.json().catch(() => null)) as { celdas?: string[]; error?: string } | null;
        if (!vivo) return;
        if (!res.ok) { setError(data?.error ?? 'No se ha podido leer su disponibilidad.'); setActivas(new Set()); return; }
        setActivas(new Set(data?.celdas ?? []));
      } catch {
        if (vivo) setError('No se ha podido leer su disponibilidad. Revisa tu conexión.');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [abierto, id]);

  const nombre = instructoras.find((i) => i.id === id)?.nombre ?? 'la instructora';

  async function guardar() {
    if (!id || guardando) return;
    setError(null);
    setGuardando(true);
    try {
      const res = await fetch('/api/equipo/disponibilidad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ instructorId: id, celdas: Array.from(activas) }),
      });
      const data = (await res.json().catch(() => null)) as { guardadas?: number; error?: string } | null;
      // Se comprueba la respuesta: un «guardado» que no guardó dejaría el
      // ranking igual de vacío y a la propietaria creyendo que ya está.
      if (!res.ok) { setError(data?.error ?? 'No se ha podido guardar. Vuelve a intentarlo.'); return; }
      onGuardado(nombre, data?.guardadas ?? activas.size);
    } catch {
      setError('No se ha podido guardar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => { if (!open && !guardando) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">Marcar su disponibilidad</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Cuándo puede cubrir clases. Con esto ya puedo proponerla como sustituta; ella podrá cambiarlo luego desde su perfil.
          </p>
        </DialogHeader>

        {instructoras.length > 1 && (
          <label className="mt-1 block text-[12px] font-semibold text-muted-foreground">
            Instructora
            <select
              value={id ?? ''}
              onChange={(e) => setId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px] text-foreground"
            >
              {instructoras.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
          </label>
        )}

        <div className="mt-2">
          {cargando
            ? <p className="py-6 text-center text-[13px] text-muted-foreground">Cargando…</p>
            : <RejillaDisponibilidad activas={activas} onToggle={(dow: number, f: FranjaKey) => setActivas((p) => alternarCelda(p, dow, f))} />}
        </div>

        {error && <p role="alert" className="mt-2 text-[13px] text-destructive">{error}</p>}

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[12px] text-muted-foreground">
            {activas.size === 0 ? 'Ninguna franja marcada.' : `${activas.size} ${activas.size === 1 ? 'franja' : 'franjas'} para ${nombre}.`}
          </p>
          <button
            type="button"
            onClick={guardar}
            disabled={!id || guardando || cargando}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-brand-foreground transition-colors hover:brightness-95 disabled:opacity-60"
          >
            {guardando && <Loader2 size={14} className="animate-spin" />}
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

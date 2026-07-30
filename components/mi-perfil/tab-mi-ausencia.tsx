'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { authHeader } from '@/lib/api-client';

// Autoservicio de ausencia programada (vacaciones/baja médica/otro) — distinto
// de "No puedo asistir" (calendario/dashboard, #545): aquello es "hoy no doy
// ESTA clase, dispara la sustitución ya"; esto es "voy a estar fuera entre
// estas fechas", que solo la saca del ranking de candidatas durante ese
// periodo (rankear_candidatas). No dispara ninguna sustitución automática
// sobre sus clases ya programadas — si necesita cubrir alguna concreta ya,
// usa "No puedo asistir" sobre esa clase en el calendario.

type Tipo = 'VACACIONES' | 'BAJA_MEDICA' | 'OTRO';
const TIPOS: { value: Tipo; label: string }[] = [
  { value: 'VACACIONES', label: 'Vacaciones' },
  { value: 'BAJA_MEDICA', label: 'Baja médica' },
  { value: 'OTRO', label: 'Otro motivo' },
];

interface Ausencia {
  id: string;
  tipo: Tipo;
  desde: string;
  hasta: string;
  motivo: string | null;
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TabMiAusencia({ showToast }: { showToast: (m: string) => void }) {
  const [items, setItems] = useState<Ausencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tipo, setTipo] = useState<Tipo>('VACACIONES');
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    try {
      const res = await fetch('/api/equipo/ausencias', { headers: await authHeader() });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: Ausencia[] };
      setItems(data.items ?? []);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { void cargar(); }, []);

  async function registrar() {
    if (hasta < desde) { showToast('La fecha de fin no puede ser anterior a la de inicio.'); return; }
    setGuardando(true);
    try {
      const res = await fetch('/api/equipo/ausencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ tipo, desde, hasta, motivo: motivo.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; clasesAfectadas?: number };
      if (!res.ok) { showToast(data.error ?? 'No se pudo registrar la ausencia.'); return; }
      setMotivo('');
      await cargar();
      showToast(
        data.clasesAfectadas
          ? `Ausencia registrada. Tienes ${data.clasesAfectadas} clase${data.clasesAfectadas === 1 ? '' : 's'} en esas fechas — márcalas como "no puedo asistir" en el calendario si necesitas cubrirlas.`
          : 'Ausencia registrada',
      );
    } catch {
      showToast('No se pudo registrar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    try {
      const res = await fetch('/api/equipo/ausencias', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { showToast('No se pudo eliminar.'); return; }
      setItems(prev => prev.filter(i => i.id !== id));
    } catch {
      showToast('No se pudo eliminar. Revisa tu conexión.');
    }
  }

  if (cargando) {
    return <div className="rounded-2xl border border-border bg-card p-6 text-[13px] text-muted-foreground">Cargando tus ausencias…</div>;
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-[14px] font-semibold text-foreground">Tus ausencias</h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Registra vacaciones o baja médica para que el estudio no te proponga como sustituta en esas fechas.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {TIPOS.map(t => (
          <button
            key={t.value}
            onClick={() => setTipo(t.value)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${
              tipo === t.value ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground" />
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-[11px] font-medium text-muted-foreground mb-1">Motivo (opcional)</label>
        <input
          type="text" value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300}
          placeholder="Si quieres añadir contexto…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <button
        onClick={registrar}
        disabled={guardando}
        className="mt-4 w-full px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-brand text-brand-foreground hover:brightness-95 transition-colors disabled:opacity-60"
      >
        {guardando ? 'Registrando…' : 'Registrar ausencia'}
      </button>

      {items.length > 0 && (
        <div className="mt-5 space-y-2">
          {items.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-2 p-3 rounded-xl border border-border">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground">
                  {TIPOS.find(t => t.value === a.tipo)?.label ?? a.tipo}
                </p>
                <p className="text-[11px] text-muted-foreground">{a.desde} – {a.hasta}{a.motivo ? ` · ${a.motivo}` : ''}</p>
              </div>
              <button
                onClick={() => borrar(a.id)}
                aria-label="Eliminar ausencia"
                className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

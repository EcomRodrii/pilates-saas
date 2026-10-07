'use client';

// Llamadas de puesta en marcha: los estudios nuevos que, al crear su cuenta,
// eligieron «Prefiero que me llamen» y dejaron su teléfono (con el
// consentimiento de una sola llamada, solo para ayudarles con el alta).
// Reutiliza el layout y la guardia de /interno. Al marcar una como hecha, el
// teléfono se borra: una vez atendida no se conserva.

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Phone } from 'lucide-react';
import { fetchLlamadas, marcarLlamadaHecha, SinAcceso, type LlamadaInterna } from '@/lib/interno/client';
import { ETIQUETA_HORA } from '@/lib/llamada/solicitud';
import { mostrarE164 } from '@/lib/llamada/telefono';

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

export default function LlamadasPage() {
  const [llamadas, setLlamadas] = useState<LlamadaInterna[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [errorFila, setErrorFila] = useState<{ id: string; mensaje: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetchLlamadas();
      setLlamadas(Array.isArray(r?.llamadas) ? r.llamadas : []);
      setError(null);
    } catch (e) {
      setError(e instanceof SinAcceso ? e.message : 'No se han podido cargar las llamadas.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  async function hecha(id: string) {
    setMarcando(id);
    setErrorFila(null);
    try {
      await marcarLlamadaHecha(id);
      await cargar();
    } catch (e) {
      setErrorFila({ id, mensaje: e instanceof Error ? e.message : 'No se ha podido marcar la llamada.' });
    } finally {
      setMarcando(null);
    }
  }

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!llamadas) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Cargando llamadas…</div>;
  }

  const pendientes = llamadas.filter((l) => l.estado === 'pendiente');
  const hechas = llamadas.filter((l) => l.estado === 'hecha');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-foreground">Llamadas de puesta en marcha</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Quien crea su estudio y pide que le llamen. Una llamada, solo para ayudarle con el alta. Al marcarla como hecha se borra el teléfono.
        </p>
      </div>

      <section aria-labelledby="pend-t">
        <h2 id="pend-t" className="flex items-center gap-1.5 text-[13px] font-bold text-foreground mb-2">
          <Phone size={14} /> Pendientes <span className="text-muted-foreground font-semibold">({pendientes.length})</span>
        </h2>
        {pendientes.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No hay ninguna llamada pendiente.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pendientes.map((l) => (
              <li key={l.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-foreground truncate">{l.estudio}</p>
                  <p className="mt-0.5 text-[13px] text-foreground">
                    <a href={`tel:${l.telefono ?? ''}`} className="font-semibold underline underline-offset-2">{l.telefono ? mostrarE164(l.telefono) : '—'}</a>
                    {l.horaPreferida && <span className="text-muted-foreground"> · {ETIQUETA_HORA[l.horaPreferida]}</span>}
                  </p>
                  <p className="text-[12px] text-muted-foreground">Lo pidió el {fechaHora(l.creadaEn)}</p>
                  {errorFila?.id === l.id && <p role="alert" className="mt-1 text-[12px] text-destructive">{errorFila.mensaje}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => { void hecha(l.id); }}
                  disabled={marcando === l.id}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 text-[13px] font-bold text-brand-foreground disabled:opacity-60"
                >
                  {marcando === l.id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <CheckCircle2 size={14} aria-hidden />}
                  Llamada hecha
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {hechas.length > 0 && (
        <section aria-labelledby="hechas-t">
          <h2 id="hechas-t" className="text-[13px] font-bold text-foreground mb-2">Hechas <span className="text-muted-foreground font-semibold">({hechas.length})</span></h2>
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
            {hechas.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                <span className="font-medium text-foreground truncate">{l.estudio}</span>
                <span className="text-muted-foreground">{l.atendidaEn ? fechaHora(l.atendidaEn) : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

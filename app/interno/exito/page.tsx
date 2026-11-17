'use client';

// Customer Success ligado a billing — alertas INTERNAS con su contexto y lo que haría una persona.
//
// Reglas de la pantalla (brief del fundador, 17-nov-2026):
//   · Aquí nada contacta con ningún estudio ni cobra nada: cada alerta es una propuesta para quien la lee.
//   · Ninguna alerta sin dato: debajo de cada título van los datos que la sostienen.
//   · «Nada que mostrar» solo vale para lo que se ha podido mirar: lo que falló se dice arriba.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { fetchExito, type AlertaExito } from '@/lib/interno/client';

const FAMILIAS = [
  { id: 'todas', texto: 'Todas' },
  { id: 'billing', texto: 'Cobros' },
  { id: 'retencion', texto: 'Retención' },
  { id: 'oportunidad', texto: 'Oportunidades' },
] as const;

const TONO: Record<AlertaExito['severidad'], { texto: string; clase: string }> = {
  alta: { texto: 'Urgente', clase: 'bg-red-500/12 text-red-700 dark:text-red-400' },
  media: { texto: 'Importante', clase: 'bg-amber-500/14 text-amber-700 dark:text-amber-400' },
  baja: { texto: 'Cuando puedas', clase: 'bg-muted text-muted-foreground' },
};
const TEXTO_FAMILIA: Record<AlertaExito['familia'], string> = { billing: 'Cobros', retencion: 'Retención', oportunidad: 'Oportunidad' };

export default function ExitoInterno() {
  const [datos, setDatos] = useState<{ alertas: AlertaExito[]; avisos: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [familia, setFamilia] = useState<(typeof FAMILIAS)[number]['id']>('todas');

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setDatos(await fetchExito()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setCargando(false); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;
  if (!datos) return <p className="text-[13.5px] text-muted-foreground">Mirando cobros, uso y planes…</p>;

  const visibles = datos.alertas.filter((a) => familia === 'todas' || a.familia === familia);
  const cuenta = (f: AlertaExito['familia']) => datos.alertas.filter((a) => a.familia === f).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-bold text-foreground">Customer Success</h1>
          <p className="text-[12.5px] text-muted-foreground">
            {datos.alertas.length === 0 ? 'Nada que mirar ahora mismo.' : `${datos.alertas.length} ${datos.alertas.length === 1 ? 'alerta' : 'alertas'} · ${cuenta('billing')} de cobros, ${cuenta('retencion')} de retención, ${cuenta('oportunidad')} oportunidades.`}
            {' '}Aquí no se contacta con nadie ni se cobra nada solo: decides tú.
          </p>
        </div>
        <button type="button" onClick={() => void cargar()} disabled={cargando}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground disabled:opacity-50">
          <RefreshCw className={`size-3.5 ${cargando ? 'animate-spin' : ''}`} aria-hidden /> Actualizar
        </button>
      </div>

      {datos.avisos.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 text-[12.5px] text-muted-foreground">
          <p className="flex items-center gap-1.5 font-bold text-foreground"><AlertTriangle className="size-3.5" aria-hidden />Lo que no se ha podido mirar</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{datos.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          <p className="mt-1">Que no salga una alerta de esas no quiere decir que no haya nada.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Familia de alertas">
        {FAMILIAS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={familia === f.id} onClick={() => setFamilia(f.id)}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${familia === f.id ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground'}`}>
            {f.texto}{f.id !== 'todas' ? ` · ${cuenta(f.id)}` : ''}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-[13.5px] text-muted-foreground">
          {datos.alertas.length === 0 ? 'Ninguna alerta con los datos que se han podido leer.' : 'Ninguna alerta en esta familia.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibles.map((a) => (
            <li key={a.id} className="rounded-2xl border border-border bg-card px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TONO[a.severidad].clase}`}>{TONO[a.severidad].texto}</span>
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{TEXTO_FAMILIA[a.familia]}</span>
                {a.eurosMes !== null && <span className="ml-auto text-[12px] font-semibold tabular-nums text-foreground">{a.eurosMes.toLocaleString('es-ES')} €/mes</span>}
              </div>
              <h2 className="mt-1.5 text-[14px] font-bold text-foreground">{a.titulo}</h2>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px] text-muted-foreground">
                {a.contexto.map((l) => <li key={l}>{l}</li>)}
              </ul>
              <p className="mt-2 rounded-xl bg-muted/50 px-3 py-2 text-[12.5px] text-foreground"><strong>Qué haría yo: </strong>{a.accion}</p>
              {a.href && (
                <Link href={a.href} className="mt-2 inline-block text-[12.5px] font-semibold text-brand-medio hover:underline">
                  {a.href.startsWith('/interno/estudios/') ? 'Abrir su ficha' : 'Ver los cobros'}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

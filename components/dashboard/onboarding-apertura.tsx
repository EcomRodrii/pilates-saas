'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { OBJETIVOS, PUNTOS, type Objetivo, type Punto, type TipoFecha } from '@/lib/opening/onboarding';

interface Props {
  /** Devuelve el error a enseñar, o null si se guardó. */
  onGuardar: (onboarding: Record<string, unknown>) => Promise<string | null>;
  onYaAbierto: () => void;
  guardando: boolean;
}

function Opcion({ activa, onClick, children, unica = false }: { activa: boolean; onClick: () => void; children: React.ReactNode; unica?: boolean }) {
  return (
    <button
      type="button"
      role={unica ? 'radio' : 'checkbox'}
      aria-checked={activa}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-[12.5px] transition-colors ${
        activa ? 'border-brand-secondary bg-brand/10 text-foreground' : 'border-border bg-background text-foreground hover:bg-muted'}`}
    >
      <span className={`flex size-4 shrink-0 items-center justify-center ${unica ? 'rounded-full' : 'rounded'} border ${activa ? 'border-brand-secondary bg-brand-secondary text-white' : 'border-border'}`}>
        {activa && <Check size={11} />}
      </span>
      {children}
    </button>
  );
}

// Desplegable y no <input type="month">: Safari de escritorio no lo soporta y
// deja un campo de texto libre que no casaría con 'YYYY-MM'.
const MESES = (() => {
  const hoy = new Date();
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + i, 1));
    return {
      valor: d.toISOString().slice(0, 7),
      texto: new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d),
    };
  });
})();

const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v]);

// Onboarding progresivo: tres preguntas cortas en vez de un formulario. Con las
// respuestas la tarjeta recomienda qué hacer después (lib/opening/onboarding.ts).
export function OnboardingApertura({ onGuardar, onYaAbierto, guardando }: Props) {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [objetivos, setObjetivos] = useState<Objetivo[]>([]);
  const [fechaTipo, setFechaTipo] = useState<TipoFecha | null>(null);
  const [fecha, setFecha] = useState('');
  const [mes, setMes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fechaLista = fechaTipo === 'NO_SE' || (fechaTipo === 'EXACTA' && !!fecha) || (fechaTipo === 'APROXIMADA' && !!mes);

  async function terminar() {
    setError(null);
    const err = await onGuardar({ puntos, objetivos, fechaTipo, fecha, mes });
    if (err) setError(err);
  }

  const siguiente = 'h-9 rounded-lg bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50';
  const atras = 'h-9 px-2 text-[12px] text-muted-foreground hover:underline';

  return (
    <div className="mt-3">
      <p className="text-[11px] text-muted-foreground">Paso {paso} de 3</p>

      {paso === 1 && (
        <fieldset className="mt-1 space-y-1.5">
          <legend className="mb-1.5 text-[12.5px] font-semibold text-foreground">¿En qué punto está tu apertura?</legend>
          {(Object.keys(PUNTOS) as Punto[]).map(p => (
            <Opcion key={p} activa={puntos.includes(p)} onClick={() => setPuntos(alternar(puntos, p))}>{PUNTOS[p]}</Opcion>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1.5">
            <button type="button" className={siguiente} disabled={puntos.length === 0} onClick={() => setPaso(2)}>Siguiente</button>
            <button type="button" className={atras} disabled={guardando} onClick={onYaAbierto}>Mi estudio ya está abierto</button>
          </div>
        </fieldset>
      )}

      {paso === 2 && (
        <fieldset className="mt-1 space-y-1.5">
          <legend className="mb-1.5 text-[12.5px] font-semibold text-foreground">¿Qué quieres conseguir antes de abrir?</legend>
          {(Object.keys(OBJETIVOS) as Objetivo[]).map(o => (
            <Opcion key={o} activa={objetivos.includes(o)} onClick={() => setObjetivos(alternar(objetivos, o))}>{OBJETIVOS[o]}</Opcion>
          ))}
          <div className="flex items-center gap-2 pt-1.5">
            <button type="button" className={siguiente} onClick={() => setPaso(3)}>Siguiente</button>
            <button type="button" className={atras} onClick={() => setPaso(1)}>Atrás</button>
          </div>
        </fieldset>
      )}

      {paso === 3 && (
        <fieldset role="radiogroup" className="mt-1 space-y-1.5">
          <legend className="mb-1.5 text-[12.5px] font-semibold text-foreground">¿Cuándo quieres abrir?</legend>
          <Opcion unica activa={fechaTipo === 'EXACTA'} onClick={() => setFechaTipo('EXACTA')}>Tengo una fecha exacta</Opcion>
          {fechaTipo === 'EXACTA' && (
            <label className="block pl-6 text-[11.5px] text-muted-foreground">Fecha de apertura
              <input type="date" value={fecha} onChange={ev => setFecha(ev.target.value)} className="mt-0.5 block h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground" />
            </label>
          )}
          <Opcion unica activa={fechaTipo === 'APROXIMADA'} onClick={() => setFechaTipo('APROXIMADA')}>Tengo una fecha aproximada</Opcion>
          {fechaTipo === 'APROXIMADA' && (
            <label className="block pl-6 text-[11.5px] text-muted-foreground">Mes aproximado
              <select value={mes} onChange={ev => setMes(ev.target.value)} className="mt-0.5 block h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground">
                <option value="">Elige el mes</option>
                {MESES.map(m => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
              </select>
            </label>
          )}
          <Opcion unica activa={fechaTipo === 'NO_SE'} onClick={() => setFechaTipo('NO_SE')}>Todavía no lo sé</Opcion>
          {error && <p role="alert" className="text-[12px] text-destructive">{error}</p>}
          <div className="flex items-center gap-2 pt-1.5">
            <button type="button" className={siguiente} disabled={!fechaLista || guardando} onClick={() => void terminar()}>
              {guardando ? 'Guardando…' : 'Listo'}
            </button>
            <button type="button" className={atras} onClick={() => setPaso(2)}>Atrás</button>
          </div>
        </fieldset>
      )}
    </div>
  );
}

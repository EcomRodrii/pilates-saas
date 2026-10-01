'use client';

import { useState } from 'react';
import { AlertTriangle, Mail, MessageCircle, MessagesSquare, Phone, Store, X, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { apuntarContacto } from '@/lib/api-client';
import {
  CANALES_CONTACTO, ETIQUETA_CANAL, ETIQUETA_RESULTADO, NOTA_CONTACTO_MAX, RESULTADOS_CONTACTO,
  type CanalContacto, type ResultadoContacto,
} from '@/lib/clientas/contactos';
import { cn } from '@/lib/utils';

// «Apuntar un contacto»: cómo hablaste con ella, qué te dijo y, si quieres, una
// nota. Lo lee todo el equipo (y el Centro de Control: deja de proponer
// escribirle a quien acabas de llamar). Solo dice «apuntado» cuando el servidor
// lo ha guardado; si no, enseña por qué y no se cierra.

const ICONO_CANAL: Record<CanalContacto, LucideIcon> = {
  WHATSAPP: MessageCircle,
  LLAMADA: Phone,
  EN_PERSONA: Store,
  EMAIL: Mail,
};

const TONO_RESULTADO: Record<ResultadoContacto, string> = {
  VA_A_VOLVER: 'data-[activo=true]:border-success data-[activo=true]:bg-success/10 data-[activo=true]:text-success',
  SE_LO_PIENSA: 'data-[activo=true]:border-warning data-[activo=true]:bg-warning/10 data-[activo=true]:text-warning',
  NO_CONTESTA: 'data-[activo=true]:border-foreground data-[activo=true]:bg-muted',
  NO_QUIERE_SEGUIR: 'data-[activo=true]:border-destructive data-[activo=true]:bg-destructive/10 data-[activo=true]:text-destructive',
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Los últimos 7 días, para «fue otro día»: hoy es «ahora». */
function diasRecientes(ahora: Date): { valor: string; texto: string }[] {
  return Array.from({ length: 7 }, (_, i) => {
    if (i === 0) return { valor: '', texto: 'Ahora mismo' };
    const d = new Date(ahora.getTime() - i * 86_400_000);
    // A mediodía de ese día: la hora exacta no importa, el día sí.
    d.setHours(12, 0, 0, 0);
    return { valor: d.toISOString(), texto: i === 1 ? 'Ayer' : `El ${DIAS[d.getDay()]} ${d.getDate()}` };
  });
}

export interface ContactoRecienApuntado {
  id: string;
  en: string;
  canal: CanalContacto;
  resultado: ResultadoContacto | null;
}

export function DialogoApuntarContacto({ socioId, nombre, ella = 'ella', lo = 'la', abierto, canalInicial, onCerrar, onHecho }: {
  socioId: string;
  /** Su nombre de pila, para las frases. */
  nombre: string;
  /** «ella» / «él», y el pronombre «la» / «lo». */
  ella?: string;
  lo?: string;
  abierto: boolean;
  /** Si se abre al volver de WhatsApp o de una llamada, ese canal ya marcado. */
  canalInicial?: CanalContacto | null;
  onCerrar: () => void;
  onHecho: (c: ContactoRecienApuntado) => void;
}) {
  if (!abierto) return null;
  return <Contenido socioId={socioId} nombre={nombre} ella={ella} lo={lo} canalInicial={canalInicial ?? null} onCerrar={onCerrar} onHecho={onHecho} />;
}

function Contenido({ socioId, nombre, ella, lo, canalInicial, onCerrar, onHecho }: {
  socioId: string;
  nombre: string;
  ella: string;
  lo: string;
  canalInicial: CanalContacto | null;
  onCerrar: () => void;
  onHecho: (c: ContactoRecienApuntado) => void;
}) {
  const [ahora] = useState(() => new Date());
  const [canal, setCanal] = useState<CanalContacto | null>(canalInicial);
  const [resultado, setResultado] = useState<ResultadoContacto | null>(null);
  const [nota, setNota] = useState('');
  const [cuando, setCuando] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (enviando || !canal) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await apuntarContacto(socioId, { canal, resultado, nota: nota.trim() || null, en: cuando || null });
      if (!r.ok) { setError(r.error); return; }
      onHecho({ id: r.id, en: r.en, canal, resultado });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !enviando) onCerrar(); }}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><MessagesSquare size={20} aria-hidden /></span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold text-foreground">¿Cómo ha ido con {nombre}?</DialogTitle>
            <DialogDescription className="mt-0.5 text-[13px] text-muted-foreground text-pretty">
              Queda en su historia para todo el equipo, y el Centro de Control lo tiene en cuenta antes de proponerte escribirle otra vez.
            </DialogDescription>
          </div>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-semibold text-foreground">Cómo hablaste con {ella}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CANALES_CONTACTO.map(c => {
              const Icono = ICONO_CANAL[c];
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={canal === c}
                  onClick={() => setCanal(c)}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-[12.5px] font-medium transition-colors',
                    canal === c ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted',
                  )}
                >
                  <Icono size={17} aria-hidden />
                  {ETIQUETA_CANAL[c]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-semibold text-foreground">Qué te dijo <span className="font-normal text-muted-foreground">(si lo sabes)</span></legend>
          <div className="flex flex-wrap gap-1.5">
            {RESULTADOS_CONTACTO.map(r => (
              <button
                key={r}
                type="button"
                data-activo={resultado === r}
                aria-pressed={resultado === r}
                onClick={() => setResultado(v => (v === r ? null : r))}
                className={cn('min-h-10 rounded-full border border-border bg-card px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted', TONO_RESULTADO[r])}
              >
                {ETIQUETA_RESULTADO[r]}
              </button>
            ))}
          </div>
          {resultado === 'NO_QUIERE_SEGUIR' && (
            <p className="mt-2 text-[12.5px] text-muted-foreground text-pretty">
              El Centro de Control dejará de proponerte recuperar{lo}: solo te avisará si es {ella} quien intenta volver. Si quieres dar{lo} de baja, se hace aparte desde su ficha.
            </p>
          )}
        </fieldset>

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-foreground">Nota <span className="font-normal text-muted-foreground">(opcional)</span></span>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value.slice(0, NOTA_CONTACTO_MAX))}
            rows={3}
            placeholder="Ej.: Ha tenido mucho lío en el trabajo; vuelve la semana que viene."
            className="w-full resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [@media(pointer:fine)]:text-[13.5px]"
          />
          <span className="mt-1 flex justify-between gap-3 text-[11.5px] text-muted-foreground">
            <span className="text-pretty">Lo de salud, en su pestaña Salud: esto lo lee todo el equipo.</span>
            {nota.length > NOTA_CONTACTO_MAX - 200 && <span className="tabular-nums">{nota.length}/{NOTA_CONTACTO_MAX}</span>}
          </span>
        </label>

        <label className="flex items-center justify-between gap-3 text-[13px] text-foreground">
          <span className="font-semibold">Cuándo</span>
          <select
            value={cuando}
            onChange={e => setCuando(e.target.value)}
            className="min-h-10 rounded-xl border border-input bg-card px-3 text-[13.5px] text-foreground focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {diasRecientes(ahora).map(d => <option key={d.texto} value={d.valor}>{d.texto}</option>)}
          </select>
        </label>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />{error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={enviando} className="min-h-10 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={!canal || enviando}
            className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50"
          >
            {enviando ? 'Apuntando…' : 'Apuntarlo'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * La tarjeta de «¿has hablado con ella?» que sale al pulsar WhatsApp o Llamar:
 * lo normal es volver de la conversación y olvidarse de apuntarla.
 */
export function PreguntaTrasContacto({ nombre, canal, onApuntar, onDescartar }: {
  nombre: string;
  canal: CanalContacto;
  onApuntar: () => void;
  onDescartar: () => void;
}) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-brand/30 bg-brand/[0.06] px-4 py-3">
      <p className="min-w-0 flex-1 text-[13.5px] text-foreground text-pretty">
        <strong className="font-semibold">{canal === 'LLAMADA' ? `¿Has hablado con ${nombre}?` : `¿Le has escrito a ${nombre}?`}</strong>{' '}
        <span className="text-muted-foreground">Apúntalo y el equipo sabrá qué te dijo.</span>
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={onApuntar} className="min-h-10 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:brightness-95">
          Apuntarlo
        </button>
        <button type="button" onClick={onDescartar} aria-label="Ahora no" className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

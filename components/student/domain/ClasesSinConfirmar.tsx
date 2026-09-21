'use client';

import { useState } from 'react';
import { Button } from '@/components/student/ui/Button';
import type { ClasePendiente } from '@/lib/fichaje/clases-impartidas';

/**
 * «¿Diste estas clases?»: las que terminaron sin empezarlas ni pasar lista.
 * Tres respuestas por clase —a su hora, con otro horario, no la di— y, con
 * varias, todas a su hora de un toque. Es control horario: dice si trabajó, no
 * quién vino.
 */

const fmtDia = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short' });
const fmtHora = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtFecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });

export type RespuestaClase =
  | { sesionId: string; modo: 'A_SU_HORA' | 'NO_DADA' }
  | { sesionId: string; modo: 'OTRO_HORARIO'; fecha: string; inicio: string; fin: string };

export function ClasesSinConfirmar({ clases, enviando, onResponder }: {
  clases: ClasePendiente[];
  enviando: boolean;
  onResponder: (respuestas: RespuestaClase[]) => void;
}) {
  const [otroHorario, setOtroHorario] = useState<{ id: string; inicio: string; fin: string } | null>(null);
  if (clases.length === 0) return null;

  return (
    <section aria-labelledby="sin-confirmar" data-testid="clases-sin-confirmar" className="card" style={{ padding: '14px 15px', borderColor: 'var(--warning)' }}>
      <h2 id="sin-confirmar" className="t-label" style={{ margin: 0, color: 'var(--warning)' }}>
        {clases.length === 1 ? '¿Diste esta clase?' : `¿Diste estas ${clases.length} clases?`}
      </h2>
      <p className="t-meta" style={{ margin: '4px 0 0', lineHeight: 1.45 }}>
        Terminaron sin que las empezaras ni pasaras lista. Confírmalo para que el estudio tenga bien tus horas.
      </p>
      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 10 }}>
        {clases.map((c) => (
          <li key={c.id} data-testid="clase-pendiente" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <p style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 800 }}>{c.nombre}</p>
            <p className="t-meta" style={{ margin: '1px 0 0', textTransform: 'capitalize' }}>
              {fmtDia.format(new Date(c.inicio))} · {fmtHora.format(new Date(c.inicio))}–{fmtHora.format(new Date(c.fin))}
            </p>
            {otroHorario?.id === c.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onResponder([{ sesionId: c.id, modo: 'OTRO_HORARIO', fecha: fmtFecha.format(new Date(c.inicio)), inicio: otroHorario.inicio, fin: otroHorario.fin }]);
                  setOtroHorario(null);
                }}
                style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
              >
                <label className="t-small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  De <input type="time" required aria-label="Hora a la que empezaste" value={otroHorario.inicio}
                    onChange={(e) => setOtroHorario({ ...otroHorario, inicio: e.target.value })} style={campo} />
                </label>
                <label className="t-small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  a <input type="time" required aria-label="Hora a la que terminaste" value={otroHorario.fin}
                    onChange={(e) => setOtroHorario({ ...otroHorario, fin: e.target.value })} style={campo} />
                </label>
                <Button size="sm" type="submit" disabled={enviando}>Guardar</Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setOtroHorario(null)}>Cancelar</Button>
              </form>
            ) : (
              <div style={{ marginTop: 8, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <Button size="sm" disabled={enviando} onClick={() => onResponder([{ sesionId: c.id, modo: 'A_SU_HORA' }])}>Sí, a su hora</Button>
                <Button size="sm" variant="secondary" disabled={enviando}
                  onClick={() => setOtroHorario({ id: c.id, inicio: fmtHora.format(new Date(c.inicio)), fin: fmtHora.format(new Date(c.fin)) })}>
                  Otro horario
                </Button>
                <Button size="sm" variant="ghost" disabled={enviando} onClick={() => onResponder([{ sesionId: c.id, modo: 'NO_DADA' }])}>No la di</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {clases.length > 1 && !otroHorario && (
        <Button full disabled={enviando} style={{ marginTop: 12 }}
          onClick={() => onResponder(clases.map((c) => ({ sesionId: c.id, modo: 'A_SU_HORA' as const })))}>
          Sí, las {clases.length} a su hora
        </Button>
      )}
    </section>
  );
}

const campo = { height: 34, borderRadius: 10, border: '1px solid var(--border)', padding: '0 8px', fontFamily: 'inherit', fontSize: 'var(--t-small)', background: 'var(--card)' } as const;

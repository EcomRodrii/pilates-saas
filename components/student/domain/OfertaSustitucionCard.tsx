'use client';

import { Button } from '@/components/student/ui/Button';
import type { OfertaSustitucion } from '@/lib/student/agenda-instructora';

/**
 * «Te piden cubrir esta clase». La misma pregunta que el email de la
 * sustitución, con sus dos respuestas, sin tener que abrir el correo.
 *
 * No da nada por hecho: mientras el servidor contesta, los dos botones esperan,
 * y lo que se pinta después es lo que él diga (la pantalla recarga).
 */
export function OfertaSustitucionCard({ oferta, cuando, respondiendo, error, deshabilitada, onResponder }: {
  oferta: OfertaSustitucion;
  /** «Mañana», «Jueves 18»… */
  cuando: string;
  respondiendo: 'aceptar' | 'rechazar' | null;
  error: string | null;
  deshabilitada: boolean;
  onResponder: (accion: 'aceptar' | 'rechazar') => void;
}) {
  const ocupada = respondiendo !== null;
  const boton = { flex: 1, height: 'var(--h-control-lg)' };
  return (
    <article
      className="card stack"
      data-testid="oferta-sustitucion"
      style={{ ['--gap' as string]: 'var(--s-3)', padding: 'var(--s-4)' }}
    >
      <div className="stack" style={{ ['--gap' as string]: 'var(--s-1)' }}>
        <p className="t-meta">
          {cuando} · {oferta.hora}–{oferta.horaFin}{oferta.sala ? ` · ${oferta.sala}` : ''}
        </p>
        <p className="t-card-title">{oferta.tipo}</p>
        <p className="t-small t-dim">¿Puedes cubrirla? Si dices que sí, pasa a tu nombre.</p>
      </div>

      {error && (
        <p role="alert" style={{ margin: 0, background: 'var(--destructive-soft)', color: 'var(--destructive-foreground)', borderRadius: 12, padding: '10px 13px', fontSize: 'var(--t-small)', fontWeight: 700 }}>
          {error}
        </p>
      )}

      <div className="row" style={{ ['--gap' as string]: 'var(--s-2)' }}>
        <Button
          loading={respondiendo === 'aceptar'}
          disabled={deshabilitada || ocupada}
          onClick={() => onResponder('aceptar')}
          style={boton}
        >
          La cubro
        </Button>
        <Button
          variant="secondary"
          loading={respondiendo === 'rechazar'}
          disabled={deshabilitada || ocupada}
          onClick={() => onResponder('rechazar')}
          style={boton}
        >
          No puedo
        </Button>
      </div>
    </article>
  );
}

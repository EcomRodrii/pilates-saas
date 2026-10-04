'use client';

import { useCallback, useState } from 'react';
import { useAsync } from '@/lib/student/useAsync';
import { enviarValoracion, getValoracionClase, type EstadoValoracion } from '@/lib/student/valorar';
import { haceCuanto } from '@/lib/student/momento-inicio';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { useToast } from '@/components/student/ui/Toast';
import { Button } from '@/components/student/ui/Button';
import { vibrar } from '@/lib/nativo/puente';

// «¿Qué tal {clase} con {instructora}?» — arriba en Inicio durante las 24 h
// siguientes a una clase a la que ASISTIÓ y que aún no ha valorado (maqueta
// aprobada, oct-2026).
//
// No es un sistema nuevo: es la MISMA valoración que la tarjeta del detalle de
// la reserva (`ValorarClase`), contra la misma puerta (`/api/public/valorar-clase`,
// que es quien decide si se puede: solo tras asistir). Las cinco caras son la
// puntuación de 1 a 5 de siempre.
//
// Un toque: tocar una cara ENVÍA (una petición, y no deja una segunda mientras
// va). La frase es opcional y va después: si la escribe, se manda como cambio de
// esa misma valoración (el servidor la actualiza, no duplica).
//
// ⚠️ «Tu nombre y lo que escribas solo los ve tu estudio», y no «no se publica»
// a secas, que sería mentira: la NOTA cuenta, sin nombre, en la media que la app
// enseña de cada instructora (`InstructorCard`). Lo que sí no sale nunca del
// estudio es quién la puso ni el comentario (la instructora tampoco los ve:
// `lib/student/valoraciones-instructora.ts`).

const CARAS: { cara: string; texto: string }[] = [
  { cara: '😣', texto: 'Mal' },
  { cara: '😕', texto: 'Regular' },
  { cara: '🙂', texto: 'Bien' },
  { cara: '😊', texto: 'Muy bien' },
  { cara: '🤩', texto: '¡Increíble!' },
];

export function QueTalLaClase({ studioId, sesionId, clase, instructora, fin }: {
  studioId: string; sesionId: string; clase: string; instructora?: string; fin: string;
}) {
  const { toast } = useToast();
  const ahoraMs = useAhoraMs();
  const cargar = useCallback(() => getValoracionClase(studioId, sesionId), [studioId, sesionId]);
  const { data, estado } = useAsync<EstadoValoracion | null>(cargar, (d) => !d);
  const [enviada, setEnviada] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [comentario, setComentario] = useState('');
  const [comentada, setComentada] = useState(false);

  // Solo si el servidor dice que puede y que aún no lo ha hecho. Ya enviada
  // desde aquí, se queda en pantalla para dar las gracias.
  if (enviada === null && (estado !== 'ready' || !data || !data.puedeValorar || data.valoracion)) return null;

  const valorar = async (puntuacion: number) => {
    if (enviando || enviada !== null) return;
    setEnviando(true);
    const r = await enviarValoracion(studioId, sesionId, puntuacion, '');
    setEnviando(false);
    if (!r.ok) { toast(r.error); return; }
    void vibrar('exito');
    setEnviada(puntuacion);
  };

  const comentar = async () => {
    if (enviando || enviada === null || !comentario.trim()) return;
    setEnviando(true);
    const r = await enviarValoracion(studioId, sesionId, enviada, comentario);
    setEnviando(false);
    if (!r.ok) { toast(r.error); return; }
    setComentada(true);
  };

  const titulo = `¿Qué tal ${clase}${instructora ? ` con ${instructora}` : ''}?`;
  return (
    <section
      className="card a-pop"
      data-testid="que-tal-la-clase"
      aria-label="Valorar tu última clase"
      style={{ padding: 'var(--s-4) var(--s-4) var(--s-3)', border: '1.5px solid var(--accent)', borderRadius: 'var(--radius-hero)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}
    >
      {enviada === null ? (
        <>
          <div>
            {ahoraMs !== null && <p className="t-label" style={{ color: 'var(--accent)' }}>{haceCuanto(fin, ahoraMs)}</p>}
            <p className="t-card-title" style={{ marginTop: 4, fontSize: 'calc(var(--t-h2) * var(--heading-scale))' }}>{titulo}</p>
          </div>
          <div role="group" aria-label="Tu valoración" style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--s-2)' }}>
            {CARAS.map((c, i) => (
              <button
                key={c.cara}
                type="button"
                className="tap"
                aria-label={`${c.texto} (${i + 1} de 5)`}
                disabled={enviando}
                onClick={() => void valorar(i + 1)}
                style={{ flex: 1, maxWidth: 58, aspectRatio: '1', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--muted)', fontSize: 28, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: enviando ? .5 : 1 }}
              >
                <span aria-hidden>{c.cara}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="t-card-title" role="status">
            {CARAS[enviada - 1].cara} ¡Gracias! Se lo hemos contado a tu estudio.
          </p>
          {comentada ? (
            <p className="t-meta">Y tu comentario también.</p>
          ) : (
            <>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder={instructora ? `Cuéntale algo a ${instructora} (opcional)` : '¿Algo que quieras contar? (opcional)'}
                rows={2}
                maxLength={500}
                aria-label="Comentario"
                className="input"
                style={{ height: 'auto', padding: '10px 14px', resize: 'none', lineHeight: 1.45 }}
              />
              {comentario.trim() && (
                <Button full onClick={() => void comentar()} disabled={enviando}>
                  {enviando ? 'Enviando…' : 'Enviar comentario'}
                </Button>
              )}
            </>
          )}
        </>
      )}
      <p className="t-meta">Tu nombre y lo que escribas solo los ve tu estudio.</p>
    </section>
  );
}

'use client';

import { useCallback, useState } from 'react';
import { useAsync } from '@/lib/student/useAsync';
import { enviarValoracion, getValoracionPendiente, type ValoracionPendiente } from '@/lib/student/valorar';
import { haceCuanto } from '@/lib/student/momento-inicio';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { useToast } from '@/components/student/ui/Toast';
import { Button } from '@/components/student/ui/Button';
import { vibrar } from '@/lib/nativo/puente';

// «¿Qué tal {clase} con {instructora}?» — arriba en Inicio durante las 24 h
// siguientes a una clase a la que ASISTIÓ y que aún no ha valorado (maqueta
// aprobada, oct-2026).
//
// Qué clase es lo dice el SERVIDOR (`getValoracionPendiente`): el catálogo de la
// app solo trae clases que aún no han terminado, así que desde aquí la clase a
// la que acaba de ir no se ve (era el fallo de la primera versión: la tarjeta no
// salía nunca).
//
// No es un sistema nuevo: es la MISMA valoración que la tarjeta del detalle de
// la reserva (`ValorarClase`), contra la misma puerta (`/api/public/valorar-clase`,
// que decide si se puede: solo tras asistir). Las cinco caras son la puntuación
// de 1 a 5 de siempre.
//
// Un toque: tocar una cara ENVÍA (una petición, y no deja una segunda mientras
// va). La frase es opcional y va después, con la MISMA nota: el servidor deja
// completar el comentario aunque haya cambiado el mes (`puedeActualizarValoracion`).
//
// ⚠️ «Tu nombre y lo que escribas solo los ve tu estudio», y no «no se publica»
// a secas, que sería mentira: la NOTA cuenta, sin nombre, en la media que la app
// enseña de cada instructora (`InstructorCard`). Lo que no sale nunca del
// estudio es quién la puso ni el comentario (la instructora tampoco los ve:
// `lib/student/valoraciones-instructora.ts`). Por eso el campo no dice
// «Cuéntale algo a {instructora}»: ella no lo va a leer.

const CARAS: { cara: string; texto: string }[] = [
  { cara: '😣', texto: 'Mal' },
  { cara: '😕', texto: 'Regular' },
  { cara: '🙂', texto: 'Bien' },
  { cara: '😊', texto: 'Muy bien' },
  { cara: '🤩', texto: '¡Increíble!' },
];

export function QueTalLaClase({ studioId }: { studioId: string }) {
  const cargar = useCallback(() => getValoracionPendiente(studioId), [studioId]);
  const { data } = useAsync<ValoracionPendiente | null>(cargar, (d) => !d);
  if (!data) return null;
  // `key`: si llega otra clase pendiente, la tarjeta empieza de cero.
  return <Tarjeta key={data.sesionId} studioId={studioId} p={data} />;
}

function Tarjeta({ studioId, p }: { studioId: string; p: ValoracionPendiente }) {
  const { toast } = useToast();
  const ahoraMs = useAhoraMs();
  const [enviada, setEnviada] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [comentario, setComentario] = useState('');
  const [comentada, setComentada] = useState(false);
  // Ya estaba valorada de antes: no se ofrece el comentario (lo pisaría).
  const [yaValorada, setYaValorada] = useState(false);
  // Lo que se anuncia. El contenedor `role="status"` está SIEMPRE montado: si
  // apareciera junto con el texto, VoiceOver no lo leería (y al desaparecer el
  // botón tocado, el foco se pierde). Así «¡Gracias!» se oye al enviarlo.
  const [anuncio, setAnuncio] = useState('');

  const valorar = async (puntuacion: number) => {
    if (enviando || enviada !== null) return;
    setEnviando(true);
    // Solo CREA: si ya la había valorado (desde el correo, otra pestaña…), el
    // servidor no pisa su nota ni su comentario y lo dice.
    const r = await enviarValoracion(studioId, p.sesionId, puntuacion, '', { soloSiNueva: true });
    setEnviando(false);
    if (!r.ok) { toast(r.error); return; }
    if (r.yaValorada) {
      setYaValorada(true);
      setEnviada(puntuacion);
      setAnuncio('Ya habías valorado esta clase. ¡Gracias!');
      return;
    }
    void vibrar('exito');
    setEnviada(puntuacion);
    setAnuncio(`${CARAS[puntuacion - 1].cara} ¡Gracias! Se lo hemos contado a tu estudio.`);
  };

  const comentar = async () => {
    if (enviando || enviada === null || !comentario.trim()) return;
    setEnviando(true);
    const r = await enviarValoracion(studioId, p.sesionId, enviada, comentario);
    setEnviando(false);
    // Si el servidor dice que no, se dice y el texto se queda escrito para
    // reintentarlo: nunca «enviado» sin que lo esté.
    if (!r.ok) { toast(r.error); return; }
    setComentada(true);
    setAnuncio('Comentario enviado. ¡Gracias!');
  };

  const titulo = `¿Qué tal ${p.clase}${p.instructora ? ` con ${p.instructora}` : ''}?`;
  return (
    <section
      className="card a-pop"
      data-testid="que-tal-la-clase"
      aria-label="Valorar tu última clase"
      style={{ padding: 'var(--s-4) var(--s-4) var(--s-3)', border: '1.5px solid var(--accent)', borderRadius: 'var(--radius-hero)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}
    >
      {enviada === null && (
        <>
          <div>
            {ahoraMs !== null && <p className="t-label" style={{ color: 'var(--accent)' }}>{haceCuanto(p.fin, ahoraMs)}</p>}
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
      )}

      <p role="status" className="t-card-title" style={anuncio ? undefined : { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {anuncio}
      </p>

      {enviada !== null && !comentada && !yaValorada && (
        <>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="¿Algo que quieras contar? (opcional)"
            rows={2}
            maxLength={500}
            aria-label="Comentario para tu estudio"
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
      <p className="t-meta">Tu nombre y lo que escribas solo los ve tu estudio.</p>
    </section>
  );
}

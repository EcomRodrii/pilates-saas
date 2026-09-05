'use client';

import { useCallback, useState } from 'react';
import { useAsync } from '@/lib/student/useAsync';
import { enviarValoracion, getValoracionClase, type EstadoValoracion } from '@/lib/student/valorar';
import { useToast } from '@/components/student/ui/Toast';
import { Button } from '@/components/student/ui/Button';

// «Valorar la clase ★» del detalle de reserva (paquete: mis-reservas/[bookingId]).
//
// El paquete lo dejaba en `toast('pendiente de backend')`. El backend que había
// solo valoraba por deep link de email; ahora hay puerta desde la app, y quien
// decide si se puede es el servidor (solo tras ASISTIDA). Esta tarjeta enseña
// lo que el servidor dice: si no se puede, no pinta estrellas muertas.

const ETIQUETA = ['', 'Mejorable', 'Regular', 'Bien', 'Muy bien', '¡Increíble!'];

export function ValorarClase({ studioId, sesionId, instructora }: { studioId: string; sesionId: string; instructora?: string }) {
  const { toast } = useToast();
  const cargar = useCallback(() => getValoracionClase(studioId, sesionId), [studioId, sesionId]);
  const { data, estado, reintentar } = useAsync<EstadoValoracion | null>(cargar, (d) => !d);
  const [puntuacion, setPuntuacion] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState('');
  const [editando, setEditando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  if (estado !== 'ready' || !data || !data.puedeValorar) return null;

  const previa = data.valoracion;
  const nivel = hover || puntuacion || (editando ? 0 : previa?.puntuacion ?? 0);

  const enviar = async () => {
    if (puntuacion < 1 || enviando) return;
    setEnviando(true);
    const r = await enviarValoracion(studioId, sesionId, puntuacion, comentario);
    setEnviando(false);
    if (!r.ok) { toast(r.error); return; }
    toast(r.actualizada ? 'Valoración actualizada. ¡Gracias!' : '¡Gracias por tu valoración!');
    setEditando(false);
    setPuntuacion(0);
    setComentario('');
    reintentar();
  };

  const soloLectura = !!previa && !editando;

  return (
    <section className="card" style={{ padding: '14px 15px' }} data-testid="valorar-clase" aria-label="Valorar la clase">
      <p className="t-label" style={{ margin: 0 }}>{soloLectura ? 'Tu valoración' : 'Valorar la clase'}</p>
      <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 800 }}>
        {soloLectura ? ETIQUETA[previa.puntuacion] : `¿Qué tal la clase${instructora ? ` con ${instructora}` : ''}?`}
      </p>

      <div style={{ display: 'flex', gap: 4, marginTop: 10 }} onMouseLeave={() => setHover(0)} role={soloLectura ? 'img' : undefined} aria-label={soloLectura ? `${previa.puntuacion} de 5 estrellas` : undefined}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n} type="button" aria-label={`${n} estrellas`} aria-pressed={!soloLectura && puntuacion === n}
            disabled={soloLectura || enviando}
            onClick={() => setPuntuacion(n)} onMouseEnter={() => { if (!soloLectura) setHover(n); }}
            style={{ width: 40, height: 40, border: 'none', background: 'transparent', padding: 0, cursor: soloLectura ? 'default' : 'pointer' }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden
              fill={n <= nivel ? 'var(--warning)' : 'none'} stroke={n <= nivel ? 'var(--warning)' : 'var(--border-strong)'} strokeWidth="1.6" strokeLinejoin="round">
              <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
            </svg>
          </button>
        ))}
      </div>

      {soloLectura ? (
        <>
          {previa.comentario && <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--muted-foreground)' }}>«{previa.comentario}»</p>}
          <button type="button" className="t-meta" onClick={() => { setEditando(true); setPuntuacion(previa.puntuacion); setComentario(previa.comentario ?? ''); }}
            style={{ marginTop: 8, padding: 0, border: 'none', background: 'none', fontWeight: 700, color: 'var(--primary)', cursor: 'pointer' }}>
            Cambiar mi valoración
          </button>
        </>
      ) : (
        <>
          <p className="t-meta" style={{ margin: '4px 0 0', minHeight: 16 }}>{ETIQUETA[nivel]}</p>
          <textarea
            value={comentario} onChange={(e) => setComentario(e.target.value)}
            placeholder="¿Algo que quieras contar? (opcional)" rows={2} maxLength={500} aria-label="Comentario"
            style={{ width: '100%', marginTop: 8, padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card)', fontFamily: 'inherit', fontSize: 13, color: 'var(--foreground)', resize: 'none' }}
          />
          <div style={{ marginTop: 10 }}>
            <Button full onClick={() => void enviar()} disabled={puntuacion < 1 || enviando}>
              {enviando ? 'Enviando…' : 'Enviar valoración'}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

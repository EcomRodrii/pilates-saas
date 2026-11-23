'use client';

import { useState } from 'react';

type Valoracion = 'MALO' | 'REGULAR' | 'BUENO';
type Voto = Valoracion | 'DESACTUALIZADA';

const OPCIONES: { valor: Valoracion; emoji: string; etiqueta: string }[] = [
  { valor: 'MALO', emoji: '😞', etiqueta: 'No' },
  { valor: 'REGULAR', emoji: '😐', etiqueta: 'Más o menos' },
  { valor: 'BUENO', emoji: '😃', etiqueta: 'Sí' },
];

// Botones REALES, no decorativos: al pulsar, escriben en ayuda_feedback vía
// app/api/ayuda/feedback (artículo, categoría, valoración y URL). Se consultan
// desde /interno/ayuda (permiso content.write) para saber qué artículos fallan.
export function AyudaFeedback({ categoria, articulo }: { categoria: string; articulo: string }) {
  const [enviado, setEnviado] = useState<Valoracion | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [desactualizada, setDesactualizada] = useState(false);

  async function votar(valor: Voto) {
    if (enviando) return;
    if (valor === 'DESACTUALIZADA' ? desactualizada : enviado) return;
    setEnviando(true);
    if (valor === 'DESACTUALIZADA') setDesactualizada(true); else setEnviado(valor); // optimista: es una valoración, no una escritura de dinero — no hace falta esperar para dar la sensación de "hecho".
    try {
      const res = await fetch('/api/ayuda/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria, articulo, valoracion: valor, url: window.location.pathname }),
      });
      // 19ª auditoría · F-11: se sigue sin molestar a quien solo quería opinar
      // (el "Gracias" optimista se queda), pero el fallo deja de ser invisible
      // PARA NOSOTROS. `ayuda_feedback` lleva 0 filas en producción desde que se
      // publicó el centro de ayuda, y con el `catch {}` vacío no había forma de
      // saber si es que nadie vota o es que ningún voto llega.
      if (!res.ok) {
        const { captureMessage } = await import('@sentry/nextjs');
        captureMessage('[ayuda/feedback] el voto no se ha guardado', {
          level: 'warning',
          extra: { categoria, articulo, valoracion: valor, status: res.status },
        });
      }
    } catch (e) {
      const { captureMessage } = await import('@sentry/nextjs');
      captureMessage('[ayuda/feedback] el voto no ha llegado al servidor', {
        level: 'warning',
        extra: { categoria, articulo, valoracion: valor, detalle: e instanceof Error ? e.message : String(e) },
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="ay-feedback">
      <span>¿Te ha ayudado este artículo?</span>
      {enviado ? (
        <span style={{ color: '#616161' }}>Gracias por decírnoslo.</span>
      ) : (
        <div className="ay-feedback-botones">
          {OPCIONES.map((o) => (
            <button key={o.valor} type="button" onClick={() => void votar(o.valor)} disabled={enviando}>{o.etiqueta}</button>
          ))}
        </div>
      )}
      <a className="ay-feedback-link" href={`mailto:soporte@tentare.app?subject=${encodeURIComponent(`Comentario sobre la guía ${categoria}/${articulo}`)}`}>Dejar comentario</a>
      {/* «Esta guía ya no describe lo que veo»: lo mismo que votar (misma tabla), con otro valor. Es lo que dice qué actualizar primero. */}
      <p className="ay-feedback-desact">
        {desactualizada ? 'Gracias: la revisaremos.' : (
          <button type="button" onClick={() => void votar('DESACTUALIZADA')} disabled={enviando}>Esta guía está desactualizada</button>
        )}
      </p>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { ACC, MUTED } from '@/components/landing/theme';

type Valoracion = 'MALO' | 'REGULAR' | 'BUENO';

const OPCIONES: { valor: Valoracion; emoji: string; etiqueta: string }[] = [
  { valor: 'MALO', emoji: '😞', etiqueta: 'No me ha ayudado' },
  { valor: 'REGULAR', emoji: '😐', etiqueta: 'Más o menos' },
  { valor: 'BUENO', emoji: '😃', etiqueta: 'Me ha ayudado' },
];

// Botones REALES, no decorativos: al pulsar, escriben en ayuda_feedback vía
// app/api/ayuda/feedback (artículo, categoría, valoración y URL). Se consultan
// desde /interno/ayuda (permiso content.write) para saber qué artículos fallan.
export function AyudaFeedback({ categoria, articulo }: { categoria: string; articulo: string }) {
  const [enviado, setEnviado] = useState<Valoracion | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function votar(valor: Valoracion) {
    if (enviando || enviado) return;
    setEnviando(true);
    setEnviado(valor); // optimista: es una valoración, no una escritura de dinero — no hace falta esperar para dar la sensación de "hecho".
    try {
      await fetch('/api/ayuda/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria, articulo, valoracion: valor, url: window.location.pathname }),
      });
    } catch {
      // Best-effort: si falla la red, no se molesta a quien solo quería dar su opinión.
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ borderTop: '1px solid #E7E7E0', marginTop: 40, paddingTop: 28, textAlign: 'center' }}>
      <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 14px', color: '#1A1A1A' }}>¿Te ha ayudado este artículo?</p>
      {enviado ? (
        <p className="lp-mono" style={{ fontSize: 13, color: MUTED }}>Gracias por decírnoslo.</p>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
          {OPCIONES.map((o) => (
            <button
              key={o.valor}
              type="button"
              aria-label={o.etiqueta}
              title={o.etiqueta}
              onClick={() => void votar(o.valor)}
              disabled={enviando}
              style={{
                fontSize: 26, lineHeight: 1, width: 52, height: 52, borderRadius: 16,
                border: '1px solid #E7E7E0', background: '#fff', cursor: enviando ? 'default' : 'pointer',
                opacity: enviando ? 0.6 : 1, transition: 'transform .15s, border-color .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACC; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E7E7E0'; e.currentTarget.style.transform = 'none'; }}
            >
              {o.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

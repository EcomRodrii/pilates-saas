'use client';

import { useEffect, useState } from 'react';

// Fichero propio y MÍNIMO a propósito: lo importa el compositor del Resumen (que viaja con el panel) y el chat
// (que no: `e2e/asistente*.spec.ts` vigilan que el texto del chat no esté en lo que se descarga antes de abrirlo).
// Importar `vista-chat.tsx` desde el Resumen metería todo el chat en el panel.

/**
 * El texto de ayuda que rota dentro del campo (marco a sangre, copiado del compositor de Shopify): cada
 * frase entra y sale con `filter: blur(6px) ↔ 0` y opacidad, 0,5 s `cubic-bezier(.25,.1,.25,1)`, y cambia
 * cada 4 s. Decorativo: el campo conserva su `placeholder` y su etiqueta para lectores de pantalla, y con
 * «reducir movimiento» se queda en la primera frase.
 */
const FRASES_DEL_CAMPO = ['Pregúntale a Tentare…', '¿Cuántos clientes activos tengo?', '¿Qué clases hay mañana?', '¿Qué debería revisar hoy?'];

export function TextoRotatorio({ visible }: { visible: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!visible || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI(v => (v + 1) % FRASES_DEL_CAMPO.length), 4000);
    return () => clearInterval(t);
  }, [visible]);
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {FRASES_DEL_CAMPO.map((frase, k) => (
        <span
          key={frase}
          className="absolute inset-x-0 top-0 flex h-10 items-center truncate px-0.5 text-[13px] text-[#757575] transition-[filter,opacity] duration-500 ease-(--pn-ease)"
          style={{ filter: visible && k === i ? 'blur(0)' : 'blur(6px)', opacity: visible && k === i ? 1 : 0 }}
        >
          {frase}
        </span>
      ))}
    </span>
  );
}


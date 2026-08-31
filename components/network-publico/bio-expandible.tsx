'use client';

// "Sobre mí" con protagonismo real — antes era un párrafo suelto de
// text-[15px] perdido entre tarjetas. Con textos largos, mostrarlo entero
// desde el principio empuja el resto del perfil muy abajo; con "Ver más" se
// respeta el ritmo editorial del resto de la pantalla sin cortar la
// biografía. El umbral (280 caracteres) es aproximado — no hay contrato de
// diseño exacto, solo "que quepan 3-4 líneas antes de plegar".
import { useState } from 'react';

const UMBRAL = 280;

export function BioExpandible({ texto, color, colorAccion }: { texto: string; color: string; colorAccion: string }) {
  const [expandido, setExpandido] = useState(false);
  const esLargo = texto.length > UMBRAL;
  const visible = expandido || !esLargo ? texto : `${texto.slice(0, UMBRAL).trimEnd()}…`;

  return (
    <div>
      <p className="text-[17px] leading-[1.75] max-w-[640px] whitespace-pre-line" style={{ color }}>
        {visible}
      </p>
      {esLargo && (
        <button
          type="button"
          onClick={() => setExpandido(v => !v)}
          className="mt-2 text-[13.5px] font-bold hover:opacity-70 transition-opacity"
          style={{ color: colorAccion }}
        >
          {expandido ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  );
}

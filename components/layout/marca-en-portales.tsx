'use client';

import { useEffect } from 'react';

// La marca del panel (`.marca-panel`, app/globals.css: tipografía y brand slot
// por defecto) también para lo que el panel abra en un portal a `document.body`,
// FUERA del envoltorio del layout, con la letra de siempre en mitad de un panel
// con la nueva.
//
// Ya no es el caso de los diálogos, popovers y tooltips de base-ui: desde
// octubre de 2026 van al anfitrión del panel (components/ui/destino-portal.tsx),
// dentro del envoltorio y de `.dark`, y anidados donde base-ui los anida. Esto
// queda de red para lo que todavía caiga en <body>. Se pone la clase en `body`
// mientras el panel está montado y se quita al salir, así que la app de la
// alumna, /reservar y la landing no la ven nunca.
export function MarcaEnPortales() {
  useEffect(() => {
    document.body.classList.add('marca-panel');
    return () => document.body.classList.remove('marca-panel');
  }, []);
  return null;
}

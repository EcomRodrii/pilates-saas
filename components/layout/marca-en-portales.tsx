'use client';

import { useEffect } from 'react';

// La marca del panel (`.marca-panel`, app/globals.css: tipografía y brand slot
// por defecto) también para lo que el panel abre en un portal a `document.body`:
// los diálogos y tooltips de base-ui van ahí por defecto y quedaban FUERA del
// envoltorio del layout, con la letra de siempre en mitad de un panel con la nueva.
//
// No se les cambia el `container` a esos portales: base-ui anida el portal de
// un popover dentro del de su diálogo, y sacarlo al anfitrión del panel
// (lib/panel-portal.ts) movería esa jerarquía. Se pone la clase en `body`
// mientras el panel está montado y se quita al salir, así que la app de la
// alumna, /reservar y la landing no la ven nunca.
export function MarcaEnPortales() {
  useEffect(() => {
    document.body.classList.add('marca-panel');
    return () => document.body.classList.remove('marca-panel');
  }, []);
  return null;
}

'use client';

import { useEffect } from 'react';

// La tipografía de la marca (`.tipografia-tentare`, app/globals.css) también
// para lo que el panel abre en un portal a `document.body`: los diálogos y
// tooltips de base-ui van ahí por defecto y quedaban FUERA del envoltorio del
// layout, con la letra de siempre en mitad de un panel con la nueva.
//
// No se les cambia el `container` a esos portales: base-ui anida el portal de
// un popover dentro del de su diálogo, y sacarlo al anfitrión del panel
// (lib/panel-portal.ts) movería esa jerarquía. Se pone la clase en `body`
// mientras el panel está montado y se quita al salir, así que la app de la
// alumna, /reservar y la landing no la ven nunca.
export function TipografiaEnPortales() {
  useEffect(() => {
    document.body.classList.add('tipografia-tentare');
    return () => document.body.classList.remove('tipografia-tentare');
  }, []);
  return null;
}

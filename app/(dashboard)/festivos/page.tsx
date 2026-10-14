'use client';

import { PantallaFestivos } from '@/components/festivos/pantalla-festivos';

// Festivos — módulo del panel nuevo (14-oct-2026, pedido del fundador: «otro
// módulo que se pueda activar o desactivar que sea Festivos, como el de Bonsai,
// incluso con los fuegos artificiales»). Solo existe con el panel nuevo: el
// menú lo añade con `seccionesDelMenu(panelNuevo)` (lib/nav-panel-nuevo.ts) y
// cada ruta de su API contesta 404 sin él. La pantalla no redirige nada: si el
// servidor dice que no está, lo dice ella (el interruptor del navegador llega
// medio segundo tarde y echaría a quien sí lo tiene).
// Recepción no entra (BLOQUEADO_RECEPCION): decidir un festivo es abrir o cerrar.
export default function FestivosPage() {
  return <PantallaFestivos />;
}

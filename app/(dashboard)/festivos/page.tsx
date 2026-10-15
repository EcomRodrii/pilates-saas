'use client';

import { PantallaFestivos } from '@/components/festivos/pantalla-festivos';

// Festivos (14-oct-2026, pedido del fundador: «otro módulo que se pueda activar
// o desactivar que sea Festivos, como el de Bonsai, incluso con los fuegos
// artificiales»). Nació tras el panel nuevo y ese mismo día pasó a todos los
// estudios: está en el menú (grupo Estudio) y se quita desde «Tu menú» o
// Módulos. Si su API contesta 404 (la tabla sin migrar), la pantalla lo dice.
// Recepción no entra (BLOQUEADO_RECEPCION): decidir un festivo es abrir o cerrar.
export default function FestivosPage() {
  return <PantallaFestivos />;
}

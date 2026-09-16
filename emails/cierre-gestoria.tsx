import { correoCierreGestoria } from '@/lib/emails/tentare/equipo';
import { MARCA } from './_muestra';

// Familia Tentare (lib/emails/tentare/). Ver la nota de emails/reserva.tsx.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoCierreGestoria({ estudioNombre: MARCA.estudioNombre, anio: 2026, trimestre: 3, nombreAdjunto: 'cierre-2026-T3-libro-facturas.csv', totales: { base: 8264.46, cuota: 1735.54, total: 10000, numFacturas: 212, numManuales: 3 }, trimestres: [{ trimestre: 3, base: 8264.46, cuota: 1735.54, total: 10000 }] }) }} />
);

export default Preview;

import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        Tus alumnas no instalan ninguna app de tienda de aplicaciones: entran desde el navegador a{' '}
        <Link href="/ayuda/portal/que-es-el-portal" style={{ color: 'inherit', textDecoration: 'underline' }}>su portal</Link>, pensado para móvil desde el primer diseño, y pueden añadirlo a su pantalla de inicio como si fuera una app.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Qué encuentra ahí</h2>
      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.6 }}>
        <li>Su próxima clase reservada, con opción de cancelar dentro del plazo permitido.</li>
        <li>Su plan o bono activo y cuántas sesiones le quedan.</li>
        <li>Su historial de clases.</li>
        <li>Créditos, logros y nivel, si tu estudio tiene activada la gamificación.</li>
      </ul>

      <AyudaResultado>
        Es el mismo portal para reservar y para gestionar su cuenta — no hay una app aparte con menos funciones.
      </AyudaResultado>
    </>
  );
}

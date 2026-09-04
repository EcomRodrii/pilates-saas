import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>Tentare tiene cuatro roles. Cada uno ve un panel pensado para lo que necesita hacer, no una versión recortada del mismo panel para todos.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '20px 0' }}>
        {[
          ['Propietaria', 'Control total: puede ver y editar todo, incluida la facturación y los datos del estudio.'],
          ['Responsable de sede', 'Lleva el día a día de la sede: horario, clientas, lista de espera, sustituciones y equipo. No ve facturación ni informes de ingresos, y no puede dar acceso de propietaria a nadie.'],
          ['Recepción', 'Reservas, clientas, cobros y caja — sin acceso a marketing, informes ni ajustes del negocio. En la ficha de salud solo ve el semáforo de color, nunca el detalle clínico.'],
          ['Instructora', 'Su propio panel (Tentare Core): sus clases, su disponibilidad, sus alumnas. Puede editar sus propias clases, pero no las de otra instructora, ni tocar facturación.'],
        ].map(([rol, texto]) => (
          <div key={rol} style={{ border: '1px solid #E7E7E0', borderRadius: 14, padding: '14px 18px' }}>
            <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>{rol}</p>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: '#5A5A52', margin: 0 }}>{texto}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Por qué la ficha de salud es distinta</h2>
      <p>
        Es el único dato con una regla de visibilidad propia, más estricta que el resto: propietaria e instructoras
        ven el detalle completo (lesiones, zonas, adaptaciones); recepción ve solo si hay algo a tener en cuenta
        (un semáforo de color), nunca el motivo. Es un dato de salud, no un dato de gestión.
      </p>

      <AyudaResultado>
        Los permisos se aplican también en el servidor, no solo en lo que se pinta en pantalla — cambiar el rol de
        alguien cambia de verdad lo que puede hacer, no solo lo que ve.
      </AyudaResultado>
    </>
  );
}

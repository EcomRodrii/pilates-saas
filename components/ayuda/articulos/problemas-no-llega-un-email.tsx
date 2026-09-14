import Link from 'next/link';
import { QueEstaPasando, CausasComunes, ComoSolucionarlo } from '@/components/ayuda/TroubleshootShell';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <QueEstaPasando>
        Un email que Tentare debería haber enviado (recordatorio de clase, enlace de acceso, factura)
        no ha llegado.
      </QueEstaPasando>

      <CausasComunes items={[
        'Ha caído en spam o en la pestaña de "Promociones" de Gmail.',
        'La dirección guardada tiene una errata (un punto, una letra de más).',
        'El dominio de quien lo recibe bloquea remitentes que no conoce todavía — pasa sobre todo la primera vez que se le escribe.',
        'El envío falló por el lado de nuestro proveedor de email — poco frecuente, pero posible.',
      ]} />

      <ComoSolucionarlo>
        <p style={{ margin: '0 0 12px' }}>Pide que revise spam y promociones antes que nada — es la causa más común, con diferencia.</p>
        <p style={{ margin: '0 0 12px' }}>Mira su ficha: si el correo rebotó, sale un aviso con el motivo. Comprueba que el email guardado está bien escrito y corrígelo en «Editar».</p>
        <p style={{ margin: 0 }}>Si es un correo repetitivo (recordatorios, por ejemplo) que nunca llega a esa persona en concreto, prueba a que marque tu remitente como seguro o añada tu dirección a sus contactos.</p>
      </ComoSolucionarlo>

      <AyudaResultado>
        El recordatorio de clase sigue esta misma vía de email; los avisos de bono llegan en su app — ver{' '}
        <Link href="/ayuda/automatizaciones/recordatorios-automaticos" style={{ color: 'inherit', textDecoration: 'underline' }}>recordatorios automáticos</Link>.
      </AyudaResultado>
    </>
  );
}

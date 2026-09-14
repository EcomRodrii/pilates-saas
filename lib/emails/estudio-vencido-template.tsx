import { Text } from '@react-email/components';
import { EmailLayout, EmailButton } from '@/lib/emails/layout';

// Aviso a la PROPIETARIA de un estudio cuya prueba venció sin pagar: sus datos
// se conservan hasta una fecha y después se borran (ciclo de
// lib/retencion/ciclo-estudios-vencidos.ts). Marca Tentare, no la del estudio:
// quien escribe es el proveedor del servicio.
interface Props {
  fase: 'aviso_30' | 'aviso_final';
  estudioNombre: string;
  /** Ya formateada («24 de noviembre de 2026»). */
  fechaPurga: string;
  /**
   * ¿Está ARMADO el borrado automático (`PURGA_ESTUDIOS_VENCIDOS=activa`)?
   *
   * Importa porque el texto lo lee una persona real y es una declaración sobre
   * SUS datos: con el interruptor apagado, «el 24 de noviembre borraremos» es
   * falso — ese día solo se calcula un informe (`avanzar-ciclo-estudios-
   * vencidos.ts`, rama `modo: 'informe'`). Prometer un borrado que no ocurre
   * es tan malo como borrar sin avisar, y el primer correo de este ciclo sale
   * el 25-sep-2026 a una propietaria real.
   */
  purgaArmada: boolean;
  urlSuscripcion: string;
  urlExportar: string;
}

export function EstudioVencidoEmail({ fase, estudioNombre, fechaPurga, purgaArmada, urlSuscripcion, urlExportar }: Props) {
  const final = fase === 'aviso_final';
  return (
    <EmailLayout
      studioNombre="Tentare"
      headerColor={final ? '#B91C1C' : undefined}
      titulo={final ? 'Último aviso sobre los datos de tu estudio' : 'Tus datos se conservarán hasta una fecha'}
      preview={`Datos de ${estudioNombre}: se conservarán hasta el ${fechaPurga}`}
    >
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 16px' }}>
        Hola, la prueba gratuita de <strong>{estudioNombre}</strong> terminó y el estudio no tiene un plan activo.
        {final
          ? purgaArmada
            // Lo que de verdad borra `purgar_estudio_vencido`: los datos de las
            // clientas y del equipo. La cuenta de la propietaria y las facturas
            // se conservan, así que no se le puede decir «del estudio» a secas.
            ? <> Es el último aviso: el <strong>{fechaPurga}</strong> borraremos los datos personales de tus
              clientas y de tu equipo (notas, mensajes y copias de seguridad incluidas).</>
            : <> A partir del <strong>{fechaPurga}</strong> los datos personales de tus clientas y de tu equipo
              quedan listos para borrarse.</>
          : <> Conservaremos sus datos hasta el <strong>{fechaPurga}</strong>. Desde hoy ya no hacemos copias de
            seguridad nuevas del estudio.</>}
      </Text>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 16px' }}>
        Si quieres seguir, elige un plan y todo quedará como estaba. Si no, puedes descargar tus datos antes de esa fecha.
      </Text>
      <EmailButton href={urlSuscripcion}>Elegir un plan</EmailButton>
      <Text style={{ color: '#6B7280', fontSize: 13, margin: '16px 0 0' }}>
        Para descargar tus datos (un CSV por tabla, sin ficha clínica), entra con tu cuenta en{' '}
        <a href={urlExportar} style={{ color: '#374151' }}>Exportar datos del estudio</a>.
        Los datos que la ley obliga a guardar, como las facturas, se conservan durante el plazo legal.
      </Text>
    </EmailLayout>
  );
}

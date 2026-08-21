import { Text, Section, Hr, Button } from '@react-email/components';
import { EmailLayout, EmailInfoRow } from '@/lib/emails/layout';

interface Props {
  socioNombre: string;
  claseNombre: string;
  fecha: string;
  hora: string;
  sala: string;
  instructor: string;
  estudioNombre?: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  /**
   * Sesiones que le quedan en el bono que pagó y NO llegó a gastar en esta
   * clase (la lista de espera nunca consume bono). `1` es el caso delicado:
   * compró una clase suelta, así que el "crédito" es el importe entero de lo
   * que pagó — por eso ahí, y solo ahí, se le ofrece la devolución.
   */
  sesionesRestantes: number;
  /**
   * Hasta cuándo puede gastarlo (`suscripciones.fecha_fin`, ya formateado).
   * `null` = sin caducidad. ⚠️ Se pasa en vez de afirmar «no caduca»: hoy los
   * planes de clase suelta de producción tienen `validez_dias` a NULL, pero eso
   * lo decide cada estudio y el correo no puede prometer lo contrario.
   */
  caducaEl?: string | null;
  /** Horario público del estudio (`/reservar/<slug>`), para que lo gaste. */
  urlHorario?: string | null;
  /** Dirección del estudio, para pedir la devolución contestando. */
  emailEstudio?: string | null;
}

// Cierre honesto de la promesa que le hizo la pantalla de pago: «te avisaremos
// si se libera un sitio». Si nunca se liberó, ese aviso nunca llega y la socia
// se queda esperando un correo que no existe. Este ES ese correo.
//
// Va por Resend (email transaccional), no por el Notification Engine: quien
// paga desde el widget sin cuenta no tiene `auth_user_id`, así que no tiene
// in-app ni push, y `PREF_DEFECTO.email` es `false` — un evento del motor le
// nacería muerto. Mismo motivo por el que `notificarPromocionEspera` manda el
// email de promoción a mano.
export function EsperaSinPlazaEmail({
  socioNombre,
  claseNombre,
  fecha,
  hora,
  sala,
  instructor,
  estudioNombre = 'Tentare',
  logoUrl,
  colorPrimario,
  sesionesRestantes,
  caducaEl,
  urlHorario,
  emailEstudio,
}: Props) {
  const claseSuelta = sesionesRestantes <= 1;
  const color = colorPrimario || '#343825';

  return (
    <EmailLayout
      studioNombre={estudioNombre}
      logoUrl={logoUrl}
      colorPrimario={colorPrimario}
      headerColor="#8F6215"
      titulo="No se liberó sitio"
      preview={
        claseSuelta
          ? `Tu clase de ${claseNombre} se llenó — tu pago sigue disponible`
          : `No se liberó sitio en ${claseNombre}, pero tu bono está intacto`
      }
    >
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 24px' }}>
        Hola <strong>{socioNombre}</strong>, al final no se liberó ningún sitio en{' '}
        <strong>{claseNombre}</strong> y la clase ya ha pasado.
      </Text>

      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
        <Text style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>
          {claseNombre}
        </Text>
        <Hr style={{ borderColor: '#E5E1DA', margin: '0 0 16px' }} />
        <EmailInfoRow label="Fecha" value={fecha} />
        <EmailInfoRow label="Hora" value={hora} />
        <EmailInfoRow label="Sala" value={sala} />
        <EmailInfoRow label="Instructora" value={instructor} />
      </Section>

      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 20px' }}>
        {claseSuelta ? (
          <>
            Tu pago no se ha perdido: tienes <strong>una sesión disponible</strong> en{' '}
            {estudioNombre}, que puedes gastar en cualquier clase del horario
            {caducaEl ? <> hasta el <strong>{caducaEl}</strong></> : null}.
          </>
        ) : (
          <>
            Tu bono no se ha tocado: te quedan{' '}
            <strong>{sesionesRestantes} sesiones</strong>
            {caducaEl ? <>, y puedes usarlas hasta el <strong>{caducaEl}</strong></> : <> para usar cuando quieras</>}.
          </>
        )}
      </Text>

      {urlHorario && (
        <Section style={{ margin: '0 0 20px' }}>
          <Button
            href={urlHorario}
            style={{
              backgroundColor: color, color: '#fff', borderRadius: 10,
              padding: '12px 22px', fontSize: 15, fontWeight: 700, textDecoration: 'none',
            }}
          >
            Ver el horario
          </Button>
        </Section>
      )}

      {claseSuelta && (
        <Text style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
          Y si prefieres que te devolvamos el dinero, contéstanos a este correo
          {emailEstudio ? <> o escríbenos a <strong>{emailEstudio}</strong></> : null} y lo
          hacemos — sin explicaciones.
        </Text>
      )}
    </EmailLayout>
  );
}

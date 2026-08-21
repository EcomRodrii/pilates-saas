import { Text, Section, Hr } from '@react-email/components';
import type { CanalResuelto } from '@/lib/canales-estudio';
import { EmailLayout, EmailButton } from '@/lib/emails/layout';
import { PlantillaEditableEmail, type PersonalizacionPlantilla } from '@/lib/emails/cuerpo-editable';

interface Props {
  socioNombre: string;
  planNombre?: string;
  estudioNombre?: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  // Web y redes del estudio para el pie (MarcaEstudio.canales) — ver lib/canales-estudio.ts.
  canales?: CanalResuelto[];
  intro?: string; // texto de introducción personalizado por el estudio
  // Enlace de acceso directo al portal (magic link de Supabase, generado en
  // app/api/emails/send). Sin él (Resend/Supabase Admin no disponibles), el
  // email se manda igual, solo sin el botón — ver generarEnlaceAccesoSocia.
  url?: string;
  // Personalización total del estudio (plantillas_email).
  personalizacion?: PersonalizacionPlantilla;
}

export function BienvenidaEmail({
  socioNombre,
  planNombre,
  estudioNombre = 'Tentare',
  logoUrl,
  colorPrimario,
  canales,
  intro,
  url,
  personalizacion,
}: Props) {
  if (personalizacion?.cuerpo) {
    return (
      <PlantillaEditableEmail
        estudioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} canales={canales}
        personalizacion={{ ...personalizacion, cuerpo: personalizacion.cuerpo }}
        preview={`Ya eres parte de ${estudioNombre}`}
        filas={planNombre ? [{ label: 'Tu plan', value: planNombre }] : []}
        boton={url ? { href: url, texto: 'Activar mi acceso' } : undefined}
      />
    );
  }

  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} canales={canales} titulo="¡Bienvenida! 🎉" preview={`Ya eres parte de ${estudioNombre}`}>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>
        {intro ?? <>Hola <strong>{socioNombre}</strong>, estamos encantadas de tenerte en {estudioNombre}.</>}
      </Text>

      {planNombre && (
        <Section style={{ backgroundColor: '#F1F2EA', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
          {/* Etiqueta en gris, no en el color del estudio: es la ÚNICA vez que
              colorPrimario se usaba como color de TEXTO, y con una marca pastel
              (un rosa claro) quedaba ilegible sobre esta tarjeta gris. El color
              del estudio se ve en la banda y en el botón, donde no tiene que
              competir con un fondo claro. Mismo gris que EmailInfoRow. */}
          <Text style={{ color: '#63635D', fontSize: 11.5, fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>
            Tu plan
          </Text>
          <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700, margin: 0 }}>
            {planNombre}
          </Text>
        </Section>
      )}

      <Text style={{ color: '#374151', fontSize: 14, lineHeight: 1.7, margin: '0 0 24px' }}>
        Ya puedes reservar tus clases. Si tienes alguna duda, no dudes en escribirnos.
      </Text>

      {url && (
        <>
          <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
            <Text style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              Este enlace es tuyo: entra directamente y pon tu contraseña, sin buscar nada más.
            </Text>
          </Section>
          <EmailButton href={url} colorPrimario={colorPrimario}>Activar mi acceso</EmailButton>
        </>
      )}

      <Hr style={{ borderColor: '#E5E1DA', margin: '20px 0' }} />

      <Text style={{ color: '#63635D', fontSize: 13, margin: 0 }}>
        Con cariño, el equipo de {estudioNombre}
      </Text>
    </EmailLayout>
  );
}

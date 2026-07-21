import {
  Html, Head, Body, Container, Section, Text, Img, Heading, Font, Preview,
} from '@react-email/components';
import { foregroundParaFondo } from '@/lib/wcag-contrast';

// ─────────────────────────────────────────────────────────────────────────────
// Plantilla base compartida por TODOS los emails del producto (transaccionales,
// automatizaciones, sustituciones, valoraciones, confirmación de riesgo...).
// Antes cada módulo repetía su propio Container/Section (3 estilos distintos:
// React Email genérico #111827, y dos familias de HTML a mano en #6D28D9)
// — ninguno usaba el logo ni el color real del estudio. Este layout:
//   1. Da un único look premium consistente en todo el producto.
//   2. Aplica la marca de CADA estudio (logo + colorPrimario), con fallback al
//      logo/morado de Tentare si el estudio no tiene los suyos.
//   3. Calcula el color de texto del header con WCAG (foregroundParaFondo) para
//      que un colorPrimario claro (p.ej. un rosa pastel) nunca deje texto
//      blanco ilegible — el mismo criterio que ya usa el editor de tema.
// ─────────────────────────────────────────────────────────────────────────────

export const TENTARE_LOGO_URL = 'https://tentare.app/logo-horizontal.png';
export const COLOR_PRIMARIO_DEFECTO = '#6D28D9';

interface EmailLayoutProps {
  studioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  // Para estados con significado propio (cancelación=rojo, plaza liberada=verde,
  // impago definitivo=rojo) que no deben depender del color de marca del
  // estudio. Si no se pasa, el header usa colorPrimario.
  headerColor?: string;
  titulo: string;
  // Texto corto que Gmail/Apple Mail muestran junto al asunto en la bandeja.
  preview?: string;
  children: React.ReactNode;
}

export function EmailLayout({
  studioNombre,
  logoUrl,
  colorPrimario,
  headerColor,
  titulo,
  preview,
  children,
}: EmailLayoutProps) {
  const primario = colorPrimario || COLOR_PRIMARIO_DEFECTO;
  const fondoHeader = headerColor || primario;
  const textoHeader = foregroundParaFondo(fondoHeader);
  const textoHeaderSuave = textoHeader === '#FFFFFF' ? 'rgba(255,255,255,0.75)' : 'rgba(19,19,19,0.65)';

  return (
    <Html lang="es">
      <Head>
        <Font fontFamily="Plus Jakarta Sans" fallbackFontFamily="Arial" />
      </Head>
      {preview && <Preview>{preview}</Preview>}
      <Body style={{ backgroundColor: '#EEEEE8', fontFamily: "'Plus Jakarta Sans', system-ui, 'Segoe UI', Arial, sans-serif", margin: 0, padding: '40px 0' }}>
        <Container style={{ maxWidth: 520, margin: '0 auto', backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden', border: '1px solid #E5E1DA' }}>
          <Section style={{ backgroundColor: fondoHeader, padding: '28px 32px' }}>
            {logoUrl ? (
              <Img src={logoUrl} height="28" alt={studioNombre} style={{ marginBottom: 10 }} />
            ) : (
              <Text style={{ color: textoHeaderSuave, fontSize: 13, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>
                {studioNombre}
              </Text>
            )}
            <Heading as="h1" style={{ color: textoHeader, fontSize: 22, fontWeight: 700, margin: '6px 0 0', letterSpacing: '-0.02em' }}>
              {titulo}
            </Heading>
          </Section>

          <Section style={{ padding: '28px 32px' }}>
            {children}
          </Section>

          <Section style={{ borderTop: '1px solid #E5E1DA', padding: '20px 32px', backgroundColor: '#FAFAF7' }}>
            <Text style={{ color: '#9C9C94', fontSize: 12, margin: 0, textAlign: 'center' as const }}>
              Enviado por {studioNombre} · Powered by Tentare · {new Date().getFullYear()}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Botón de acción compartido (sustituciones, valoraciones, confirmación de
// riesgo...): mismo color de marca que el header, con su propio cálculo de
// contraste — el estudio puede tener un colorPrimario distinto del header
// semántico (p.ej. alerta roja) y el botón sigue usando la marca real.
export function EmailButton({ href, children, colorPrimario }: { href: string; children: React.ReactNode; colorPrimario?: string | null }) {
  const fondo = colorPrimario || COLOR_PRIMARIO_DEFECTO;
  const texto = foregroundParaFondo(fondo);
  return (
    <a
      href={href}
      style={{
        display: 'block', textAlign: 'center' as const, backgroundColor: fondo, color: texto,
        textDecoration: 'none', fontSize: 16, fontWeight: 700, padding: '14px', borderRadius: 12,
      }}
    >
      {children}
    </a>
  );
}

// Tarjeta de detalle (fecha/hora/sala/instructora...) reutilizada por las
// plantillas de clase (reserva, recordatorio, cancelación, promoción de espera).
export function EmailInfoRow({ label, value, tachado }: { label: string; value: string; tachado?: boolean }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: 10 }}>
      <tbody>
        <tr>
          <td style={{ width: 100, verticalAlign: 'top' }}>
            <Text style={{ color: '#9C9C94', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: 0 }}>
              {label}
            </Text>
          </td>
          <td>
            <Text style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600, margin: 0, textDecoration: tachado ? 'line-through' : 'none' }}>
              {value}
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

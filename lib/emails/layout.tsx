import {
  Html, Head, Body, Container, Section, Text, Img, Heading, Font, Preview,
} from '@react-email/components';
import { foregroundParaFondo } from '@/lib/wcag-contrast';
import { LEGAL } from '@/lib/legal-info';
import type { CanalResuelto } from '@/lib/canales-estudio';

// ─────────────────────────────────────────────────────────────────────────────
// Plantilla base compartida por TODOS los emails del producto (transaccionales,
// automatizaciones, sustituciones, valoraciones, confirmación de riesgo...).
// Antes cada módulo repetía su propio Container/Section (3 estilos distintos:
// React Email genérico #111827, y dos familias de HTML a mano en #343825)
// — ninguno usaba el logo ni el color real del estudio. Este layout:
//   1. Da un único look consistente en todo el producto.
//   2. Aplica la marca de CADA estudio (logo + colorPrimario), con fallback al
//      color de Tentare si el estudio no tiene el suyo.
//   3. El color del estudio NO es fondo de texto en ninguna parte: va en la
//      banda de membrete y en el botón. Un colorPrimario pastel dejaba de ser
//      un problema de contraste en vez de algo que hay que compensar. Donde sí
//      hace falta —el texto DENTRO del botón— sigue mandando
//      foregroundParaFondo, el mismo criterio que usa el editor de tema.
// ─────────────────────────────────────────────────────────────────────────────

// Sin consumidores hoy. Sale de LEGAL.url, que ya lleva www — importa aquí más
// que en ninguna parte: hay proxys de imágenes de correo que no siguen el 308
// del ápice y dejarían el logo roto. Este fichero fue durante un tiempo el
// ÚNICO sitio del repo que tenía esto en cuenta.
export const TENTARE_LOGO_URL = `${LEGAL.url}/logo-horizontal.png`;
export const COLOR_PRIMARIO_DEFECTO = '#343825';

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
  // Personalización por plantilla (plantillas_email). Ausente = como siempre.
  // La familia sale de una lista cerrada de fuentes seguras en correo, validada
  // en la app y con CHECK en la BD: aquí solo se pinta.
  fuente?: string | null;
  // Pie propio del estudio. Ausente = "Enviado por X · Powered by Tentare · año".
  pie?: React.ReactNode;
  // Canales del estudio (web y redes), ya resueltos a enlaces seguros por
  // `canalesDelEstudio()` — llegan en `MarcaEstudio.canales` y las plantillas
  // los pasan tal cual. Se pintan DEBAJO del pie, no en su lugar: el pie dice
  // quién manda el correo, esto dice dónde encontrar al estudio. Vacío o
  // ausente = el correo de siempre, sin una línea más.
  canales?: CanalResuelto[];
  children: React.ReactNode;
}

export function EmailLayout({
  studioNombre,
  logoUrl,
  colorPrimario,
  headerColor,
  titulo,
  preview,
  fuente,
  pie,
  canales,
  children,
}: EmailLayoutProps) {
  const primario = colorPrimario || COLOR_PRIMARIO_DEFECTO;
  const fondoHeader = headerColor || primario;
  const familia = fuente || 'Plus Jakarta Sans';

  return (
    <Html lang="es">
      <Head>
        <Font fontFamily={familia} fallbackFontFamily="Arial" />
      </Head>
      {preview && <Preview>{preview}</Preview>}
      <Body style={{ backgroundColor: '#EEEEE8', fontFamily: `'${familia}', system-ui, 'Segoe UI', Arial, sans-serif`, margin: 0, padding: '40px 0' }}>
        <Container style={{ maxWidth: 560, margin: '0 auto', backgroundColor: '#ffffff', borderRadius: 18, overflow: 'hidden', border: '1px solid #E5E1DA' }}>
          {/* El color del estudio va en una banda de membrete, no en una franja
              sólida con texto encima. Dos motivos: un colorPrimario pastel
              obligaba a jugar con foregroundParaFondo para que el título se
              leyera, y el logo del estudio está diseñado para su propio fondo,
              no para flotar sobre su color de marca. Aquí el color se ve igual
              de claro —es lo primero del correo— pero nunca es fondo de texto.
              Con headerColor (cancelación, impago, plaza liberada) la banda
              sigue dando el aviso de un vistazo. */}
          <Section style={{ backgroundColor: fondoHeader, height: 6, lineHeight: '6px', fontSize: 0 }}>&nbsp;</Section>

          <Section style={{ padding: '30px 34px 0' }}>
            {logoUrl ? (
              <Img src={logoUrl} height="32" alt={studioNombre} style={{ display: 'block', marginBottom: 22 }} />
            ) : (
              <Text style={{ color: '#63635D', fontSize: 12, fontWeight: 700, margin: '0 0 20px', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                {studioNombre}
              </Text>
            )}
            {/* Vacío a propósito cuando la propietaria escribe el cuerpo entero:
                ahí el titular es suyo y lo pone con un `# Título` en el
                Markdown. Dejar además este H1 fijo daría dos títulos. */}
            {titulo !== '' && (
              <Heading as="h1" style={{ color: '#1A1A1A', fontSize: 26, fontWeight: 700, margin: 0, lineHeight: 1.22, letterSpacing: '-0.025em' }}>
                {titulo}
              </Heading>
            )}
          </Section>

          <Section style={{ padding: '18px 34px 30px' }}>
            {children}
          </Section>

          <Section style={{ borderTop: '1px solid #E5E1DA', padding: '18px 34px', backgroundColor: '#FAFAF7' }}>
            {/* Antes iba en gris claro: 2,76:1 sobre este fondo, no llegaba a AA. */}
            <Text style={{ color: '#63635D', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              {pie ?? <>Enviado por {studioNombre} · Powered by Tentare · {new Date().getFullYear()}</>}
            </Text>
            {/* Enlaces de texto y no iconos: los clientes de correo bloquean
                imágenes por defecto, y una fila de iconos bloqueados es una
                fila de cuadros rotos. `target="_blank"` no se pone porque en un
                correo no significa nada. */}
            {canales && canales.length > 0 && (
              <Text style={{ color: '#63635D', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
                {canales.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && ' · '}
                    <a href={c.href} style={{ color: '#63635D', textDecoration: 'underline' }}>{c.label}</a>
                  </span>
                ))}
              </Text>
            )}
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
  // Píldora y no bloque a todo el ancho: es la forma que usa la app entera
  // (rounded-full en el panel, borderRadius:999 en la landing), y un botón que
  // ocupa la línea completa es justo lo que hace que un correo parezca una
  // plantilla de catálogo. Envuelto en tabla porque Outlook ignora el padding
  // de un <a> suelto.
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
      <tbody>
        <tr>
          <td style={{ backgroundColor: fondo, borderRadius: 999 }}>
            <a
              href={href}
              style={{
                display: 'inline-block', backgroundColor: fondo, color: texto, borderRadius: 999,
                textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '15px 32px',
                letterSpacing: '-0.01em',
              }}
            >
              {children}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// Tarjeta de detalle (fecha/hora/sala/instructora...) reutilizada por las
// plantillas de clase (reserva, recordatorio, cancelación, promoción de espera).
export function EmailInfoRow({ label, value, tachado }: { label: string; value: string; tachado?: boolean }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: 10 }}>
      <tbody>
        <tr>
          <td style={{ width: 104, verticalAlign: 'top', paddingTop: 1 }}>
            {/* Antes iba en gris claro (2,76:1): una etiqueta de 12px que no se leía. */}
            <Text style={{ color: '#63635D', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', margin: 0 }}>
              {label}
            </Text>
          </td>
          <td>
            <Text style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600, margin: 0, lineHeight: 1.35, textDecoration: tachado ? 'line-through' : 'none' }}>
              {value}
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

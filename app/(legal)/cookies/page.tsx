import type { Metadata } from 'next';
import { LEGAL } from '@/lib/legal-info';

export const metadata: Metadata = {
  title: 'Política de cookies · Tentare',
  description: 'Qué cookies utiliza tentare.app y cómo gestionarlas.',
};

export default function Cookies() {
  return (
    <>
      <h1>Política de cookies</h1>
      <p className="lead">Qué cookies y tecnologías similares utiliza {LEGAL.dominio} y cómo puedes gestionarlas.</p>

      <h2>1. Qué son las cookies</h2>
      <p>
        Una cookie es un pequeño archivo que un sitio web guarda en tu dispositivo para recordar información
        entre páginas o visitas. Usamos cookies propias y de terceros con las finalidades que se describen a
        continuación.
      </p>

      <h2>2. Cookies que utilizamos</h2>
      <table>
        <thead>
          <tr><th>Tipo</th><th>Finalidad</th><th>¿Requiere consentimiento?</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Técnicas o necesarias</td>
            <td>Mantener tu sesión iniciada, la seguridad y el funcionamiento básico de la aplicación (autenticación).</td>
            <td>No (imprescindibles)</td>
          </tr>
          <tr>
            <td>De terceros — pagos</td>
            <td>Nuestro proveedor de pagos (Stripe) puede establecer cookies durante el proceso de cobro para prevenir el fraude.</td>
            <td>No cuando son necesarias para el servicio solicitado</td>
          </tr>
          <tr>
            <td>De terceros — diagnóstico</td>
            <td>Monitorización de errores (Sentry) para detectar y corregir fallos del servicio.</td>
            <td>Según su configuración</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>No utilizamos cookies de publicidad ni de perfilado con fines comerciales de terceros.</strong>{' '}
        Si en el futuro incorporásemos cookies analíticas o de marketing no necesarias, se solicitaría tu
        consentimiento previo mediante un mecanismo de gestión de cookies.
      </p>

      <h2>3. Cómo gestionarlas</h2>
      <p>
        Puedes permitir, bloquear o eliminar las cookies configurando tu navegador. Ten en cuenta que
        deshabilitar las cookies técnicas puede impedir el inicio de sesión y el funcionamiento correcto de la
        plataforma. Enlaces de ayuda de los navegadores más comunes:
      </p>
      <ul>
        <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Google Chrome</a></li>
        <li><a href="https://support.mozilla.org/es/kb/Borrar%20cookies" target="_blank" rel="noopener noreferrer">Mozilla Firefox</a></li>
        <li><a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a></li>
        <li><a href="https://support.microsoft.com/es-es/microsoft-edge" target="_blank" rel="noopener noreferrer">Microsoft Edge</a></li>
      </ul>

      <h2>4. Más información</h2>
      <p>
        El tratamiento de los datos que puedan recabar estas cookies se rige por nuestra{' '}
        <a href="/privacidad">Política de Privacidad</a>. Para cualquier duda, escríbenos a{' '}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>

      <p style={{ marginTop: 24, fontSize: 13, color: '#767d85' }}>
        Documento con contenido de plantilla; la relación exacta de cookies se ajustará y será revisada por
        asesoría jurídica. Si se activan cookies no necesarias, deberá añadirse un banner de consentimiento.
      </p>
    </>
  );
}

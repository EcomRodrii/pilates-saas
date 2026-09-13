import type { Metadata } from 'next';
import { LEGAL } from '@/lib/legal-info';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/cookies';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

export default function Cookies() {
  return (
    <>
      <h1>Política de cookies</h1>
      <p className="lead">Qué cookies y tecnologías similares utiliza {LEGAL.dominio} y cómo puedes gestionarlas.</p>

      <h2>1. Qué son las cookies</h2>
      <p>
        Una cookie es un pequeño archivo que un sitio web guarda en tu dispositivo para recordar información
        entre páginas o visitas. El almacenamiento local del navegador (localStorage o sessionStorage) cumple
        una función parecida, y en esta política lo tratamos igual. Usamos tecnologías propias y de terceros
        con las finalidades que se describen a continuación.
      </p>

      <h2>2. Cookies y tecnologías que utilizamos</h2>
      <table>
        <thead>
          <tr><th>Tipo</th><th>Finalidad</th><th>¿Requiere consentimiento?</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Técnicas o necesarias — sesión</td>
            <td>
              Mantener tu sesión iniciada y la seguridad de la aplicación. La sesión se guarda en el
              almacenamiento local del navegador (claves que empiezan por <code>sb-</code>) y se elimina al cerrar
              sesión.
            </td>
            <td>No (imprescindibles)</td>
          </tr>
          <tr>
            <td>De terceros — pagos</td>
            <td>Nuestro proveedor de pagos (Stripe) puede establecer cookies durante el proceso de cobro para procesarlo y prevenir el fraude.</td>
            <td>No cuando son necesarias para el servicio solicitado</td>
          </tr>
          <tr>
            <td>De terceros — seguridad</td>
            <td>
              Cloudflare Turnstile comprueba que quien usa los formularios de acceso y alta es una persona y no un
              programa automatizado. Puede usar almacenamiento técnico del navegador para completar esa comprobación.
            </td>
            <td>No (necesarias para la seguridad del servicio)</td>
          </tr>
          <tr>
            <td>Analítica de uso</td>
            <td>
              Medimos el uso del producto y de este sitio web (páginas visitadas y acciones concretas) con PostHog,
              en servidores de la Unión Europea, para saber qué funciona y qué mejorar. <strong>No usa cookies ni
              guarda nada en tu dispositivo</strong>: el identificador anónimo solo existe mientras la página está
              abierta, y las direcciones se envían sin parámetros ni identificadores personales. No se usa en la
              app de alumnas de los estudios, en la página ni en el widget de reservas, ni en nuestro backoffice.
            </td>
            <td>No instala cookies ni almacenamiento en tu dispositivo</td>
          </tr>
          <tr>
            <td>De terceros — diagnóstico</td>
            <td>Monitorización de errores (Sentry) para detectar y corregir fallos del servicio. No usa cookies.</td>
            <td>No instala cookies</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>No utilizamos cookies de publicidad ni de perfilado con fines comerciales de terceros.</strong>{' '}
        Si en el futuro incorporásemos cookies o almacenamiento con fines analíticos o de marketing que no sean
        necesarios, te pediríamos antes tu consentimiento mediante un mecanismo de gestión de cookies.
      </p>

      <h2>3. Cómo gestionarlas</h2>
      <p>
        Puedes permitir, bloquear o eliminar las cookies configurando tu navegador. Ten en cuenta que
        deshabilitar las cookies y el almacenamiento técnicos puede impedir el inicio de sesión y el
        funcionamiento correcto de la plataforma. Enlaces de ayuda de los navegadores más comunes:
      </p>
      <ul>
        <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Google Chrome</a></li>
        <li><a href="https://support.mozilla.org/es/kb/Borrar%20cookies" target="_blank" rel="noopener noreferrer">Mozilla Firefox</a></li>
        <li><a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a></li>
        <li><a href="https://support.microsoft.com/es-es/microsoft-edge" target="_blank" rel="noopener noreferrer">Microsoft Edge</a></li>
      </ul>

      <h2>4. Más información</h2>
      <p>
        El tratamiento de los datos que puedan recabar estas tecnologías se rige por nuestra{' '}
        <a href="/privacidad">Política de Privacidad</a>. Para cualquier duda, escríbenos a{' '}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>

    </>
  );
}

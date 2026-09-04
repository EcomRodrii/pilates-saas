import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL } from '@/lib/legal-info';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/network/terminos';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

export default function TerminosNetwork() {
  return (
    <>
      <h1>Términos y condiciones de Tentare Network</h1>
      <p className="lead">
        Condiciones que regulan el uso de Tentare Network, la red profesional que conecta instructoras de
        Pilates y Yoga con estudios. Distintas de los <a href="/terminos">Términos de Tentare</a> (el software
        de gestión para estudios): aquí la relación es entre instructora y estudio, no una suscripción SaaS.
      </p>

      <h2>1. Qué es Tentare Network</h2>
      <p>
        Tentare Network es un directorio y buscador donde instructoras publican su perfil profesional y
        estudios buscan candidatas por especialidad, ciudad y disponibilidad. El titular del servicio es{' '}
        {LEGAL.titular} (empresario individual / autónomo).
      </p>

      <h2>2. Tentare Network no es parte de la relación</h2>
      <p>
        Tentare Network <strong>solo pone en contacto</strong> a instructoras y estudios. No intermedia el
        acuerdo entre ambos, no cobra comisión sobre lo que se pacte, y no es parte de ningún contrato,
        colaboración o relación laboral que resulte de ese contacto. Instructora y estudio son responsables de
        pactar entre ellos las condiciones (tarifa, horario, forma de colaboración) y de cumplir la normativa
        laboral y fiscal que les corresponda.
      </p>

      <h2>3. Cuenta y perfil</h2>
      <p>
        Para publicar un perfil de instructora hace falta una cuenta con información veraz: nombre, ciudad,
        especialidades, experiencia y disponibilidad real. Un perfil se publica por persona — no en nombre de
        un estudio ni de un colectivo. Puedes ocultar tu perfil cuando quieras sin perder los datos que ya
        rellenaste, y volver a publicarlo después.
      </p>

      <h2>4. Verificación</h2>
      <p>
        Verificamos el email de cada perfil antes de publicarlo. La experiencia en un estudio concreto solo se
        marca como <strong>verificada</strong> si ese estudio, desde su propia cuenta en Tentare, confirma que
        trabajaste ahí — nunca es algo que se autodeclare. Si subes un documento de identidad para verificar tu
        perfil, se usa exclusivamente para ese fin (ver <Link href="/network/privacidad">Privacidad de Network</Link>).
      </p>

      <h2>5. Contacto entre instructora y estudio</h2>
      <p>
        Tu teléfono y tu email quedan privados hasta que aceptas una solicitud de contacto. A partir de ahí, la
        conversación sale de Tentare Network: no supervisamos ni almacenamos lo que os digáis fuera de la
        plataforma. Puedes rechazar cualquier solicitud sin dar explicaciones.
      </p>

      <h2>6. Uso aceptable y moderación</h2>
      <p>
        No está permitido publicar información falsa, suplantar a otra persona o estudio, ni usar los datos de
        contacto que veas en la plataforma para fines distintos de valorar una colaboración real. Cualquier
        perfil o mensaje se puede reportar desde un botón de «Reportar» que llega al equipo de Tentare, no a la
        otra persona. Podemos ocultar o eliminar perfiles que incumplan estas condiciones.
      </p>

      <h2>7. Reseñas</h2>
      <p>
        Un perfil de instructora puede recibir reseñas de alumnas que hayan tomado clase con ella a través de un
        estudio que usa Tentare. Las reseñas deben describir una experiencia real; podemos retirar las que
        incumplan esta condición o resulten manifiestamente falsas.
      </p>

      <h2>8. Precio del servicio</h2>
      <p>
        Publicar tu perfil y buscar instructoras es <strong>gratuito durante la beta</strong>, sin comisión
        sobre lo que se pacte entre las partes. Si eso cambiara alguna vez, avisaríamos con antelación razonable
        antes de aplicar cualquier condición nueva a tu cuenta.
      </p>

      <h2>9. Disponibilidad y beta</h2>
      <p>
        Tentare Network está en beta: estamos incorporando a las primeras instructoras y estudios, y la
        cobertura por ciudad y especialidad todavía es limitada. No garantizamos que exista una candidata o una
        oferta disponible para cada búsqueda.
      </p>

      <h2>10. Eliminar tu cuenta</h2>
      <p>
        Puedes ocultar tu perfil tú misma desde «Mi perfil» cuando quieras. Para eliminar la cuenta por
        completo, escribe a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>

      <h2>11. Modificaciones</h2>
      <p>
        Podremos modificar estos términos por motivos legales, técnicos o de negocio. Te informaremos de los
        cambios sustanciales y la versión vigente estará siempre publicada en esta página.
      </p>

      <h2>12. Ley aplicable y jurisdicción</h2>
      <p>
        Estos términos se rigen por la legislación española. Para cualquier controversia, y cuando la normativa
        lo permita, las partes se someten a los juzgados y tribunales del domicilio del titular, sin perjuicio
        del fuero que corresponda legalmente a las personas consumidoras.
      </p>
    </>
  );
}

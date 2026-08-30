import type { Metadata } from 'next';
import { LEGAL } from '@/lib/legal-info';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/network/privacidad';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

export default function PrivacidadNetwork() {
  return (
    <>
      <h1>Política de privacidad de Tentare Network</h1>
      <p className="lead">
        Cómo tratamos los datos personales de instructoras y estudios en Tentare Network, conforme al
        Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018 (LOPDGDD). Complementa la{' '}
        <a href="/privacidad">Política de privacidad general de Tentare</a> con lo específico del marketplace.
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <ul>
        <li><strong>Responsable:</strong> {LEGAL.titular} (NIF {LEGAL.nif})</li>
        <li><strong>Domicilio:</strong> {LEGAL.domicilio}</li>
        <li><strong>Contacto en materia de privacidad:</strong> <a href={`mailto:${LEGAL.emailPrivacidad}`}>{LEGAL.emailPrivacidad}</a></li>
      </ul>

      <h2>2. Qué datos tratamos y para qué</h2>
      <table>
        <thead>
          <tr><th>Datos</th><th>Finalidad</th><th>Quién los ve</th></tr>
        </thead>
        <tbody>
          <tr><td>Perfil público (nombre, foto, ciudad, especialidades, experiencia, tarifa orientativa, disponibilidad)</td><td>Que los estudios puedan encontrarte y valorar si encajas</td><td>Cualquier visitante del marketplace</td></tr>
          <tr><td>Email y teléfono</td><td>Que un estudio pueda contactarte tras aceptar tú la solicitud</td><td>Nadie, hasta que aceptas una solicitud de contacto</td></tr>
          <tr><td>Documento de identidad (si verificas tu perfil)</td><td>Confirmar que la persona del perfil es real</td><td>Solo el equipo de Tentare, para verificar; no se publica ni se comparte con estudios</td></tr>
          <tr><td>Experiencia confirmada por un estudio</td><td>Marcar como verificada la experiencia que declaras</td><td>Cualquier visitante, como sello de confianza sobre tu perfil</td></tr>
          <tr><td>Reseñas de alumnas</td><td>Dar contexto real sobre cómo das clase</td><td>Cualquier visitante del perfil</td></tr>
          <tr><td>Mensajes de contacto y reportes</td><td>Gestionar solicitudes entre instructora y estudio, y moderar la plataforma</td><td>El equipo de Tentare y la otra parte de la conversación</td></tr>
        </tbody>
      </table>
      <p>
        No se realizan decisiones automatizadas con efectos jurídicos significativos sobre las personas. El
        documento de identidad, si lo aportas, se trata como categoría de dato sensible: acceso restringido al
        equipo de verificación, nunca visible en el perfil público.
      </p>

      <h2>3. Base jurídica</h2>
      <p>
        Tratamos tu perfil público y tus datos de contacto para ejecutar el servicio que solicitas (publicar tu
        perfil y recibir/hacer solicitudes de contacto). El documento de identidad se trata con tu
        consentimiento explícito, exigido antes de subirlo. Las reseñas se publican con base en el interés
        legítimo de dar información veraz a quien consulta un perfil, con la posibilidad de reportarlas si son
        falsas o inapropiadas.
      </p>

      <h2>4. Conservación</h2>
      <p>
        Conservamos tu perfil mientras mantengas tu cuenta activa. Si ocultas tu perfil, los datos se guardan
        sin publicar por si vuelves a activarlo. Si eliminas la cuenta (
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>), suprimimos el perfil público y los datos de
        contacto; el documento de identidad se elimina tras la verificación o, como máximo, al cerrar la
        cuenta.
      </p>

      <h2>5. Destinatarios y encargados</h2>
      <p>
        No vendemos tus datos. Tentare Network usa la misma infraestructura que el resto del producto (base de
        datos, alojamiento, envío de emails) — ver la lista completa de encargados en la{' '}
        <a href="/privacidad">Política de privacidad general</a>. No compartimos tu documento de identidad ni tu
        contacto con estudios: solo tú decides aceptar una solicitud y revelarlo.
      </p>

      <h2>6. Tus derechos</h2>
      <p>
        Puedes ejercer los derechos de <strong>acceso, rectificación, supresión, oposición, limitación del
        tratamiento y portabilidad</strong>, así como retirar el consentimiento prestado para el documento de
        identidad, escribiendo a <a href={`mailto:${LEGAL.emailPrivacidad}`}>{LEGAL.emailPrivacidad}</a>. Si
        consideras que el tratamiento no se ajusta a la normativa, puedes reclamar ante la Agencia Española de
        Protección de Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">aepd.es</a>).
      </p>

      <h2>7. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas apropiadas (cifrado en tránsito, control de acceso por rol,
        y acceso restringido a documentos de identidad) para proteger los datos frente a accesos no
        autorizados, pérdida o alteración.
      </p>

      <h2>8. Menores</h2>
      <p>
        Tentare Network se dirige a profesionales mayores de edad. No recabamos conscientemente datos de
        menores para crear perfiles de instructora.
      </p>

      <h2>9. Cambios</h2>
      <p>
        Podemos actualizar esta política para reflejar cambios legales o del servicio. Publicaremos la versión
        vigente en esta página, indicando su fecha de actualización.
      </p>
    </>
  );
}

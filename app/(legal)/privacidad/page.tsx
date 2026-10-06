import type { Metadata } from 'next';
import { LEGAL, PROVEEDORES } from '@/lib/legal-info';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/privacidad';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

export default function Privacidad() {
  return (
    <>
      <h1>Política de privacidad</h1>
      <p className="lead">
        Cómo tratamos tus datos personales conforme al Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica
        3/2018 (LOPDGDD).
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <ul>
        <li><strong>Responsable:</strong> {LEGAL.titular} (NIF {LEGAL.nif})</li>
        <li><strong>Domicilio:</strong> {LEGAL.domicilio}</li>
        <li><strong>Contacto en materia de privacidad:</strong> <a href={`mailto:${LEGAL.emailPrivacidad}`}>{LEGAL.emailPrivacidad}</a></li>
      </ul>

      <h2>2. Roles: cuándo somos responsables y cuándo encargados</h2>
      <p>
        Respecto de los datos de las <strong>cuentas de estudio y su personal</strong> (registro, facturación,
        soporte), {LEGAL.marca} actúa como <strong>responsable</strong>. Respecto de los datos que cada estudio
        introduce sobre <strong>sus clientas</strong> para gestionar su actividad, {LEGAL.marca} actúa como{' '}
        <strong>encargado del tratamiento</strong> por cuenta del estudio, que es el responsable de esos datos;
        el marco de ese tratamiento se recoge en los <a href="/terminos">Términos y Condiciones</a> (acuerdo de
        encargo, art. 28 RGPD).
      </p>

      <h2>3. Datos que tratamos y finalidades</h2>
      <table>
        <thead>
          <tr><th>Datos</th><th>Finalidad</th><th>Base jurídica</th></tr>
        </thead>
        <tbody>
          <tr><td>Identificación y contacto (nombre, email)</td><td>Crear y gestionar tu cuenta y darte el servicio</td><td>Ejecución del contrato</td></tr>
          <tr><td>Datos de facturación y pago</td><td>Cobrar la suscripción y emitir facturas</td><td>Ejecución del contrato / obligación legal</td></tr>
          <tr><td>Datos de uso y registros técnicos</td><td>Seguridad, prevención del fraude y mejora del servicio</td><td>Interés legítimo</td></tr>
          <tr><td>Comunicaciones y soporte</td><td>Atender tus consultas e informarte del servicio</td><td>Ejecución del contrato / interés legítimo</td></tr>
          <tr><td>Comunicaciones comerciales</td><td>Enviarte novedades del producto</td><td>Consentimiento (revocable)</td></tr>
          <tr><td>Descarga de plantillas (email y, si lo indicas, el nombre de tu estudio)</td><td>Enviarte la plantilla que pides y, solo si marcas la casilla y lo confirmas desde el correo, novedades y guías de Tentare</td><td>Tu solicitud / consentimiento (revocable en cualquier momento)</td></tr>
        </tbody>
      </table>
      <p>
        <strong>Automatizaciones.</strong> Algunas funciones que cada estudio decide activar y configurar actúan
        de forma automática sobre sus clientas: recomendaciones y avisos generados a partir de la actividad del
        estudio, la cancelación de una clase que no alcanza el mínimo de asistentes fijado por el estudio, o una
        penalización por cancelar tarde o no presentarse, que el estudio puede configurar para que se cobre
        automáticamente. Esas reglas las decide el estudio como responsable del tratamiento; si te afecta una de
        ellas, puedes pedir al estudio que la revise una persona.
      </p>
      <p>
        No se tratan categorías especiales de datos de las cuentas; los datos de salud que un estudio pueda registrar
        sobre sus clientas se tratan por cuenta y bajo la responsabilidad del estudio, con acceso restringido.
      </p>

      <h2>4. Mensajes, tablón y moderación en la app de las alumnas</h2>
      <p>
        La app de cada estudio permite a sus clientas escribir al estudio y a sus instructoras, y comentar en el
        tablón del estudio. Esos datos los trata {LEGAL.marca} por cuenta del estudio, salvo en lo que se indica
        sobre la revisión de denuncias.
      </p>
      <ul>
        <li>
          <strong>Quién lee lo que escribes.</strong> Un mensaje al estudio lo lee el equipo del estudio que atiende
          los mensajes. Un mensaje a tu instructora lo leéis tu instructora y tú, y también lo puede leer la persona
          responsable del estudio; te lo avisamos en la propia conversación. Un comentario en el tablón lo ve quien
          puede ver esa publicación; en las publicaciones dirigidas solo a un grupo de alumnas, cada alumna ve
          únicamente sus comentarios y los del estudio.
        </li>
        <li>
          <strong>Tu nombre en el tablón.</strong> Tus compañeras te ven con tu nombre y la inicial de tu primer
          apellido (por ejemplo, «Lucía M.»), nunca con tus apellidos completos.
        </li>
        <li>
          <strong>Avisos.</strong> Cuando te escriben, el aviso del móvil no muestra el texto del mensaje.
        </li>
        <li>
          <strong>Normas de la comunidad y filtro.</strong> Antes de escribir por primera vez te pedimos que aceptes
          las normas de la comunidad, y guardamos qué versión aceptaste y cuándo, para poder demostrarlo. Si un
          mensaje o un comentario contiene palabras que las normas no permiten, no se publica.
        </li>
        <li>
          <strong>Denuncias.</strong> Puedes denunciar un mensaje o un comentario. Guardamos quién denunció, qué se
          denunció y quién lo escribió, lo que nos cuentes, la fecha y la decisión que se tomó. La denuncia la revisa
          el estudio; la revisa {LEGAL.marca}, como responsable de la app, cuando va contra el propio estudio o
          cuando el estudio no la ha revisado en 24 horas. Para revisarla, quien la revisa lee el contenido
          denunciado, aunque esté en una conversación privada. Te avisamos de lo que se decidió: que se mantiene, que
          se retira o que se cierra la conversación.
        </li>
        <li>
          <strong>Bloqueos.</strong> Puedes bloquear a tu instructora en el chat, o a una compañera en el tablón. El
          estudio recibe un aviso para revisarlo, y puedes desbloquearla cuando quieras en Perfil › Privacidad y
          datos. Quien ha sido bloqueada no recibe ningún aviso de ello.
        </li>
      </ul>
      <p>
        <strong>Cuánto tiempo se guardan.</strong> Los mensajes y comentarios, mientras exista tu ficha en el
        estudio o hasta que los borres (tus comentarios del tablón los puedes borrar tú en cualquier momento). Si
        el estudio retira un contenido por las normas, deja de verse, pero se conserva junto a la denuncia mientras
        esta exista. Las denuncias resueltas se borran automáticamente 12 meses después de resolverse; las que
        siguen sin resolver no caducan, y pasan a {LEGAL.marca} a las 24 horas. Si se borra lo denunciado (porque
        quien lo escribió lo borra, porque se suprimen sus datos o porque se da de baja el estudio), la denuncia se
        borra con ello. Las normas aceptadas se conservan mientras exista tu cuenta. Los bloqueos siguen en pie
        hasta que los quites, aunque borres tu cuenta, para que nadie a quien bloqueaste pueda volver a escribirte.
      </p>
      <p>
        <strong>Tus datos y tu cuenta.</strong> «Descargar mis datos» incluye tus mensajes, tus comentarios del
        tablón (también los retirados), tus «me gusta», las denuncias que hiciste y qué se decidió, a quién
        bloqueaste (solo dónde y desde cuándo, sin datos de la otra persona) y las versiones de las normas que
        aceptaste. «Borrar mi cuenta» borra al momento tu cuenta, tus «me gusta» y las normas aceptadas; tus
        mensajes y comentarios se quedan en el estudio con tu nombre, como parte de tu ficha. Si quieres que el
        estudio los borre también, pídeselo con «Solicitar la eliminación de mis datos»: al suprimirse tu ficha se
        borran tus mensajes, comentarios, «me gusta» y bloqueos.
      </p>

      <h2>5. Conservación</h2>
      <p>
        Conservamos los datos mientras la relación esté vigente y, después, durante los plazos legalmente
        exigibles (por ejemplo, la normativa mercantil y fiscal impone conservar la facturación). Cerrada la
        cuenta, los datos se suprimen o anonimizan una vez transcurridos dichos plazos.
      </p>
      <p>
        Cuando un estudio deja Tentare, dispone de 30 días para descargar sus datos; después, o antes si lo pide,
        se suprimen también de las copias de seguridad y se le confirma por correo. Se conservan bloqueados,
        durante el plazo legal, las facturas, los recibos, los registros de facturación y los mandatos SEPA.
      </p>

      <h2>6. Destinatarios y encargados</h2>
      <p>
        No vendemos tus datos. Para prestar el servicio recurrimos a los proveedores siguientes; los marcados
        como opcionales solo intervienen si el estudio activa esa integración. Cuando tratan datos personales
        por nuestra cuenta, lo hacen como encargados o subencargados, con contrato conforme al art. 28 RGPD:
      </p>
      <table>
        <thead>
          <tr><th>Proveedor</th><th>Uso</th><th>Ubicación</th></tr>
        </thead>
        <tbody>
          {PROVEEDORES.map((p) => (
            <tr key={p.nombre}><td>{p.nombre}</td><td>{p.uso}</td><td>{p.ubicacion}</td></tr>
          ))}
        </tbody>
      </table>
      <p>
        Cuando algún proveedor implique transferencias internacionales fuera del Espacio Económico Europeo,
        estas se amparan en garantías adecuadas (decisiones de adecuación o cláusulas contractuales tipo de la
        Comisión Europea).
      </p>

      <h2>7. Tus derechos</h2>
      <p>
        Puedes ejercer los derechos de <strong>acceso, rectificación, supresión, oposición, limitación del
        tratamiento y portabilidad</strong>, así como retirar el consentimiento prestado, escribiendo a{' '}
        <a href={`mailto:${LEGAL.emailPrivacidad}`}>{LEGAL.emailPrivacidad}</a>. Si consideras que el
        tratamiento no se ajusta a la normativa, puedes reclamar ante la Agencia Española de Protección de
        Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">aepd.es</a>). Si eres
        clienta de un estudio, dirige tu solicitud al estudio como responsable; te ayudaremos a canalizarla.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas apropiadas (cifrado en tránsito; cifrado de las copias de
        seguridad, de los IBAN de las domiciliaciones y de las credenciales de las integraciones; verificación en
        dos pasos para el equipo de los estudios; control de acceso por roles, aislamiento por estudio y registro
        de accesos a los datos sensibles) para proteger los datos frente a accesos no autorizados, pérdida o
        alteración.
      </p>

      <h2>9. Menores</h2>
      <p>
        Para crear una cuenta de estudio en Tentare hay que ser mayor de edad. Los estudios pueden registrar como
        clientas a menores; en ese caso el estudio es el responsable de esos datos y de contar con el
        consentimiento de su madre, padre o tutor cuando la ley lo exige. El consentimiento para tratar datos de
        salud de una menor de 14 años lo firma su madre, padre o tutor, y queda registrado con su nombre.
      </p>

      <h2>10. Cambios</h2>
      <p>
        Podemos actualizar esta política para reflejar cambios legales o del servicio. Publicaremos la versión
        vigente en esta página, indicando su fecha de actualización.
      </p>

    </>
  );
}

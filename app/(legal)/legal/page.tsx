import type { Metadata } from 'next';
import { LEGAL } from '@/lib/legal-info';

export const metadata: Metadata = {
  title: 'Aviso legal · Tentare',
  description: 'Información legal y datos identificativos del titular de tentare.app conforme a la LSSI-CE.',
};

export default function AvisoLegal() {
  return (
    <>
      <h1>Aviso legal</h1>
      <p className="lead">
        Información exigida por la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la
        Información y de Comercio Electrónico (LSSI-CE).
      </p>

      <h2>1. Datos identificativos del titular</h2>
      <p>
        En cumplimiento del artículo 10 de la LSSI-CE, se informa de que el sitio web{' '}
        <strong>{LEGAL.dominio}</strong> y el servicio <strong>{LEGAL.marca}</strong> son titularidad de:
      </p>
      <ul>
        <li><strong>Titular:</strong> {LEGAL.titular} (empresario individual / autónomo)</li>
        <li><strong>NIF:</strong> {LEGAL.nif}</li>
        <li><strong>Domicilio:</strong> {LEGAL.domicilio}</li>
        <li><strong>Correo de contacto:</strong> <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></li>
      </ul>

      <h2>2. Objeto</h2>
      <p>
        {LEGAL.marca} es una plataforma de software como servicio (SaaS) dirigida a estudios de Pilates y
        actividades afines, que permite gestionar reservas, clientas, cobros, calendario, equipo y demás
        operativa del estudio. El presente aviso legal regula el acceso y el uso del sitio web y de la
        plataforma.
      </p>

      <h2>3. Condiciones de acceso y uso</h2>
      <p>
        El acceso al sitio es gratuito, salvo el coste de la conexión. El uso de la plataforma requiere
        registro y la aceptación de los <a href="/terminos">Términos y Condiciones</a>. La persona usuaria se
        compromete a hacer un uso diligente, lícito y conforme a la ley, a este aviso y a la buena fe, y a no
        emplear el servicio con fines ilícitos o que puedan dañar, sobrecargar o inutilizar el sitio o impedir
        su normal utilización.
      </p>

      <h2>4. Propiedad intelectual e industrial</h2>
      <p>
        Todos los contenidos del sitio (textos, código, diseños, logotipos, marcas, imágenes y demás
        elementos) son titularidad de {LEGAL.marca} o de terceros que han autorizado su uso, y están
        protegidos por la normativa de propiedad intelectual e industrial. Queda prohibida su reproducción,
        distribución, comunicación pública o transformación sin autorización expresa, salvo los usos permitidos
        por la ley.
      </p>

      <h2>5. Responsabilidad</h2>
      <p>
        {LEGAL.marca} procura mantener el sitio operativo y actualizado, pero no garantiza la disponibilidad y
        continuidad ininterrumpidas del servicio ni la ausencia de errores. En la medida permitida por la ley,
        {' '}{LEGAL.marca} no será responsable de los daños derivados de la falta de disponibilidad temporal, de
        fallos técnicos o del uso indebido del servicio por parte de terceros. La responsabilidad relativa a la
        prestación del servicio se regula en los <a href="/terminos">Términos y Condiciones</a>.
      </p>

      <h2>6. Enlaces</h2>
      <p>
        El sitio puede contener enlaces a sitios de terceros. {LEGAL.marca} no asume responsabilidad por los
        contenidos ni por las políticas de dichos sitios, cuyo acceso se realiza bajo la exclusiva
        responsabilidad de la persona usuaria.
      </p>

      <h2>7. Protección de datos</h2>
      <p>
        El tratamiento de los datos personales se rige por la <a href="/privacidad">Política de Privacidad</a>{' '}
        y la <a href="/cookies">Política de Cookies</a>.
      </p>

      <h2>8. Legislación aplicable y jurisdicción</h2>
      <p>
        El presente aviso legal se rige por la legislación española. Para la resolución de cualquier
        controversia, y cuando la normativa lo permita, las partes se someten a los juzgados y tribunales del
        domicilio del titular, sin perjuicio del fuero que corresponda legalmente a las personas consumidoras.
      </p>

      <p style={{ marginTop: 24, fontSize: 13, color: '#767d85' }}>
        El texto de este documento es de plantilla y está pendiente de revisión por asesoría jurídica.
      </p>
    </>
  );
}

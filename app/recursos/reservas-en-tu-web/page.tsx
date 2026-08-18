import type { Metadata } from 'next';
import Link from 'next/link';
import { ArticleShell } from '@/components/recursos/ArticleShell';
import { PageShell } from '@/components/recursos/PageShell';
import { Callout, Checklist, CtaBlock, RelatedLinks } from '@/components/recursos/ArticlePrimitives';
import { ArticleStructuredData } from '@/components/recursos/ArticleStructuredData';
import { ACC } from '@/components/landing/theme';
import { urlDe } from '@/lib/seo/paginas';

const TITLE = 'Cómo integrar reservas de Pilates en tu propia web';
const SLUG = 'reservas-en-tu-web';

export const metadata: Metadata = {
  title: `${TITLE} — Tentare`,
  description: 'La alumna que sale de tu web para reservar, casi siempre no vuelve. Widget, plugin de WordPress o API: tus opciones reales, comparadas sin rodeos.',
  alternates: { canonical: urlDe(`/recursos/${SLUG}`) },
  openGraph: {
    type: 'article',
    title: TITLE,
    description: 'Por qué redirigir a otra plataforma cuesta reservas, y las tres formas reales de evitarlo.',
    url: urlDe(`/recursos/${SLUG}`),
  },
};

const TOC = [
  { id: 's1', label: 'Por qué la redirección sale cara' },
  { id: 's2', label: 'Tus opciones, sin redirigir' },
  { id: 's3', label: 'Instalación paso a paso' },
  { id: 's4', label: 'Pagos y RGPD' },
  { id: 's5', label: 'Cuánto cuesta de verdad' },
  { id: 's6', label: 'Proveedores en España' },
];

export default function ReservasEnTuWebPage() {
  return (
    <PageShell>
      <ArticleStructuredData
        title={TITLE}
        description="Por qué redirigir a otra plataforma cuesta reservas, y las tres opciones reales para integrar un sistema de reservas de Pilates sin salir de tu dominio."
        slug={SLUG}
        datePublished="2026-08-18"
      />
      <ArticleShell
        category="Software y web"
        coverGradient="linear-gradient(140deg,#1C1F14,#343825)"
        title={TITLE}
        intro="La alumna llega a tu web, pulsa «Reservar» y aparece en una pantalla con otro logo y otro diseño. No sabe si sigue en tu web o no. La mayoría cierra esa ventana y no vuelve — y eso no es un problema de diseño, es una fuga de confianza."
        readTime="9 min de lectura"
        toc={TOC}
      >
        <p style={{ fontSize: 19, lineHeight: 1.6, color: '#1A1A1A' }}>La alumna llega a tu web. Ha visto tu Instagram, le gusta tu estudio, quiere apuntarse. Pulsa «Reservar» y de repente aparece en una pantalla con otros colores, otro logo y una interfaz que no reconoce. No sabe si ha salido de tu web o si eso es tuyo. La mayoría cierra esa ventana y no vuelve.</p>
        <p>Eso no es un problema de diseño: es una fuga de confianza. Y en un sector donde la relación entre alumna y estudio es tan personal como el Pilates, esa fricción cuesta reservas, cuesta fidelización y cuesta reputación. ¿Puedes integrar reservas de Pilates en tu web sin redirigir a otra plataforma? Sí, y en este artículo te explicamos exactamente cómo hacerlo. Redirigir a una plataforma externa no es una decisión técnica neutral: tiene consecuencias directas en tu negocio.</p>
        <p>Tienes opciones concretas para resolver esto. Soluciones como Tentare permiten a estudios de Pilates en España tener un <Link href="/funcionalidades/reservas-online" style={{ color: ACC }}>sistema de reservas completamente integrado</Link> en su propia web, sin que la alumna salga en ningún momento. A continuación encontrarás las distintas opciones técnicas comparadas, los pasos para implementarlas y una guía de proveedores para tomar una decisión con criterio.</p>

        <h2 id="s1">Por qué perder a la alumna en la redirección sale caro</h2>
        <p>El flujo tiene lógica desde la perspectiva del proveedor de software, pero ninguna desde la de tu alumna. Ella entra en tu web, percibe tu marca, tu estilo, tu propuesta. Cuando pulsa el botón de reserva y aterriza en otra plataforma con otro nombre y otro diseño, su cerebro registra una discontinuidad: algo no cuadra. En móvil el problema se amplifica, porque la carga es más lenta, el diseño ajeno desorienta más y el proceso parece interminable.</p>
        <p>Los datos generales de abandono en reservas online rondan el 80&nbsp;%. Una parte significativa de ese abandono ocurre en ese momento de ruptura, cuando el usuario percibe que ha salido del entorno de confianza donde empezó. No es que tu alumna sea difícil: es que el proceso le pide más esfuerzo del que estaba dispuesta a dar.</p>

        <Callout title="Lo que no se ve a primera vista" bg="#F1F2EA" border="#E0E5D0" iconColor={ACC} textColor="#3E4430">
          Además de perder la reserva inmediata, el estudio pierde cosas que no se ven a primera vista. Cuando la transacción ocurre fuera de tu dominio, tu analítica web no la registra como conversión propia, y tus datos de rendimiento quedan distorsionados. Si hay una incidencia, la alumna la asocia con esa pantalla extraña, no contigo; pero si algo va bien, el mérito también se diluye. La fidelización se construye en cada punto de contacto con tu marca, y la reserva es uno de los más importantes. Si ese momento vive en la plataforma de un tercero, el vínculo emocional con tu estudio se debilita.
        </Callout>

        <h2 id="s2">¿Puedes integrar reservas de Pilates en tu web sin redirigir a otra plataforma? Estas son tus opciones</h2>

        <h3>El widget de reservas: la opción más práctica para la mayoría</h3>
        <p>Un widget de reservas es un fragmento de código, normalmente un script o un bloque HTML, que se inserta en cualquier página de tu web y carga el formulario de reserva dentro de tu propio dominio. La alumna no percibe ningún salto: todo ocurre en tu web, con tu diseño y sin cambios de contexto. Eso es exactamente lo que significa integrar las reservas de Pilates en tu web sin redirigir a ningún otro sitio.</p>
        <p>La implementación es rápida porque no requiere desarrollo a medida. El proveedor mantiene toda la lógica del sistema y tú no dependes de soporte técnico continuo. La única limitación honesta es que la personalización tiene un techo: el diseño del componente lo controla en parte el proveedor. Los mejores, sin embargo, permiten adaptar colores, tipografías y estructura a la identidad de tu estudio para que encaje visualmente.</p>

        <h3>El plugin de reservas para WordPress: cómodo si tu web ya está en WordPress</h3>
        <p>Si tu web está construida en WordPress, muchos proveedores ofrecen un plugin oficial que se instala desde el panel, se conecta con tu cuenta y genera un bloque o un código abreviado listo para insertar en cualquier página. El proceso elimina la necesidad de copiar y pegar código manualmente, lo que lo hace accesible para quien no tiene conocimientos técnicos.</p>
        <p>Antes de elegir un <a href="https://schedulingkit.com/es/booking-widget/wordpress" target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'inherit', textDecorationColor: '#C7C7BC' }}>plugin de reservas</a> para tu estudio de Pilates, revisa las funcionalidades reales. No todos están diseñados para la especificidad de este tipo de negocio: gestión por reformer individual, listas de espera automáticas, bonos por sesión. Un plugin genérico para citas puede ser suficiente en un inicio, pero se queda corto cuando el estudio crece.</p>

        <h3>La integración por API: cuándo tiene sentido y cuándo no</h3>
        <p>La API permite construir una experiencia de reserva completamente personalizada, integrada con el CRM, el sistema de pagos y cualquier automatización propia del estudio. El control es total: puedes diseñar exactamente cómo se reservan clases, cómo funcionan los bonos y cómo se gestionan las cancelaciones.</p>
        <p>Tiene sentido para cadenas o franquicias con múltiples centros que necesitan una operativa unificada y un control absoluto de cada punto de contacto con la alumna. Para la mayoría de estudios independientes, el coste y el tiempo de desarrollo no se justifican. Un proyecto a medida puede partir de 1.500&nbsp;€ y escalar hasta 5.000&nbsp;€ o más según el alcance, además de requerir mantenimiento técnico continuo. Un widget de reservas bien configurado resuelve la inmensa mayoría de los casos prácticos sin ese coste ni esa complejidad.</p>

        <h2 id="s3">Cómo instalar un sistema de reservas embebido paso a paso</h2>

        <h3>En WordPress: bloque HTML, código abreviado o plugin</h3>
        <p>El proceso en WordPress es directo. Para empezar, instala el plugin del proveedor desde el panel (Complementos → Añadir nuevo) o <a href="https://docs.bokun.io/es/articles/357-como-insertar-un-widget-en-el-cms-de-wordpress" target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'inherit', textDecorationColor: '#C7C7BC' }}>copia el código de inserción</a> que te proporcionan. A continuación, conecta tu cuenta del proveedor en los ajustes del plugin o pega el fragmento en un bloque HTML personalizado dentro del editor de bloques. Por último, inserta el widget en tu página de reservas mediante el código abreviado correspondiente o arrastrando el bloque del plugin a la posición correcta.</p>
        <p>Una vez insertado, previsualiza en escritorio y en móvil antes de publicar. Verifica que el proceso completo de reserva y pago ocurre sin salir de tu dominio. Ese paso de verificación es el más importante: muchas propietarias de estudios asumen que funciona y no lo comprueban hasta que una alumna les escribe por WhatsApp preguntando dónde reservar.</p>

        <h3>En Wix o Webflow: el bloque de código embebido</h3>
        <p>En ambos constructores el método es similar: añade un elemento de tipo «Insertar código» o «HTML personalizado» en la página, pega el código del widget y ajusta el contenedor en ancho y alto. Si el widget usa un script propio en lugar de un <a href="https://support.trekksoft.com/es/5-razones-para-no-utilizar-la-integraci%C3%B3n-de-iframe-en-su-sitio-web" target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'inherit', textDecorationColor: '#C7C7BC' }}>marco en línea clásico</a>, suele adaptarse mejor al diseño adaptable de la página y evita los problemas de altura fija que dejan el formulario cortado en móvil.</p>
        <p>Publicar y probar en un dispositivo móvil real no es opcional. Los marcos en línea con altura fija pueden quedar cortados en pantallas pequeñas si no se configuran correctamente, y eso genera exactamente la misma fricción que querías evitar. Dedica diez minutos a este paso: merece la pena.</p>

        <Callout title="¿Widget o iframe? La diferencia técnica importa" bg="#FBF3E7" border="#F0DFC0" iconColor="#C79A2E" textColor="#5C4A22">
          Si quieres entender por qué un iframe puede romperse en Safari de iPhone y cuánta conversión pierde cada método, la comparativa técnica completa está en <Link href="/recursos/widget-vs-iframe-reservas-pilates" style={{ color: '#5C4A22', fontWeight: 700 }}>cómo integrar reservas online en la web de tu estudio de pilates</Link>.
        </Callout>

        <h3>El widget de Tentare: sin código, sin redirección, en minutos</h3>
        <p><Link href="/" style={{ color: ACC }}>El widget de Tentare</Link> está diseñado específicamente para estudios de Pilates. Se instala copiando un único fragmento de código en cualquier web, sin plugins adicionales ni conocimientos técnicos. La alumna completa toda la reserva dentro de tu propia web, selecciona la clase, elige el reformer concreto que quiere y paga, sin salir en ningún momento del dominio.</p>
        <p>El diseño del widget se adapta a los colores y la identidad visual de tu estudio. Para cadenas o franquicias, el plan de marca blanca de Tentare permite ocultar las referencias visibles al proveedor, de modo que la experiencia refleja en todo momento la identidad de tu marca.</p>

        <h2 id="s4">Pagos y RGPD: lo que debes resolver antes de activar las reservas</h2>
        <p>Integrar cobros en tu web no significa que vayas a almacenar datos de tarjeta. Lo correcto, y lo que exige la normativa <a href="https://www.pcisecuritystandards.org" target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'inherit', textDecorationColor: '#C7C7BC' }}>PCI-DSS</a>, es que una pasarela certificada como Stripe o Redsys gestione ese proceso. El widget del proveedor suele incluir esta pasarela integrada; si no la incluye, conviene verificar qué solución complementaria requiere antes de activarlo en un entorno profesional. Nunca deberías gestionar datos de tarjeta en tu propia web directamente.</p>
        <p>En cuanto al <a href="https://www.tucalendi.com/es/blog/por-que-tu-sistema-de-reservas-debe-cumplir-con-el-rgpd-si-trabajas-en-europa-480" target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'inherit', textDecorationColor: '#C7C7BC' }}>RGPD</a>, no necesitas pedir consentimiento explícito para gestionar una reserva: la base legal es el propio contrato de servicio. El consentimiento solo entra en juego cuando el tratamiento va más allá de la reserva, por ejemplo para enviar boletines o comunicaciones de promoción. El formulario de reserva debe enlazar de forma visible a tu política de privacidad, donde expliques qué datos recoges, durante cuánto tiempo y quién puede acceder a ellos.</p>
        <p>Si tu web usa cookies de analítica o de terceros, estás obligada a tener un aviso de consentimiento por categorías. Muchos sistemas de reservas embebidos cargan cookies propias que deben quedar recogidas en ese aviso. Por último, el proveedor de software actúa como encargado del tratamiento de datos, lo que exige revisar o firmar un acuerdo de encargo en los términos del contrato.</p>

        <h2 id="s5">Cuánto cuesta tener reservas embebidas en tu web</h2>
        <p>Un widget de reservas como servicio en la nube, que es la opción habitual para estudios de Pilates pequeños y medianos, suele costar entre 29&nbsp;€ y 200&nbsp;€/mes según las funcionalidades incluidas, sin comisión por reserva en la mayoría de los casos. Las soluciones genéricas para gimnasios y centros de fitness en general pueden superar los 200&nbsp;€/mes y añaden cargos de implementación iniciales que no siempre se comunican con claridad.</p>
        <p>Más allá del precio mensual, hay varios factores que conviene calcular antes de firmar cualquier contrato:</p>
        <Checklist
          eyebrow="Antes de firmar cualquier contrato"
          items={[
            <><strong>Comisión por reserva:</strong> algunas plataformas cobran un porcentaje de cada transacción además de la cuota mensual; hay que calcularlo sobre el volumen real del estudio.</>,
            <><strong>Permanencia contractual:</strong> las soluciones sin compromiso de permanencia permiten cambiar de proveedor sin coste si la herramienta no encaja.</>,
            <><strong>Costes ocultos de personalización:</strong> algunos proveedores ofrecen el widget básico a buen precio, pero cobran extra por eliminar su marca o por adaptar los colores a tu identidad.</>,
          ]}
        />

        <h2 id="s6">Proveedores para estudios de Pilates en España</h2>

        <h3>Tentare: una solución orientada a la realidad de un estudio de Pilates</h3>
        <p>Tentare es una solución del mercado español diseñada específicamente para estudios de Pilates. Gestiona por reformer individual, no solo por aforo general, lo que marca una diferencia real en la operativa diaria. Su sistema de listas de espera es automático y las sustituciones de instructoras se resuelven sin que la propietaria tenga que intervenir ni escribir un solo mensaje.</p>
        <p>Su widget de reservas se instala en cualquier web en minutos, mantiene la identidad visual del estudio en todo momento y permite a la alumna reservar clase, elegir reformer y pagar sin salir del dominio. Está disponible desde 29&nbsp;€/mes sin permanencia, con plan de marca blanca para cadenas que necesiten una experiencia sin referencias visibles al proveedor.</p>

        <h3>Otras opciones a conocer para tener contexto</h3>
        <p>Soluciones como Mindbody o <Link href="/comparativa/tentare-vs-glofox" style={{ color: ACC }}>Glofox</Link> son herramientas pensadas para gimnasios y centros de fitness en general. En sus planes estándar pueden no cubrir funcionalidades específicas como la gestión por reformer individual o las sustituciones automatizadas, y sus precios suelen superar los 200&nbsp;€/mes. Para un estudio de Pilates con necesidades concretas, es importante verificar qué incluye exactamente cada plan antes de comprometerse.</p>
        <p>Plataformas como EasyWeek o Setmore ofrecen widgets embebibles a precios más bajos y son accesibles para empezar. Sin embargo, carecen de funcionalidades específicas para Pilates: sin gestión de reformers, sin listas de espera automáticas, sin sustituciones. Son suficientes en un momento inicial, pero pueden limitar la operativa cuando el estudio crece. <Link href="/recursos/checklist-elegir-software-estudio" style={{ color: ACC }}>Antes de elegir cualquier proveedor</Link>, comprueba al menos estos puntos: que permita integrar las reservas de Pilates en tu web sin redirigir a otra plataforma, que incluya pasarela de pago integrada y que no obligue a la alumna a crear una cuenta en el sistema del tercero.</p>

        <h2 id="conclusion">La decisión que parece pequeña y no lo es</h2>
        <p>Integrar las reservas directamente en tu web no es una mejora cosmética. Es una decisión que afecta a la conversión, a la fidelización y a la imagen profesional de tu estudio. Cada alumna que llega a tu web y completa la reserva sin salir de tu dominio vive una experiencia coherente con tu marca de principio a fin.</p>
        <p>Para la mayoría de estudios, la opción más práctica es el widget embebido: sin desarrollo a medida, sin redirigir a la alumna, con tu marca presente en todo momento. No necesitas un presupuesto de desarrollo ni conocimientos técnicos avanzados para conseguirlo. En resumen: sí puedes integrar las reservas de Pilates en tu web sin redirigir a otra plataforma, y el widget embebido es, en la mayoría de los casos, la forma más rápida y rentable de hacerlo.</p>
        <p>Si quieres ver cómo funciona en la práctica, Tentare ofrece una demostración sin compromiso. Desde 29&nbsp;€/mes y sin permanencia, puedes tener un sistema de reservas completamente integrado en tu web antes de que acabe la semana.</p>

        <CtaBlock title="Un sistema de reservas dentro de tu web, esta semana" body="Sin redirección, sin código complejo, con tu marca en todo momento. Desde 29€/mes, sin permanencia." />

        <RelatedLinks
          items={[
            { href: '/recursos/widget-vs-iframe-reservas-pilates', category: 'Software y web', categoryColor: '#22251A', title: 'Cómo integrar reservas online en la web de tu estudio de pilates' },
            { href: '/comparativa/tentare-vs-glofox', category: 'Comparativa', categoryColor: ACC, title: 'Glofox vs. Tentare: cuál conviene a tu estudio de Pilates' },
            { href: '/recursos', category: 'Centro de Recursos', categoryColor: '#22251A', title: 'Ver todas las guías para tu estudio →' },
          ]}
        />
      </ArticleShell>
    </PageShell>
  );
}

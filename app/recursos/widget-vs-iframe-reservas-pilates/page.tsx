import type { Metadata } from 'next';
import Link from 'next/link';
import { ArticleShell } from '@/components/recursos/ArticleShell';
import { PageShell } from '@/components/recursos/PageShell';
import { Callout, Checklist, CtaBlock, RelatedLinks } from '@/components/recursos/ArticlePrimitives';
import { ArticleStructuredData } from '@/components/recursos/ArticleStructuredData';
import { ACC } from '@/components/landing/theme';
import { urlDe } from '@/lib/seo/paginas';

const TITLE = 'Cómo integrar reservas online en la web de tu estudio de pilates';
const SLUG = 'widget-vs-iframe-reservas-pilates';

export const metadata: Metadata = {
  title: `${TITLE} — Tentare`,
  description: 'Redirección, iframe o widget nativo: las tres formas reales de integrar reservas online, cómo instalarlas en WordPress/Wix/Squarespace y el checklist antes de publicar.',
  alternates: { canonical: urlDe(`/recursos/${SLUG}`) },
  openGraph: {
    type: 'article',
    title: TITLE,
    description: 'El método que elijas determina cuántas alumnas potenciales llegan al final del proceso sin abandonar.',
    url: urlDe(`/recursos/${SLUG}`),
  },
};

const TOC = [
  { id: 's1', label: 'Las tres formas, comparadas' },
  { id: 's2', label: 'Paso a paso: WordPress, Wix, Squarespace' },
  { id: 's3', label: 'Qué configurar después' },
  { id: 's4', label: 'Lo que exige la ley en España' },
  { id: 's5', label: 'Checklist antes de publicar' },
];

function MetodoRow({ nombre, veredicto, color }: { nombre: string; veredicto: string; color: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center', padding: '13px 16px', borderBottom: '1px solid #EDEDE6' }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{nombre}</span>
      <span className="lp-mono" style={{ fontSize: 11.5, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.04em' }}>{veredicto}</span>
    </div>
  );
}

export default function WidgetVsIframePage() {
  return (
    <PageShell>
      <ArticleStructuredData
        title={TITLE}
        description="Las tres formas reales de integrar reservas web para Pilates, cómo instalarlas en WordPress, Wix y Squarespace, qué configurar después y el checklist legal y técnico antes de publicar."
        slug={SLUG}
        datePublished="2026-08-18"
      />
      <ArticleShell
        category="Software y web"
        coverGradient="linear-gradient(140deg,#173a40,#3E7C86)"
        title={TITLE}
        intro="¿Tu botón de «Reserva aquí» lleva a las alumnas fuera de tu web justo cuando están a punto de confirmar la clase? El método que elijas determina directamente cuántas de esas alumnas potenciales llegan al final del proceso sin abandonar."
        readTime="10 min de lectura"
        toc={TOC}
      >
        <p style={{ fontSize: 19, lineHeight: 1.6, color: '#1A1A1A' }}>¿Tu botón de &quot;Reserva aquí&quot; lleva a las alumnas fuera de tu web justo cuando están a punto de confirmar la clase? Es el problema más común en estudios de pilates: la alumna abandona tu página, pierde el contexto de tu marca y, en muchos casos, no vuelve. El método que elijas para integrar las reservas en la web de tu estudio de pilates determina directamente cuántas de esas alumnas potenciales llegan al final del proceso sin abandonar.</p>
        <p>No es un detalle técnico secundario: es la diferencia entre llenar tus clases y tener plazas vacías. En este artículo encontrarás las tres opciones reales para integrar un sistema de reservas para pilates en tu web, cómo instalar cada una en las plataformas más habituales, qué configurar una vez el sistema está en marcha y qué revisar antes de publicarlo.</p>

        <h2 id="s1">Las tres formas de integrar reservas web para pilates (y en qué se diferencian de verdad)</h2>
        <p>Antes de tocar ningún código, conviene entender qué opciones tienes y qué impacto tiene cada una sobre la experiencia de tus alumnas. No todas las integraciones son iguales, y elegir mal tiene consecuencias directas en conversión.</p>

        <div style={{ border: '1px solid #E7E7E0', borderRadius: 16, overflow: 'hidden', margin: '22px 0' }}>
          <MetodoRow nombre="Redirección externa" veredicto="Más conversión pierde" color="#C2503A" />
          <MetodoRow nombre="Iframe" veredicto="Solución intermedia" color="#C79A2E" />
          <MetodoRow nombre="Widget nativo" veredicto="Mejor experiencia" color="#4E9E7F" />
        </div>

        <h3>Redirección externa: lo más rápido, lo que más conversión cuesta</h3>
        <p>Con la redirección externa, el botón de reserva lleva a la alumna a la plataforma del proveedor en una página completamente diferente. Es la opción más extendida porque no requiere configuración técnica: pegas un enlace y listo. El problema es que la alumna abandona tu web, pierde el contexto de tu marca y el sistema del proveedor no siempre la devuelve a tu página al terminar. La experiencia práctica del sector apunta a pérdidas de entre el 40 y el 60% de reservas potenciales por esta fricción.</p>

        <h3>Iframe: solución intermedia con sus propias limitaciones</h3>
        <p>El iframe incrusta el sistema del proveedor dentro de un recuadro en tu propia página. Visualmente parece integrado, pero técnicamente no lo está: la alumna sigue interactuando con una web de terceros dentro de un marco. Los problemas más habituales en móvil son el diseño que no se adapta bien a pantallas pequeñas, el desplazamiento horizontal y los <a href="https://help.reservio.com/es/articles/10656312-como-solucionar-los-problemas-del-boton-de-reserva-en-iframe-en-safari-iphone-y-ipad" target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'inherit', textDecorationColor: '#C7C7BC' }}>fallos en Safari para iPhone</a>, donde la protección contra el seguimiento entre sitios puede bloquear las cookies de terceros dentro del iframe y romper el flujo de reserva. Úsalo solo como solución temporal o cuando el proveedor no ofrezca una alternativa mejor.</p>

        <h3>Widget nativo: la integración que sí cuida la experiencia de usuario</h3>
        <p>Un widget nativo es un fragmento de código que se muestra directamente en tu página, puede adaptarse a tus colores y tipografía, y el proceso de reserva ocurre sin que la alumna salga en ningún momento de tu dominio. Esta es la integración que convierte más: la alumna permanece en tu web, con tu marca, desde que aterriza hasta que confirma la clase. El <Link href="/funcionalidades/reservas-online" style={{ color: ACC }}>software de gestión</Link> para <Link href="/" style={{ color: ACC }}>estudios de pilates</Link> de Tentare ofrece exactamente este tipo de widget de reservas, configurado con los colores y la imagen de tu estudio, sin redirigir ni mostrar ninguna referencia al proveedor.</p>

        <Callout title="¿Por qué la redirección cuesta tanto?" bg="#F1F2EA" border="#E0E5D0" iconColor={ACC} textColor="#3E4430">
          Si quieres entender la fuga de confianza que provoca la redirección externa, y por qué el widget embebido es la opción más rentable para la mayoría, lee <Link href="/recursos/reservas-en-tu-web" style={{ color: ACC, fontWeight: 700 }}>cómo integrar reservas de Pilates en tu propia web</Link>.
        </Callout>

        <h2 id="s2">Cómo integrar reservas web paso a paso: WordPress, Wix y Squarespace</h2>
        <p>El método de instalación varía según la plataforma con la que hayas construido tu web. Si tu plataforma no aparece en la lista, consulta si admite la inserción de código personalizado: en ese caso, el proceso es equivalente al de Wix o Squarespace. Aquí tienes el flujo concreto para las plataformas más habituales.</p>

        <h3>En WordPress: plugin, shortcode o HTML personalizado</h3>
        <p>WordPress es la plataforma que más opciones ofrece para instalar un sistema de reservas para pilates. El proceso básico es siempre el mismo, aunque varía ligeramente según el maquetador que uses.</p>
        <ol style={{ paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 10, margin: '16px 0' }}>
          <li>Ve a <em>Plugins &gt; Añadir nuevo</em> en tu panel de WordPress, busca el <a href="https://www.booknetic.com/es/blog/mejores-plugins-wordpress-reservas-gimnasios-fitness" target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'inherit', textDecorationColor: '#C7C7BC' }}>plugin de reservas para pilates</a> de tu proveedor e instálalo.</li>
          <li>Configura el plugin con tus clases, horarios, capacidad de plazas y notificaciones básicas.</li>
          <li>Crea o edita la página donde quieres mostrar el calendario de reservas online.</li>
          <li>Inserta el widget según tu maquetador: con el editor de bloques nativo puedes usar el bloque específico del plugin o un bloque de shortcode; con Elementor, arrastra el widget del plugin al lienzo o usa el widget de shortcode con el código del proveedor; si el proveedor facilita un fragmento de código HTML, pégalo en un bloque de HTML personalizado.</li>
          <li>Publica la página y haz una reserva de prueba completa antes de comunicarlo a tus alumnas.</li>
        </ol>

        <h3>En Wix, Squarespace y Webflow: insertar el código del proveedor</h3>
        <p>Estas plataformas no admiten plugins de WordPress. El método en los tres casos es pegar el <a href="https://schedulingkit.com/hub/scheduling/embed-booking-widget-complete-guide" target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'inherit', textDecorationColor: '#C7C7BC' }}>código del widget de reservas</a> que te facilite tu proveedor. En Wix, añade un elemento de HTML personalizado desde el editor, pega el código y ajusta las dimensiones del contenedor para que se vea bien en móvil. En Squarespace, añade un bloque de tipo &quot;Code&quot; o &quot;Embed&quot;, pega el fragmento de código y comprueba que no queda cortado por los márgenes del tema. En Webflow el proceso es equivalente: añade un componente de incrustación en el diseñador y pega el código.</p>
        <p>Un punto que se pasa por alto con frecuencia: si el widget de reservas no es adaptable a móvil por defecto, ajusta manualmente la altura mínima del contenedor. Muchos problemas de visualización vienen de aquí, no del código en sí. Antes de dar nada por publicado, haz la reserva completa en el móvil, comprueba que no hay errores en la consola del navegador y verifica que el correo de confirmación llega correctamente.</p>

        <h2 id="s3">Qué configurar una vez el widget de reservas ya está en tu web</h2>
        <p>Instalar el widget es solo el primer paso. Si lo publicas sin configurar pagos, bonos y recordatorios, tendrás un formulario con buen aspecto que no funciona como debería. Esto es lo que necesitas tener listo desde el primer día.</p>

        <h3>Pagos y tipos de bono</h3>
        <p>Configura los productos de pago antes de publicar: clase suelta, bono de sesiones con fecha de caducidad y cuota mensual recurrente. En España, los métodos más habituales en este sector son tarjeta a través de Redsys para pagos online y Bizum, que gana terreno cada año; para cuotas periódicas, la domiciliación SEPA sigue siendo la opción más robusta. Comprueba que tu proveedor los soporta todos y que el cobro automático funciona antes de lanzar. La automatización real llega cuando el pago y la reserva van juntos: si permites reservar sin pagar, perderás una parte importante del control sobre tu agenda.</p>

        <h3>Políticas de cancelación y lista de espera</h3>
        <p>Define un plazo de cancelación gratuita, por ejemplo, hasta 12 o 24 horas antes de la clase, y decide qué ocurre si la alumna cancela fuera de plazo: pérdida de la sesión del bono, ninguna acción o algún tipo de penalización. No hay una respuesta única; depende del modelo de cada estudio. Lo que sí es imprescindible es activar la lista de espera automática: si alguien cancela dentro del plazo, la plaza se ofrece a la siguiente alumna sin que tengas que intervenir. Tentare gestiona este proceso de forma completamente automática, incluido el aviso a la alumna en lista de espera.</p>

        <h3>Recordatorios automáticos que reducen el absentismo</h3>
        <p>Configura avisos por correo electrónico, notificación de aplicación o WhatsApp 24 horas y 1 hora antes de la clase. Los recordatorios bien configurados son una de las acciones con mayor retorno inmediato: reducen las ausencias sin que tengas que hacer nada. Es una configuración que se completa en cinco minutos y que te ahorra llamadas y mensajes a lo largo de toda la semana.</p>

        <h2 id="s4">Lo que la ley exige si gestionas reservas online en España</h2>
        <p>Gestionar reservas online implica recoger datos personales de tus alumnas. Estos son los puntos mínimos que debes tener cubiertos para <a href="https://cardeseo.com/cumplimiento-legal/sector/gimnasios" target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'inherit', textDecorationColor: '#C7C7BC' }}>cumplir con el RGPD</a> antes de publicar el calendario de reservas online de tu estudio.</p>

        <h3>Avisos de privacidad en el formulario de reserva</h3>
        <p>Al recoger nombre, correo electrónico y teléfono, el formulario debe informar sobre quién trata los datos, con qué finalidad y cuánto tiempo se conservan. Si el sistema recoge información sobre lesiones o patologías para adaptar las clases, esos datos son de categoría especial según el RGPD y requieren una base jurídica reforzada, normalmente consentimiento explícito con casilla desmarcada por defecto. Nunca mezcles el consentimiento de reserva con el de marketing: deben ser dos opciones completamente separadas.</p>

        <h3>El contrato con tu proveedor de software</h3>
        <p>Si el software de reservas almacena datos de tus alumnas en la nube, actúa legalmente como encargado del tratamiento. Debes tener firmado un contrato de encargo de tratamiento con ese proveedor. La mayoría de los sistemas SaaS modernos tienen este documento disponible en su panel o lo facilitan a petición, pero la responsabilidad de firmarlo es tuya. Comprueba también que tu proveedor cumple con <Link href="/recursos/facturacion-electronica-verifactu" style={{ color: ACC }}>VERIFACTU</Link> si emite facturas automáticas: desde 2026 es obligatorio para los nuevos sistemas de facturación en España.</p>

        <h2 id="s5">Checklist antes de publicar el sistema de reservas para pilates en tu web</h2>
        <p><Link href="/recursos/checklist-elegir-software-estudio" style={{ color: ACC }}>Usa esta lista</Link> justo antes de comunicar el nuevo sistema a tus alumnas. Es la diferencia entre un lanzamiento limpio y una tarde de incidencias.</p>

        <Checklist
          eyebrow="Comprobaciones técnicas"
          items={[
            'El widget de reservas se ve correctamente en móvil y en escritorio, sin barras de desplazamiento horizontal ni desbordamientos.',
            'El flujo de reserva completo funciona en producción, no solo en previsualización.',
            'El correo de confirmación llega en menos de 2 minutos y aparece con el nombre de tu estudio como remitente, no el del proveedor.',
            'Los recordatorios automáticos están activados para 24 horas y 1 hora antes de la clase.',
            'Los métodos de pago están configurados y probados con una transacción real.',
            'El calendario de reservas online está completo y actualizado con capacidad, horarios y nombre de la instructora.',
          ]}
        />

        <Checklist
          eyebrow="Comprobaciones legales y de configuración"
          items={[
            'El formulario incluye el aviso de privacidad y el enlace a la política de privacidad de tu estudio.',
            'El consentimiento de marketing está separado del proceso de reserva.',
            'Tienes firmado el contrato de encargo de tratamiento con tu proveedor de software.',
            'Las políticas de cancelación son visibles para la alumna antes de confirmar la reserva, no solo en las condiciones generales al final de la página.',
          ]}
        />

        <h2 id="conclusion">La decisión de cómo integrar reservas web para pilates importa más de lo que parece</h2>
        <p>La forma en que integras las reservas online determina cuántas alumnas potenciales llegan al final del proceso sin abandonar. La redirección externa es la opción más rápida de implementar, pero la que más conversión pierde. El widget nativo, bien configurado y adaptado a tu marca, es el que mejor cuida la experiencia de la alumna y la imagen de tu estudio desde el primer clic hasta la confirmación.</p>
        <p>Integrar un sistema de reservas para pilates en tu web no es solo pegar el código de incrustación: los pagos, las cancelaciones, los recordatorios y el cumplimiento legal son parte del mismo proceso, no añadidos opcionales. Un sistema que funciona a medias genera desconfianza en el momento más crítico.</p>
        <p>Revisa ahora con qué opción trabaja tu estudio. Si hay fricción en el proceso de reserva o el widget que tienes no refleja tu marca, es el mejor momento para cambiarlo. Tentare está diseñado específicamente para estudios de pilates y ofrece este tipo de integración desde 29 euros al mes, sin permanencia, con el sistema de reservas dentro de tu propia web, con tus colores y sin ninguna referencia al proveedor.</p>

        <CtaBlock title="El widget nativo, sin montarlo tú a mano" body="Tentare gestiona pagos, bonos, cancelaciones, lista de espera y recordatorios desde el mismo widget — sin iframe, sin redirección, con tu marca en todo momento." />

        <RelatedLinks
          items={[
            { href: '/recursos/reservas-en-tu-web', category: 'Software y web', categoryColor: '#22251A', title: 'Cómo integrar reservas de Pilates en tu propia web' },
            { href: '/comparativa/tentare-vs-glofox', category: 'Comparativa', categoryColor: ACC, title: 'Glofox vs. Tentare: cuál conviene a tu estudio de Pilates' },
            { href: '/recursos', category: 'Centro de Recursos', categoryColor: '#22251A', title: 'Ver todas las guías para tu estudio →' },
          ]}
        />
      </ArticleShell>
    </PageShell>
  );
}

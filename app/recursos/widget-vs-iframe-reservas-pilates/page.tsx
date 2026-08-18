import type { Metadata } from 'next';
import Link from 'next/link';
import { ArticleShell } from '@/components/recursos/ArticleShell';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { PageShell } from '@/components/recursos/PageShell';
import { Callout, Checklist, CtaBlock, RelatedLinks } from '@/components/recursos/ArticlePrimitives';
import { ArticleStructuredData, FaqStructuredData } from '@/components/recursos/ArticleStructuredData';
import { ACC } from '@/components/landing/theme';
import { urlDe } from '@/lib/seo/paginas';

export const metadata: Metadata = {
  title: 'Widget, iframe o redirección: cómo integrar reservas online — Tentare',
  description: 'Las tres formas técnicas de integrar reservas en la web de tu estudio, comparadas de verdad: qué pierdes con cada una, cómo instalarlas y el checklist antes de publicar.',
  alternates: { canonical: urlDe('/recursos/widget-vs-iframe-reservas-pilates') },
  openGraph: {
    type: 'article',
    title: 'Widget, iframe o redirección: cómo integrar reservas online',
    description: 'Redirección externa, iframe o widget nativo: en qué se diferencian de verdad, y el checklist técnico y legal antes de publicar.',
    url: urlDe('/recursos/widget-vs-iframe-reservas-pilates'),
  },
};

const TOC = [
  { id: 's1', label: 'Las tres formas, comparadas' },
  { id: 's2', label: 'Instalación paso a paso' },
  { id: 's3', label: 'Qué configurar después' },
  { id: 's4', label: 'Checklist antes de publicar' },
  { id: 's5', label: 'Preguntas frecuentes' },
];

const FAQ = [
  { q: '¿Por qué el iframe da problemas en Safari de iPhone?', a: 'La protección contra el seguimiento entre sitios de Safari puede bloquear las cookies de terceros dentro de un iframe, lo que rompe el flujo de reserva a mitad de proceso — sin avisar a la alumna de por qué.' },
  { q: '¿Cuánto se pierde con la redirección externa?', a: 'La experiencia práctica del sector apunta a pérdidas de entre el 40% y el 60% de reservas potenciales por esta fricción, sobre todo cuando el proveedor no devuelve a la alumna a tu página al terminar.' },
  { q: '¿Necesito pedir consentimiento para recoger datos de la reserva?', a: 'No para la reserva en sí — la base legal es el contrato de servicio. Sí necesitas consentimiento explícito y separado si además envías marketing, y una base jurídica reforzada si recoges datos de salud para adaptar las clases.' },
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
        title="Widget, iframe o redirección: cómo integrar reservas online en tu web"
        description="Las tres formas técnicas de integrar un sistema de reservas para Pilates en tu web, comparadas: qué pierdes con cada una, cómo instalarlas y qué revisar antes de publicar."
        slug="widget-vs-iframe-reservas-pilates"
        datePublished="2026-08-18"
      />
      <FaqStructuredData items={FAQ} />
      <ArticleShell
        category="Software y web"
        coverGradient="linear-gradient(140deg,#173a40,#3E7C86)"
        title="Widget, iframe o redirección: cómo integrar reservas online"
        intro="El método que elijas para integrar las reservas determina directamente cuántas alumnas potenciales llegan al final del proceso sin abandonar. No es un detalle técnico secundario: es la diferencia entre llenar tus clases y tener plazas vacías."
        readTime="9 min de lectura"
        toc={TOC}
      >
        <p style={{ fontSize: 19, lineHeight: 1.6, color: '#1A1A1A' }}>Hay tres formas reales de conectar un sistema de reservas a la web de tu estudio, y no son intercambiables: cada una tiene un impacto distinto sobre cuántas alumnas terminan la reserva. Esta guía compara las tres, explica cómo instalarlas en las plataformas más habituales y cierra con el checklist técnico y legal antes de publicar.</p>

        <h2 id="s1">Las tres formas de integrar, y en qué se diferencian de verdad</h2>
        <div style={{ border: '1px solid #E7E7E0', borderRadius: 16, overflow: 'hidden', margin: '22px 0' }}>
          <MetodoRow nombre="Redirección externa" veredicto="Más conversión pierde" color="#C2503A" />
          <MetodoRow nombre="Iframe" veredicto="Solución intermedia" color="#C79A2E" />
          <MetodoRow nombre="Widget nativo" veredicto="Mejor experiencia" color="#4E9E7F" />
        </div>

        <p><strong>Redirección externa:</strong> el botón de reserva lleva a la alumna a la plataforma del proveedor, en una página completamente distinta. Es la más rápida de implementar — pegas un enlace y listo — pero la alumna abandona tu web, pierde el contexto de tu marca y el sistema no siempre la devuelve a tu página al terminar.</p>
        <p><strong>Iframe:</strong> incrusta el sistema del proveedor dentro de un recuadro en tu propia página. Visualmente parece integrado, pero técnicamente no lo está — la alumna sigue interactuando con una web de terceros dentro de un marco. En móvil da problemas de diseño, desplazamiento horizontal, y en Safari de iPhone la protección contra el seguimiento entre sitios puede bloquear las cookies de terceros y romper el flujo de reserva.</p>
        <p><strong>Widget nativo:</strong> un fragmento de código que se muestra directamente en tu página, adaptado a tus colores y tipografía, donde el proceso de reserva ocurre sin que la alumna salga en ningún momento de tu dominio. Es la integración que convierte más — el software de Tentare ofrece exactamente este tipo de widget, sin redirigir ni mostrar referencia al proveedor.</p>

        <Callout title="Úsalo solo como parche temporal" bg="#FBF3E7" border="#F0DFC0" iconColor="#C79A2E" textColor="#5C4A22">
          El iframe tiene sentido únicamente si el proveedor no ofrece un widget nativo. Si tienes la opción de elegir, el widget nativo evita de raíz los problemas de móvil y de cookies de terceros que arrastra el iframe.
        </Callout>

        <h2 id="s2">Cómo instalar un sistema de reservas embebido, paso a paso</h2>
        <p><strong>En WordPress:</strong> ve a <em>Plugins → Añadir nuevo</em>, busca el plugin de tu proveedor e instálalo. Configúralo con tus clases, horarios y capacidad. Después inserta el widget en la página que quieras: con el editor de bloques nativo usa el bloque del plugin o un shortcode; con Elementor, arrastra el widget al lienzo; si tu proveedor solo da un fragmento HTML, pégalo en un bloque de HTML personalizado. Publica y haz una reserva de prueba completa antes de comunicarlo.</p>
        <p><strong>En Wix, Squarespace o Webflow:</strong> el método es el mismo en los tres — añade un elemento de tipo «Insertar código» o «HTML personalizado», pega el fragmento del widget y ajusta el contenedor en ancho y alto. Si el widget no es adaptable a móvil por defecto, ajusta manualmente la altura mínima: muchos problemas de visualización vienen de ahí, no del código en sí.</p>
        <p>Un paso que casi nadie se salta y debería: previsualiza en escritorio <strong>y en móvil real</strong> antes de publicar, comprueba que no hay errores en la consola del navegador, y verifica que el correo de confirmación llega y aparece con el nombre de tu estudio como remitente, no el del proveedor.</p>

        <h2 id="s3">Qué configurar una vez el widget ya está en tu web</h2>
        <p>Instalar el widget es solo el primer paso. Publicarlo sin configurar pagos, bonos y recordatorios da un formulario con buen aspecto que no funciona como debería.</p>
        <Checklist
          eyebrow="Antes de comunicarlo a tus alumnas"
          items={[
            <><strong>Pagos y bonos</strong> — clase suelta, bono con caducidad, cuota recurrente. En España: tarjeta vía Redsys, Bizum y domiciliación SEPA para cuotas periódicas.</>,
            <><strong>Cancelación y lista de espera</strong> — define el plazo de cancelación gratuita y activa la lista de espera automática: si alguien cancela dentro de plazo, la plaza se ofrece sola a la siguiente.</>,
            <><strong>Recordatorios automáticos</strong> — 24h y 1h antes de la clase, por email, app o WhatsApp. Es la configuración con mayor retorno inmediato: reduce ausencias sin que hagas nada.</>,
          ]}
        />

        <h2 id="s4">Lo que la ley exige, y el checklist antes de publicar</h2>
        <p>El formulario debe informar de quién trata los datos, con qué finalidad y cuánto tiempo se conservan. Si recoges información sobre lesiones o patologías para adaptar clases, esos datos son de categoría especial según el RGPD y requieren consentimiento explícito, con casilla desmarcada por defecto — y nunca mezclado con el consentimiento de marketing. Si el software almacena datos de tus alumnas en la nube, actúa como encargado del tratamiento: comprueba que tienes firmado (o disponible) el contrato de encargo correspondiente, y que tu proveedor cumple con <Link href="/recursos/facturacion-electronica-verifactu" style={{ color: ACC }}>Veri*factu</Link> si emite facturas automáticas.</p>

        <Checklist
          eyebrow="Checklist técnico y legal"
          items={[
            'El widget se ve bien en móvil y escritorio, sin desplazamiento horizontal.',
            'El flujo completo funciona en producción, no solo en previsualización.',
            'El correo de confirmación llega en menos de 2 minutos con el nombre de tu estudio.',
            'Recordatorios activados para 24h y 1h antes de la clase.',
            'Métodos de pago configurados y probados con una transacción real.',
            'Aviso de privacidad visible, con el consentimiento de marketing separado del de reserva.',
            'Políticas de cancelación visibles antes de confirmar, no solo al final de la página.',
          ]}
        />

        <h2 id="s5">Preguntas frecuentes</h2>
        <ArticleFaq items={FAQ} />

        <CtaBlock title="El widget nativo, sin montarlo tú a mano" body="Tentare gestiona pagos, bonos, cancelaciones, lista de espera y recordatorios desde el mismo widget — sin iframe, sin redirección, con tu marca en todo momento." />

        <RelatedLinks
          items={[
            { href: '/recursos/reservas-en-tu-web', category: 'Software y web', categoryColor: '#22251A', title: 'Cómo integrar reservas de Pilates en tu propia web' },
            { href: '/funcionalidades/reservas-online', category: 'Funcionalidad', categoryColor: ACC, title: 'Reservas online — ver la funcionalidad completa' },
            { href: '/recursos', category: 'Centro de Recursos', categoryColor: '#22251A', title: 'Ver todas las guías para tu estudio →' },
          ]}
        />
      </ArticleShell>
    </PageShell>
  );
}

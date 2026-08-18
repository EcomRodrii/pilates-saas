import type { Metadata } from 'next';
import { ArticleShell } from '@/components/recursos/ArticleShell';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { PageShell } from '@/components/recursos/PageShell';
import { Callout, Checklist, CtaBlock, RelatedLinks } from '@/components/recursos/ArticlePrimitives';
import { ArticleStructuredData, FaqStructuredData } from '@/components/recursos/ArticleStructuredData';
import { ACC } from '@/components/landing/theme';
import { urlDe } from '@/lib/seo/paginas';

export const metadata: Metadata = {
  title: 'Cómo integrar reservas de Pilates en tu propia web — Tentare',
  description: 'La alumna que reserva y sale de tu web en el proceso, casi siempre no vuelve. Widget, plugin de WordPress o API: qué opción encaja con tu estudio, y por qué.',
  alternates: { canonical: urlDe('/recursos/reservas-en-tu-web') },
  openGraph: {
    type: 'article',
    title: 'Cómo integrar reservas de Pilates en tu propia web',
    description: 'Por qué redirigir a otra plataforma cuesta reservas, y las tres formas reales de evitarlo sin depender de un desarrollador.',
    url: urlDe('/recursos/reservas-en-tu-web'),
  },
};

const TOC = [
  { id: 's1', label: 'Por qué la redirección sale cara' },
  { id: 's2', label: 'Tus tres opciones reales' },
  { id: 's3', label: 'Pagos y RGPD antes de activar' },
  { id: 's4', label: 'Cuánto cuesta de verdad' },
  { id: 's5', label: 'Preguntas frecuentes' },
];

const FAQ = [
  { q: '¿Puedo integrar reservas de Pilates en mi web sin redirigir a otra plataforma?', a: 'Sí. Un widget de reservas embebido carga el formulario dentro de tu propio dominio: la alumna no percibe ningún salto, reserva y paga sin salir de tu web.' },
  { q: '¿Necesito saber programar para instalarlo?', a: 'No, si usas un widget o un plugin. Ambos se instalan pegando un fragmento de código o conectando una cuenta desde el panel — sin desarrollo a medida.' },
  { q: '¿Cuándo tiene sentido pagar una integración por API?', a: 'Sobre todo para cadenas o franquicias con varios centros que necesitan una operativa unificada y control total sobre cada paso. Para un estudio independiente, el coste (desde 1.500€) rara vez se justifica frente a un widget ya resuelto.' },
];

export default function ReservasEnTuWebPage() {
  return (
    <PageShell>
      <ArticleStructuredData
        title="Cómo integrar reservas de Pilates en tu propia web"
        description="Por qué redirigir a otra plataforma cuesta reservas, y las tres formas reales de integrar un sistema de reservas sin salir de tu dominio."
        slug="reservas-en-tu-web"
        datePublished="2026-08-18"
      />
      <FaqStructuredData items={FAQ} />
      <ArticleShell
        category="Software y web"
        coverGradient="linear-gradient(140deg,#1C1F14,#343825)"
        title="Cómo integrar reservas de Pilates en tu propia web"
        intro="La alumna llega a tu web, pulsa «Reservar» y aparece en una pantalla con otro logo y otro diseño. No sabe si sigue en tu web o no. La mayoría cierra esa ventana y no vuelve — y eso no es un problema de diseño, es una fuga de confianza."
        readTime="8 min de lectura"
        toc={TOC}
      >
        <p style={{ fontSize: 19, lineHeight: 1.6, color: '#1A1A1A' }}>¿Puedes integrar reservas de Pilates en tu web sin redirigir a otra plataforma? Sí. Esta guía explica por qué la redirección cuesta tanto, tus tres opciones reales para evitarla, y qué configurar antes de publicar nada.</p>

        <h2 id="s1">Por qué perder a la alumna en la redirección sale caro</h2>
        <p>Tu alumna entra en tu web, percibe tu marca y tu estilo. Cuando pulsa el botón de reserva y aterriza en otra plataforma con otro nombre, su cerebro registra una discontinuidad: algo no cuadra. En móvil el problema se amplifica — la carga es más lenta y el proceso parece interminable.</p>
        <p>Los datos generales de abandono en reservas online rondan el <strong>80%</strong>, y una parte significativa de ese abandono ocurre justo en ese momento de ruptura. Además de la reserva inmediata, pierdes algo que no se ve a primera vista: cuando la transacción ocurre fuera de tu dominio, tu analítica web no la registra como conversión propia.</p>

        <Callout title="La fidelización se construye en cada punto de contacto" bg="#F1F2EA" border="#E0E5D0" iconColor={ACC} textColor="#3E4430">
          La reserva es uno de los momentos más importantes de contacto con tu marca. Si vive en la plataforma de un tercero, el vínculo emocional con tu estudio se debilita — aunque el software funcione perfectamente.
        </Callout>

        <h2 id="s2">Tus tres opciones reales</h2>
        <p><strong>El widget de reservas</strong> es la opción más práctica para la mayoría: un fragmento de código que carga el formulario dentro de tu propia web, con tu diseño y sin cambios de contexto. La implementación es rápida porque no requiere desarrollo a medida — el proveedor mantiene la lógica del sistema.</p>
        <p><strong>El plugin de WordPress</strong> es cómodo si tu web ya está construida ahí: se instala desde el panel, se conecta con tu cuenta y genera un bloque listo para insertar en cualquier página. Antes de elegir uno para tu estudio, revisa que cubra lo específico del sector — gestión por reformer individual, listas de espera automáticas, bonos por sesión. Un plugin genérico de citas se queda corto cuando el estudio crece.</p>
        <p><strong>La integración por API</strong> da control total, pero tiene sentido sobre todo para cadenas con varios centros que necesitan una operativa unificada. Un proyecto a medida parte de 1.500€ y escala hasta 5.000€ o más, además de mantenimiento técnico continuo. Para la mayoría de estudios independientes, un widget bien configurado resuelve el mismo caso sin ese coste.</p>

        <Checklist
          eyebrow="Antes de elegir cualquier proveedor"
          items={[
            <><strong>Sin redirección</strong> — el flujo completo, incluido el pago, ocurre dentro de tu dominio.</>,
            <><strong>Pasarela de pago integrada</strong> (Stripe, Redsys) — nunca deberías gestionar datos de tarjeta en tu propia web directamente.</>,
            <><strong>Sin cuenta obligatoria en el sistema del tercero</strong> para la alumna.</>,
          ]}
        />

        <h2 id="s3">Pagos y RGPD antes de activar las reservas</h2>
        <p>Integrar cobros no significa almacenar datos de tarjeta: eso lo exige la normativa PCI-DSS a una pasarela certificada, no a tu web. En cuanto al RGPD, no necesitas consentimiento explícito para gestionar una reserva — la base legal es el propio contrato de servicio. El consentimiento solo entra en juego si el tratamiento va más allá, por ejemplo para boletines o promociones, y debe pedirse como una opción separada.</p>
        <p>El formulario de reserva debe enlazar de forma visible a tu política de privacidad, y el proveedor del software actúa como encargado del tratamiento de datos — conviene tener firmado (o disponible en el panel) el acuerdo de encargo correspondiente.</p>

        <h2 id="s4">Cuánto cuesta tener reservas embebidas en tu web</h2>
        <p>Un widget de reservas como servicio en la nube, la opción habitual para estudios pequeños y medianos, suele costar entre <strong>29€ y 200€/mes</strong> según las funcionalidades, casi siempre sin comisión por reserva. Las soluciones genéricas para gimnasios pueden superar los 200€/mes y añadir cargos de implementación que no siempre se comunican con claridad. Antes de firmar, calcula también la comisión por reserva (si la hay), la permanencia contractual y si eliminar la marca del proveedor tiene coste extra.</p>

        <p>El widget de Tentare está pensado específicamente para estudios de Pilates: se instala copiando un fragmento de código, sin plugins ni conocimientos técnicos. La alumna elige la clase, el reformer concreto y paga sin salir de tu dominio, con el diseño adaptado a los colores de tu estudio — y con plan de marca blanca para cadenas.</p>

        <h2 id="s5">Preguntas frecuentes</h2>
        <ArticleFaq items={FAQ} />

        <CtaBlock title="Reservas en tu web, sin redirigir a nadie" body="El widget de Tentare se instala en minutos, mantiene tu marca en todo momento y gestiona reformer individual, listas de espera y sustituciones sin que tengas que intervenir." />

        <RelatedLinks
          items={[
            { href: '/recursos/widget-vs-iframe-reservas-pilates', category: 'Software y web', categoryColor: '#22251A', title: 'Widget, iframe o redirección: cómo integrar reservas online' },
            { href: '/funcionalidades/reservas-online', category: 'Funcionalidad', categoryColor: ACC, title: 'Reservas online — ver la funcionalidad completa' },
            { href: '/recursos', category: 'Centro de Recursos', categoryColor: '#22251A', title: 'Ver todas las guías para tu estudio →' },
          ]}
        />
      </ArticleShell>
    </PageShell>
  );
}

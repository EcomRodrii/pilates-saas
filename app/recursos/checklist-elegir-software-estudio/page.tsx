import type { Metadata } from 'next';
import { ArticleShell } from '@/components/recursos/ArticleShell';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { PageShell } from '@/components/recursos/PageShell';
import { ArticleStructuredData } from '@/components/recursos/ArticleStructuredData';
import { Callout, Checklist, CtaBlock, RelatedLinks, StatBlock } from '@/components/recursos/ArticlePrimitives';

export const metadata: Metadata = {
  title: 'Checklist: cómo elegir el software de tu estudio — Tentare',
  description: 'Qué dicen de verdad miles de reseñas en Capterra y G2 sobre Mindbody, Glofox o WellnessLiving, y las preguntas exactas que hay que hacer en una demo antes de firmar.',
  alternates: { canonical: 'https://tentare.app/recursos/checklist-elegir-software-estudio' },
  openGraph: {
    type: 'article',
    title: 'Checklist: cómo elegir el software de tu estudio',
    description: 'Las señales de alarma que las reseñas públicas ya han encontrado por ti, antes de que firmes un contrato de un año.',
    url: 'https://tentare.app/recursos/checklist-elegir-software-estudio',
  },
};

const TOC = [
  { id: 's1', label: 'Por qué esta decisión pesa más de lo que parece' },
  { id: 's2', label: 'Lo que dicen miles de reseñas reales' },
  { id: 's3', label: 'Las preguntas que hay que hacer en la demo' },
  { id: 's4', label: 'Señales de alarma antes de firmar' },
  { id: 's5', label: 'Checklist final' },
  { id: 's6', label: 'Preguntas frecuentes' },
];

const FAQ = [
  {
    q: '¿Un contrato anual es siempre una mala señal?',
    a: 'No necesariamente, pero sí lo es si viene sin opción de mes a mes y con penalización dura por salir antes. Las quejas reales en Capterra y G2 no son sobre el contrato en sí, sino sobre la letra pequeña de cancelación y las subidas de precio a mitad de contrato.',
  },
  {
    q: '¿Cuánto debería tardar en migrar mis datos actuales?',
    a: 'Días, no semanas, si el proveedor se implica de verdad. Si la respuesta en la demo es "eso lo haces tú con un CSV" sin más ayuda, cuenta con perder varias tardes — y con errores en el traspaso de bonos o historial.',
  },
  {
    q: '¿Vale la pena mirar varias fuentes de reseñas o con una basta?',
    a: 'Merece la pena cruzar al menos dos (Capterra y G2, por ejemplo). Un mismo software puede tener puntuación alta en volumen de reseñas y, a la vez, una nota baja específica en "relación calidad-precio" — ese matiz solo se ve comparando fuentes.',
  },
];

export default function ChecklistSoftwarePage() {
  return (
    <PageShell>
      <ArticleStructuredData
        title="Checklist: cómo elegir el software de tu estudio"
        description="Qué dicen de verdad miles de reseñas en Capterra y G2, y las preguntas exactas que hay que hacer en una demo antes de firmar."
        slug="checklist-elegir-software-estudio"
        datePublished="2026-08-06"
      />
      <ArticleShell
        category="Elegir software"
        coverGradient="linear-gradient(140deg,#1C1F14,#343825)"
        title="Checklist: cómo elegir el software de tu estudio"
        intro="Cambiar de software una vez ya duele. Cambiarlo dos veces por no haber preguntado lo correcto en la demo, duele el doble. Esto es lo que ya han encontrado miles de reseñas públicas — antes de que tengas que descubrirlo tú."
        readTime="8 min de lectura"
        toc={TOC}
      >
        <p style={{ fontSize: 19, lineHeight: 1.6, color: '#1A1A1A' }}>
          Elegir el software de tu estudio no es como elegir una app de notas: tus reservas, tus cobros y el historial de tus alumnas van a vivir ahí, normalmente durante años. Antes de pedir una demo, merece la pena leer lo que miles de propietarias ya han escrito sobre sus propios errores.
        </p>

        <h2 id="s1">Por qué esta decisión pesa más de lo que parece</h2>
        <p>
          No es solo el precio mensual. Es la migración si te vas, el bloqueo si el contrato es anual, y la letra pequeña de qué pasa con tus datos y tus cobros si algún día decides cambiar. Un error aquí no se corrige en un mes — se arrastra durante todo el contrato.
        </p>

        <h2 id="s2">Lo que dicen miles de reseñas reales, no el argumentario de ventas</h2>
        <p>
          Cruzando reseñas públicas en Capterra y G2, los temas que más se repiten en 2026 no son sobre funcionalidades que faltan — son sobre el contrato: presión para firmar anual, subidas de precio sin nueva funcionalidad, y fricción para cancelar, según recoge un análisis de reseñas de{' '}
          <a href="https://vibefam.com/capterra-vs-g2-vs-software-advice-for-boutique-studios-2026/" target="_blank" rel="noopener noreferrer nofollow">Vibefam</a>
          . Varias propietarias de estudios de yoga citan concretamente contratos con permanencia de 1.200$ al año y procesos de venta agresivos como su principal queja.
        </p>
        <p>
          En cuanto a las plataformas, según el mismo análisis: <strong>Mindbody</strong> domina en volumen de reseñas (cerca de 3.000 en Capterra) pero arrastra una nota de relación calidad-precio de solo 3,6/5 en Software Advice, la más baja de la comparativa. <strong>Glofox</strong> y <strong>WellnessLiving</strong> rondan 4,4-4,5/5 tanto en Capterra como en G2. Los usuarios de <strong>Arketa</strong> señalan de forma recurrente bugs y regresiones en funciones del día a día. Puedes consultar las reseñas originales directamente en{' '}
          <a href="https://www.capterra.com/gym-management-software/" target="_blank" rel="noopener noreferrer nofollow">Capterra</a>
          .
        </p>

        <StatBlock
          eyebrow="Lo que ya han descubierto otras propietarias · Capterra / G2 2026"
          stats={[
            { value: '3,6/5', label: 'nota de relación calidad-precio del software más grande del sector' },
            { value: '4,4-4,5/5', label: 'nota de las alternativas boutique mejor valoradas' },
            { value: '#1 queja', label: 'fricción de contrato y cancelación, no falta de funciones' },
          ]}
          note="Fuentes: Capterra, G2 y análisis agregado de Vibefam sobre reseñas públicas de software de gestión de estudios."
        />

        <Callout title="La idea clave">
          El problema número uno que reportan las propietarias reales no es &quot;le falta una función&quot;. Es el contrato: cuánto tarda en subir el precio, y qué tan difícil es salir. Pregunta eso ANTES de preguntar por funcionalidades — casi todas las plataformas grandes ya las tienen todas.
        </Callout>

        <h2 id="s3">Las preguntas que hay que hacer en la demo</h2>
        <Checklist
          eyebrow="Antes de decir que sí"
          items={[
            <><strong>¿Puedo exportar todos mis datos cuando quiera</strong>, en un formato que pueda usar en otro sitio?</>,
            <><strong>¿Qué pasa si cancelo a mitad de un contrato anual?</strong> Pide la cláusula exacta, no un resumen verbal.</>,
            <><strong>¿El precio puede subir sin previo aviso?</strong> Y si sube, ¿con cuánta antelación te avisan?</>,
            <><strong>¿Hay comisión sobre mis cobros</strong>, además de la cuota mensual?</>,
            <><strong>¿Cómo se gestiona una sustitución de última hora?</strong> Pide que te lo enseñen en vivo, no que te lo describan.</>,
            <><strong>¿Cuánto tardan en migrarme los datos</strong> desde mi sistema actual, y quién lo hace?</>,
          ]}
        />

        <h2 id="s4">Señales de alarma antes de firmar</h2>
        <Checklist
          eyebrow="Si ves esto, para y pregunta más"
          items={[
            <>Solo ofrecen contrato anual, sin ninguna opción de mes a mes aunque sea más cara.</>,
            <>El precio &quot;no se puede decir&quot; sin hablar antes con ventas — para funciones básicas de gestión, no debería hacer falta.</>,
            <>No hay periodo de prueba real, solo una demo grabada o guiada por comercial.</>,
            <>La migración de datos &quot;la haces tú&quot; sin ningún acompañamiento ni checklist.</>,
          ]}
        />

        <h2 id="s5">Checklist final</h2>
        <Checklist
          eyebrow="Resumen para llevar a la demo"
          items={[
            <>Lee reseñas de AL MENOS dos fuentes (Capterra + G2) antes de la primera llamada.</>,
            <>Lleva las 6 preguntas de la sección anterior por escrito — no confíes en la memoria durante la demo.</>,
            <>Pide la cláusula de cancelación por escrito, no un resumen de palabra.</>,
            <>Pregunta específicamente por el caso que más dolor te da hoy (sustituciones, cobros, lista de espera) y pide que te lo enseñen en vivo.</>,
          ]}
        />

        <h2 id="s6">Preguntas frecuentes</h2>
        <ArticleFaq items={FAQ} />

        <CtaBlock
          title="Sin permanencia, migración incluida en 48h"
          body="Tentare no ata con contrato anual ni cobra comisión sobre tus cobros. Y si te vas, tus datos son tuyos — los exportas cuando quieras."
        />

        <RelatedLinks
          items={[
            { href: '/recursos/cubrir-baja-instructora', category: 'Sustituciones y equipo', categoryColor: '#4E9E7F', title: 'Cómo cubrir una baja de instructora sin hacer una llamada' },
            { href: '/recursos/estudios-pilates-de-exito', category: 'Rentabilidad', categoryColor: '#3E7C86', title: 'Qué puedes aprender de los estudios de pilates que más crecen' },
          ]}
        />
      </ArticleShell>
    </PageShell>
  );
}

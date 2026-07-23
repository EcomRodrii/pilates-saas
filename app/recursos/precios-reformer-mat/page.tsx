import type { Metadata } from 'next';
import { ArticleShell } from '@/components/recursos/ArticleShell';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { PageShell } from '@/components/recursos/PageShell';
import { Callout, Checklist, CtaBlock, RelatedLinks, StatBlock } from '@/components/recursos/ArticlePrimitives';

export const metadata: Metadata = {
  title: 'Reformer vs. mat: cómo poner precio a cada clase — Tentare',
  description: 'Dos formatos, dos costes, dos techos de ingresos. Cómo fijar precios de Pilates reformer y mat que reflejen la diferencia, sin dejar dinero sobre la mesa.',
  alternates: { canonical: 'https://tentare.app/recursos/precios-reformer-mat' },
  openGraph: {
    type: 'article',
    title: 'Reformer vs. mat: cómo poner precio a cada clase',
    description: 'Cómo fijar precios que reflejen la diferencia entre reformer y mat, sin dejar dinero sobre la mesa.',
    url: 'https://tentare.app/recursos/precios-reformer-mat',
  },
};

const TOC = [
  { id: 's1', label: 'Por qué no cuestan lo mismo' },
  { id: 's2', label: 'El coste real de una plaza' },
  { id: 's3', label: 'Cómo estructurar precios y bonos' },
  { id: 's4', label: 'Protege ese precio' },
  { id: 's5', label: 'Preguntas frecuentes' },
];

const FAQ = [
  { q: '¿Puedo cobrar mat y reformer con el mismo bono?', a: 'Puedes, con bonos que valen distinto según el formato (p. ej. una sesión de reformer descuenta más crédito que una de mat). Así respetas la diferencia de coste sin complicar la compra.' },
  { q: '¿Cada cuánto debería revisar precios?', a: 'Al menos una vez al año, y siempre que suba un coste importante (alquiler, salarios). Revisa también la ocupación: si el reformer va siempre lleno con lista de espera, el mercado te está diciendo que hay margen.' },
  { q: '¿Subir precios no me hará perder alumnas?', a: 'Una subida pequeña y bien comunicada rara vez vacía una clase con demanda. Sube primero donde tengas lista de espera, avisa con antelación y respeta el precio a quien ya tiene bono en curso.' },
];

function PriceTable() {
  const rows = [
    { formato: 'Mat', suelta: 'base', bono: 'descuento por volumen' },
    { formato: 'Reformer', suelta: 'base × 1,6-2', bono: 'premium, plazas limitadas' },
  ];
  return (
    <div style={{ border: '1px solid #E7E7E0', borderRadius: 16, overflow: 'hidden', margin: '22px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', background: '#F5F5F1', borderBottom: '1px solid #E7E7E0' }}>
        {['Formato', 'Suelta', 'Bono / mes'].map((h) => (
          <div key={h} className="lp-mono" style={{ padding: '12px 16px', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8E8E86' }}>{h}</div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={r.formato} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', borderBottom: i < rows.length - 1 ? '1px solid #EDEDE6' : undefined }}>
          <div style={{ padding: '13px 16px', fontSize: 14, fontWeight: 600 }}>{r.formato}</div>
          <div style={{ padding: '13px 16px', fontSize: 14, color: '#5A5A52' }}>{r.suelta}</div>
          <div style={{ padding: '13px 16px', fontSize: 14, color: '#5A5A52' }}>{r.bono}</div>
        </div>
      ))}
    </div>
  );
}

export default function PreciosReformerPage() {
  return (
    <PageShell>
      <ArticleShell
        category="Rentabilidad"
        coverGradient="linear-gradient(140deg,#173a40,#3E7C86)"
        title="Reformer vs. mat: cómo poner precio a cada clase"
        intro="Dos formatos, dos costes, dos techos de ingresos. Cómo fijar precios que reflejen la diferencia — sin dejar dinero sobre la mesa."
        readTime="7 min de lectura"
        toc={TOC}
      >
        <p style={{ fontSize: 19, lineHeight: 1.6, color: '#1A1A1A' }}>Muchos estudios ponen el mismo precio al mat y al reformer, o lo dejan a ojo. Es uno de los errores que más silenciosamente drena la rentabilidad: son dos negocios distintos bajo el mismo techo, con costes y límites de plazas muy diferentes.</p>
        <p>Esta guía explica cómo pensar el precio de cada formato — y cómo proteger ese precio de los huecos vacíos, que es donde de verdad se pierde el dinero.</p>

        <h2 id="s1">Por qué reformer y mat no cuestan lo mismo</h2>
        <p>El mat escala con el espacio: si cabe una esterilla más, entra una alumna más casi sin coste añadido. El <strong>reformer está limitado por las máquinas</strong>: el aforo queda fijado el día que firmas el alquiler y compras el equipo. Cada plaza de reformer carga con más coste — máquina, mantenimiento, un ratio instructora/alumna más bajo — y suele tener más demanda que oferta.</p>
        <p>Conclusión práctica: el reformer debe costar <strong>notablemente más</strong> que el mat, y la diferencia debe ser deliberada, no un redondeo.</p>

        <Callout title="Regla rápida" bg="#EDF3F4" border="#D6E5E7" iconColor="#3E7C86" textColor="#33474A">
          Si tu reformer y tu mat cuestan lo mismo, o estás dejando dinero en el reformer, o estás espantando alumnas del mat. Casi nunca es el precio correcto para ambos.
        </Callout>

        <h2 id="s2">Calcula el coste real de una plaza</h2>
        <p>Antes de fijar precio, necesitas saber cuánto te cuesta ofrecer <strong>una plaza en una clase</strong>. Suma el coste de la instructora por clase, el prorrateo de alquiler y suministros, el mantenimiento del equipo y divídelo entre las plazas reales de esa clase. Ese es tu suelo: por debajo, pierdes dinero llenando.</p>

        <StatBlock
          eyebrow="Coste por plaza · ejemplo ilustrativo"
          eyebrowColor="#7FD4C1"
          stats={[
            { value: '≈ 4-6€', label: 'Mat (14 plazas) · coste por plaza' },
            { value: '≈ 9-13€', label: 'Reformer (8 plazas) · coste por plaza' },
          ]}
          note="Cifras de ejemplo para ilustrar el método. Calcula las tuyas con tus costes y aforos reales."
        />

        <h2 id="s3">Cómo estructurar tus precios y bonos</h2>
        <p>Con el suelo claro, construye hacia arriba. Lo habitual funciona en tres niveles, y cada uno debe reflejar la diferencia entre formatos:</p>
        <PriceTable />
        <p>El bono mensual premia la recurrencia y te da ingresos previsibles; la clase suelta es la más cara por sesión (paga la flexibilidad). Y el reformer siempre por encima del mat en cada nivel.</p>

        <h2 id="s4">Protege ese precio de los huecos vacíos</h2>
        <p>Aquí está el dinero que casi nadie cuenta: <strong>una plaza de reformer vacía en una clase reservada es ingreso que no recuperas jamás</strong>. Puedes tener el precio perfecto y aun así perder si las cancelaciones de última hora dejan huecos sin llenar.</p>
        <p>Tres defensas que funcionan juntas:</p>
        <Checklist
          eyebrow="Tres defensas"
          items={[
            <><strong>Ventana de cancelación</strong> con una regla clara — quien cancela tarde, pierde la sesión del bono.</>,
            <><strong>Lista de espera automática</strong> que llena el hueco en cuanto alguien cancela.</>,
            <><strong>Recordatorios</strong> que bajan las ausencias sin que hagas nada.</>,
          ]}
        />
        <p>Un buen software aplica estas tres reglas solo. Tú fijas la política una vez; el sistema la ejecuta en cada clase.</p>

        <h2 id="s5">Preguntas frecuentes</h2>
        <ArticleFaq items={FAQ} />

        <CtaBlock title="Precios, bonos y huecos — resueltos solos" body="Tentare cobra bonos por formato, aplica tus reglas de cancelación y llena los huecos con lista de espera automática." />

        <RelatedLinks
          items={[
            { href: '/recursos/cubrir-baja-instructora', category: 'Sustituciones y equipo', categoryColor: '#8B5CF6', title: 'Cómo cubrir una baja sin hacer una llamada' },
            { href: '/recursos', category: 'Centro de Recursos', categoryColor: '#5B21B6', title: 'Ver todas las guías para tu estudio →' },
          ]}
        />
      </ArticleShell>
    </PageShell>
  );
}

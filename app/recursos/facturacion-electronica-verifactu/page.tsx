import type { Metadata } from 'next';
import { ArticleShell } from '@/components/recursos/ArticleShell';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { PageShell } from '@/components/recursos/PageShell';
import { BeforeAfterCols, Checklist, CtaBlock, RelatedLinks, StatBlock } from '@/components/recursos/ArticlePrimitives';
import { IconCheck } from '@/components/landing/icons';
import { ACC } from '@/components/landing/theme';

export const metadata: Metadata = {
  title: 'Facturación electrónica para estudios de Pilates en España: qué cambia con Veri*factu',
  description: 'Qué es Veri*factu, cuándo es obligatorio (2027) y qué debe tener cada factura de tu estudio de Pilates. Checklist de cumplimiento, sin letra pequeña.',
  alternates: { canonical: 'https://tentare.app/recursos/facturacion-electronica-verifactu' },
  openGraph: {
    type: 'article',
    title: 'Facturación electrónica para estudios de Pilates: qué cambia con Veri*factu',
    description: 'Qué es Veri*factu, cuándo es obligatorio y qué debe tener cada factura de tu estudio.',
    url: 'https://tentare.app/recursos/facturacion-electronica-verifactu',
  },
};

const TOC = [
  { id: 's1', label: 'Qué es Veri*factu' },
  { id: 's2', label: 'Cuándo es obligatorio' },
  { id: 's3', label: 'Qué debe tener cada factura' },
  { id: 's4', label: 'TicketBAI: un régimen aparte' },
  { id: 's5', label: 'Checklist de cumplimiento' },
  { id: 's6', label: 'Preguntas frecuentes' },
];

const FAQ = [
  { q: '¿Me afecta si soy autónoma y tributo por módulos?', a: 'En general sí: Veri*factu aplica a la inmensa mayoría de autónomos y empresas que emiten facturas, con matices según el régimen. Consulta tu caso concreto con tu asesoría.' },
  { q: '¿Qué pasa si mi estudio no cumple a tiempo?', a: 'La normativa prevé sanciones para el software y los negocios que no se adapten. Lo importante es no dejarlo para el último trimestre: cambiar de software de facturación lleva tiempo.' },
  { q: '¿Tengo que hacer algo yo, o lo hace el software?', a: 'Con un software que ya cumple Veri*factu de fábrica, tú sigues facturando como siempre; el hash, el QR y el envío a la AEAT ocurren solos en cada factura.' },
  { q: '¿Veri*factu sustituye mi declaración de IVA?', a: 'No. Veri*factu certifica que tus facturas son íntegras y trazables; tus declaraciones de IVA e IRPF las sigues presentando igual, normalmente con tu asesoría.' },
];

export default function VerifactuPage() {
  return (
    <PageShell>
      <ArticleShell
        category="España y fiscalidad"
        coverGradient="linear-gradient(140deg,#3a2148,#8B4F9E)"
        title="Facturación electrónica: qué cambia con Veri*factu"
        intro="Qué es, cuándo te obliga y qué debe tener cada factura de tu estudio a partir de ahora. Sin letra pequeña."
        readTime="7 min de lectura"
        toc={TOC}
      >
        <p style={{ fontSize: 19, lineHeight: 1.6, color: '#1A1A1A' }}>Si gestionas un estudio de Pilates en España, es probable que ya hayas oído hablar de Veri*factu — y también es probable que no tengas del todo claro qué significa para tu día a día. Esta guía lo resume sin tecnicismos: qué es, cuándo te obliga y qué tiene que hacer tu software de facturación por ti.</p>

        <h2 id="s1">Qué es Veri*factu y por qué te afecta</h2>
        <p>Veri*factu es el sistema que exige la <strong>Ley Antifraude</strong> (desarrollada en el Real Decreto 1007/2023) para que el software de facturación no pueda ocultar, modificar ni eliminar ventas. Cada factura que emites queda <strong>encadenada a la anterior mediante un hash</strong> y lleva un <strong>código QR</strong> de verificación. Si tu sistema está en modalidad Veri*factu, además puede enviar el registro a la Agencia Tributaria en el momento de emitirla.</p>
        <p>En la práctica, para tu estudio esto significa una cosa: <strong>el programa que uses para facturar bonos, mensualidades y clases sueltas tiene que cumplirlo</strong>. No es una casilla más en tu declaración — es un requisito técnico del propio software.</p>

        <h2 id="s2">Cuándo es obligatorio</h2>
        <p>El calendario se ha movido más de una vez. Tras el aplazamiento aprobado por el Real Decreto-ley 15/2025 (2 de diciembre de 2025), las fechas vigentes hoy son:</p>
        <StatBlock
          eyebrow="Calendario vigente"
          eyebrowColor="#C08BE8"
          stats={[
            { value: '1 enero 2027', label: 'Empresas (Impuesto sobre Sociedades)' },
            { value: '1 julio 2027', label: 'Autónomos y resto de negocios' },
          ]}
          note="La mayoría de estudios de Pilates en España — autónomas o pequeñas sociedades — entran en el segundo grupo. Confirma tu caso con tu asesoría: los plazos han cambiado antes y pueden volver a ajustarse."
        />
        <p>2026 es, en la práctica, <strong>el año para prepararte</strong> sin la presión de la fecha límite encima. Cambiar de software de facturación lleva semanas, no días: revisar los datos, migrarlos y comprobar que todo cuadra.</p>

        <h2 id="s3">Qué debe tener cada factura</h2>
        <p>Con un sistema en modalidad Veri*factu, cada factura que emite tu estudio incluye de forma automática:</p>
        <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '22px 24px', margin: '22px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {[
              <>Un <strong>código QR</strong> que cualquiera puede escanear para verificarla ante la AEAT.</>,
              <>Una <strong>huella (hash)</strong> encadenada a la factura anterior, para que no se pueda alterar el historial sin que se note.</>,
              <>Una <strong>frase identificativa</strong> (&ldquo;Factura verificable en la sede electrónica de la AEAT&rdquo; o similar) cuando el sistema envía el registro en tiempo real.</>,
              <>Un <strong>registro inalterable</strong> de cada evento — no solo de la factura final, también de anulaciones y correcciones.</>,
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, background: '#F1ECFB', color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{IconCheck(12)}</span>
                <span style={{ fontSize: 15, lineHeight: 1.5, color: '#3A3A34' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <BeforeAfterCols
          beforeLabel="Excel o software sin Veri*factu"
          beforeItems={['Facturas editables después de emitidas', 'Sin QR ni huella de verificación', 'Numeración que puedes romper sin darte cuenta', 'Cero envío a la AEAT']}
          afterLabel="Con Veri*factu nativo"
          afterItems={['Cada factura, sellada al emitirla', 'QR y hash generados solos', 'Numeración correlativa garantizada', 'Lista para enviar a la AEAT']}
        />

        <h2 id="s4">TicketBAI: un régimen aparte</h2>
        <p>Si tu estudio está en <strong>País Vasco o Navarra</strong>, ojo: ahí rige TicketBAI, un sistema propio de las haciendas forales, distinto de Veri*factu. Hoy en Tentare tenemos Veri*factu nativo; TicketBAI no está soportado todavía. Si es tu caso, pregúntanoslo antes de decidirte — preferimos decírtelo aquí a que lo descubras después.</p>

        <h2 id="s5">Checklist de cumplimiento</h2>
        <Checklist
          eyebrow="Antes de que llegue tu fecha límite"
          items={[
            'Confirma con tu asesoría si eres autónoma, sociedad o régimen especial — y qué fecha te toca.',
            'Revisa si tu software actual de facturación ya cumple Veri*factu, o si te toca migrar.',
            'No dejes la migración para el último trimestre: exportar, revisar y probar tus datos lleva tiempo.',
            'Si estás en País Vasco o Navarra, confirma el régimen de TicketBAI aparte.',
          ]}
        />

        <h2 id="s6">Preguntas frecuentes</h2>
        <ArticleFaq items={FAQ} />

        <CtaBlock title="Veri*factu, ya incluido de serie." body="Tentare emite tus facturas con hash y QR desde el primer cobro. Sin capas externas ni sorpresas en 2027." />

        <RelatedLinks
          items={[
            { href: '/recursos/cubrir-baja-instructora', category: 'Sustituciones y equipo', categoryColor: '#8B5CF6', title: 'Cómo cubrir una baja sin hacer una llamada' },
            { href: '/recursos/precios-reformer-mat', category: 'Rentabilidad', categoryColor: '#3E7C86', title: 'Reformer vs. mat: cómo poner precio a cada clase' },
          ]}
        />
      </ArticleShell>
    </PageShell>
  );
}

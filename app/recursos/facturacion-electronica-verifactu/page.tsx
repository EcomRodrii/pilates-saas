import type { Metadata } from 'next';
import Link from 'next/link';
import { ArticleShell } from '@/components/recursos/ArticleShell';
import { fechaModificada, guia } from '@/lib/recursos/guias';
import { openGraphGuia } from '@/lib/recursos/schema';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { PageShell } from '@/components/recursos/PageShell';
import { BeforeAfterCols, Checklist, CtaBlock, RelatedLinks, StatBlock } from '@/components/recursos/ArticlePrimitives';
import { ArticleStructuredData, FaqStructuredData } from '@/components/recursos/ArticleStructuredData';
import { Check } from 'lucide-react';
import { ACC } from '@/components/landing/theme';
import { urlDe } from '@/lib/seo/paginas';

const GUIA = guia('facturacion-electronica-verifactu');

const DESCRIPCION = 'Veri*Factu en tu estudio de Pilates: si es una sociedad, el programa debe estar adaptado antes del 1 de enero de 2027; si eres autónoma, antes del 1 de julio.';

export const metadata: Metadata = {
  title: 'Facturación electrónica para estudios de Pilates en España: qué cambia con Veri*factu',
  description: DESCRIPCION,
  alternates: { canonical: urlDe('/recursos/facturacion-electronica-verifactu') },
  openGraph: {
    type: 'article',
    title: 'Facturación electrónica para estudios de Pilates: qué cambia con Veri*factu',
    description: 'Qué es Veri*factu, cuándo te obliga según seas sociedad o autónoma y qué debe tener cada factura de tu estudio.',
    url: urlDe('/recursos/facturacion-electronica-verifactu'),
    ...openGraphGuia(GUIA.slug),
  },
};

const TOC = [
  { id: 's1', label: 'Qué es Veri*factu' },
  { id: 's2', label: 'Cuándo es obligatorio' },
  { id: 's3', label: 'Qué debe tener cada factura' },
  { id: 's4', label: 'País Vasco y Navarra' },
  { id: 's5', label: 'La factura electrónica entre empresas' },
  { id: 's6', label: 'Checklist de cumplimiento' },
  { id: 's7', label: 'Preguntas frecuentes' },
];

// Fechas y reglas contrastadas el 25-sep-2026 con el texto consolidado del
// RD 1007/2023 (disposición final cuarta, tras el RDL 15/2025) y las preguntas
// frecuentes de la AEAT enlazadas en «Fuentes». Si cambian, se cambian aquí y
// en `actualizado` de lib/recursos/guias.ts.
const FAQ = [
  { q: '¿Me afecta si soy autónoma y tributo por módulos?', a: 'Con carácter general, no: según la AEAT, quien está en módulos y en el régimen simplificado del IVA no tiene obligación de expedir facturas, y por eso el reglamento no le afecta. Pero si expides facturas con un programa, aunque sea de forma voluntaria, ese programa sí tiene que cumplirlo. Confirma tu caso con tu asesoría.' },
  { q: '¿Qué pasa si mi estudio no cumple a tiempo?', a: 'La normativa prevé sanciones tanto para los programas que no cumplen como para los negocios que los usan. Lo importante es no apurar la fecha: cambiar de programa de facturación lleva semanas.' },
  { q: '¿Tengo que hacer algo yo, o lo hace el software?', a: 'Con un programa adaptado, tú sigues facturando como siempre: el registro, la huella y el QR se generan solos. Pregunta en qué modalidad trabaja: en VERI*FACTU envía cada registro a la AEAT de forma automática; en la no verificable no los envía, pero tiene que firmarlos y llevar un registro de eventos. Si tu proveedor te dice que el envío «está por llegar», pregúntale cómo cumplirá en tu fecha.' },
  { q: '¿Puedo seguir facturando con Excel o Word?', a: 'Según la AEAT, una hoja de cálculo o un procesador de texto no son un sistema informático de facturación si solo los usas para escribir, emitir e imprimir las facturas; sí lo son si con ellos generas tus libros registro, por ejemplo con una macro. La AEAT ofrece además una aplicación gratuita de facturación.' },
  { q: '¿Veri*factu sustituye mi declaración de IVA?', a: 'No. Garantiza que tus facturas son íntegras y trazables; tus declaraciones de IVA e IRPF las sigues presentando igual, normalmente con tu asesoría.' },
];

const FUENTES = [
  { titulo: 'BOE: Real Decreto 1007/2023, texto consolidado (plazos en la disposición final cuarta)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840' },
  { titulo: 'AEAT: preguntas frecuentes sobre quién está obligado (módulos, hojas de cálculo, País Vasco y Navarra)', url: 'https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/cuestiones-generales-ambitos-aplicacion.html' },
  { titulo: 'AEAT: preguntas frecuentes sobre los sistemas VERI*FACTU', url: 'https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/sistemas-verifactu.html' },
  { titulo: 'AEAT: preguntas frecuentes sobre el código QR y la frase «VERI*FACTU»', url: 'https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/posibilidad-remision-informacion-factura-parte-receptor.html' },
  { titulo: 'BOE: Real Decreto 238/2026, factura electrónica obligatoria entre empresarios y profesionales', url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-7295' },
];

export default function VerifactuPage() {
  return (
    <PageShell>
      <ArticleStructuredData
        title="Facturación electrónica para estudios de Pilates en España: qué cambia con Veri*factu"
        description={DESCRIPCION}
        slug="facturacion-electronica-verifactu"
      />
      <FaqStructuredData items={FAQ} />
      <ArticleShell
        category={GUIA.seccion}
        coverGradient="linear-gradient(140deg,#22251A,#5A6142)"
        title="Facturación electrónica: qué cambia con Veri*factu"
        intro="Qué es, cuándo te obliga según seas sociedad o autónoma y qué debe tener cada factura de tu estudio. Sin letra pequeña."
        readTime={`${GUIA.lectura} min de lectura`}
        actualizado={fechaModificada(GUIA)}
        toc={TOC}
      >
        <p style={{ fontSize: 19, lineHeight: 1.6, color: '#1A1A1A' }}>Si gestionas un estudio de Pilates en España, es probable que ya hayas oído hablar de Veri*factu — y también es probable que no tengas del todo claro qué significa para tu día a día. Esta guía lo resume sin tecnicismos: qué es, cuándo te obliga y qué tiene que hacer tu programa de facturación por ti.</p>

        <h2 id="s1">¿Qué es Veri*factu y por qué te afecta?</h2>
        <p>La <strong>Ley Antifraude</strong> (Ley 11/2021) exige que los programas de facturación no permitan ocultar, modificar ni borrar ventas, y el <strong>Real Decreto 1007/2023</strong> lo desarrolla: es el reglamento de los sistemas informáticos de facturación. Cada factura que emites genera un <strong>registro de facturación</strong> con su huella (hash), encadenado al registro anterior, y la factura lleva impreso un <strong>código QR</strong>.</p>
        <p>El reglamento admite <strong>dos formas de cumplirlo</strong>. En la modalidad <strong>VERI*FACTU</strong>, el programa envía de forma automática a la Agencia Tributaria el registro de cada factura al emitirla. En la otra, la de los sistemas «no verificables», los registros no se envían, pero el programa tiene que firmarlos electrónicamente y llevar además un registro de eventos. VERI*FACTU es una de las dos vías, no la única.</p>
        <p>En la práctica, para tu estudio esto significa una cosa: <strong>el programa que uses para facturar bonos, mensualidades y clases sueltas tiene que cumplir el reglamento</strong>. No es una casilla más en tu declaración — es un requisito técnico del propio software. (Definición corta en el <Link href="/glosario#verifactu" style={{ color: ACC }}>glosario</Link>.)</p>

        <h2 id="s2">¿Cuándo es obligatorio Veri*factu?</h2>
        <p>El calendario se ha movido más de una vez. Tras el aplazamiento aprobado por el Real Decreto-ley 15/2025 (2 de diciembre de 2025), las fechas vigentes hoy son:</p>
        <StatBlock
          eyebrow="Calendario vigente"
          eyebrowColor="#A8B080"
          stats={[
            { value: '1 enero 2027', label: 'Sociedades (Impuesto sobre Sociedades)' },
            { value: '1 julio 2027', label: 'Autónomas y resto de obligados' },
          ]}
          note="Lo que decide la fecha es el impuesto, no el tamaño: cualquier sociedad, aunque sea pequeña, está en el primer grupo. Confirma tu caso con tu asesoría: los plazos han cambiado antes y pueden volver a ajustarse."
        />
        <p>Si tu estudio es una <strong>sociedad limitada</strong>, tu fecha es el <strong>1 de enero de 2027</strong>, y cambiar de programa de facturación lleva semanas, no días: revisar los datos, migrarlos y comprobar que todo cuadra. Si eres <strong>autónoma</strong>, tienes hasta el 30 de junio de 2027, y tampoco conviene apurarlo.</p>
        <p>Esas dos fechas son para <strong>quien emite las facturas</strong> — tu estudio. Los <strong>fabricantes del software</strong> tenían su propia fecha para adaptar sus programas: el <strong>29 de julio de 2025</strong>. Pregunta a tu proveedor en qué modalidad cumple y desde cuándo.</p>

        <h2 id="s3">¿Qué debe tener cada factura?</h2>
        <p>Con un programa adaptado, cada factura que emite tu estudio cumple de forma automática con esto:</p>
        <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '22px 24px', margin: '22px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {[
              <>Un <strong>código QR</strong> impreso, en las dos modalidades. Con él, quien recibe la factura puede cotejarla en la sede electrónica de la AEAT (en VERI*FACTU) o enviarle sus datos (en los sistemas no verificables).</>,
              <>Junto al QR, <strong>solo en la modalidad VERI*FACTU</strong>, la frase &ldquo;Factura verificable en la sede electrónica de la AEAT&rdquo; o &ldquo;VERI*FACTU&rdquo;. No vale una frase parecida.</>,
              <>Detrás de cada factura, un <strong>registro de facturación con su huella</strong>, encadenado al registro anterior: si alguien toca el historial, la cadena se rompe.</>,
              <>Las <strong>anulaciones</strong> también generan registro: anular no borra, deja constancia. Los sistemas no verificables llevan además un registro de eventos.</>,
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, background: '#F1F2EA', color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Check size={12} /></span>
                <span style={{ fontSize: 15, lineHeight: 1.5, color: '#3A3A34' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <BeforeAfterCols
          beforeLabel="Programa no adaptado"
          beforeItems={['Facturas que se pueden editar después de emitidas', 'Sin registro encadenado', 'Numeración que puedes romper sin darte cuenta', 'Nada que cotejar']}
          afterLabel="Programa adaptado"
          afterItems={['Cada factura, con su registro al emitirla', 'Huella encadenada al registro anterior', 'Numeración correlativa garantizada', 'QR en la factura y, en VERI*FACTU, cada registro enviado a la AEAT']}
        />

        <h2 id="s4">País Vasco y Navarra: otro régimen</h2>
        <p>Si tu domicilio fiscal está en el <strong>País Vasco o en Navarra</strong>, este reglamento estatal no se te aplica: rige la normativa de tu hacienda foral. En el País Vasco es <strong>TicketBAI</strong>; Navarra tiene su propia normativa. Hoy Tentare emite las facturas con numeración legal y huella encadenada; el QR se imprime cuando la AEAT ya tiene el registro, y el envío automático a la AEAT sigue en construcción. TicketBAI no está soportado. Si es tu caso, pregúntanoslo antes de decidirte — preferimos decírtelo aquí a que lo descubras después.</p>

        <h2 id="s5">La factura electrónica entre empresas es otra obligación</h2>
        <p>No confundas Veri*factu con la <strong>factura electrónica obligatoria entre empresas y profesionales</strong>, que regula el Real Decreto 238/2026. Solo afecta a las facturas que emites a otras empresas o profesionales, no a las de tus alumnas, que son particulares. Se aplicará doce meses después de la orden ministerial que regula la solución pública de facturación electrónica para quien facture más de 8 millones de euros al año, y veinticuatro meses después para el resto.</p>

        <h2 id="s6">Checklist de cumplimiento</h2>
        <Checklist
          eyebrow="Antes de que llegue tu fecha límite"
          items={[
            'Confirma con tu asesoría si tributas como sociedad (1 de enero de 2027) o como autónoma (1 de julio de 2027).',
            'Pregunta a tu proveedor de software en qué modalidad cumple, VERI*FACTU o no verificable, y desde cuándo.',
            'Si tienes que cambiar de programa, empieza ya: exportar, revisar y probar tus datos lleva semanas.',
            'Si tu domicilio fiscal está en el País Vasco o en Navarra, confirma con tu hacienda foral qué sistema te toca.',
          ]}
        />

        <h2 id="s7">Preguntas frecuentes</h2>
        <ArticleFaq items={FAQ} />

        <h2 id="fuentes">Fuentes</h2>
        <ul>
          {FUENTES.map((f) => (
            <li key={f.url}><a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: ACC }}>{f.titulo}</a>, consultada el 25 de septiembre de 2026.</li>
          ))}
        </ul>

        <CtaBlock title="Numeración y huella, desde el primer cobro." body="Tentare emite tus facturas con numeración legal y huella encadenada desde el primer cobro. El QR se imprime cuando la AEAT tiene el registro, y el envío automático a la AEAT está en construcción: te lo contamos sin rodeos." />

        <RelatedLinks
          items={[
            { href: '/funcionalidades/facturacion', category: 'Producto', categoryColor: '#3E7C86', title: 'Cómo factura Tentare, punto por punto' },
            { href: '/recursos/cubrir-baja-instructora', category: 'Sustituciones y equipo', categoryColor: '#6E7650', title: 'Cómo cubrir una baja sin hacer una llamada' },
          ]}
        />
      </ArticleShell>
    </PageShell>
  );
}

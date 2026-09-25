import { ArticleShell, type TocItem } from '@/components/recursos/ArticleShell';
import { PageShell } from '@/components/recursos/PageShell';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { Callout, CtaBlock, RelatedLinks, StatBlock } from '@/components/recursos/ArticlePrimitives';
import { TextoMarcado } from '@/components/recursos/TextoMarcado';
import { PortadaCabecera } from '@/components/recursos/PortadaCabecera';
import { portadaArticulo } from '@/lib/recursos/articulos/portadas';
import { CalculadoraRentabilidad } from '@/components/recursos/CalculadoraRentabilidad';
import { DescargaRecurso } from '@/components/recursos/DescargaRecurso';
import { RECURSOS_DESCARGABLES } from '@/lib/recursos/descargas';
import { captchaDeServidorListo } from '@/lib/auth/captcha-servidor';
import { CATEGORIAS_RECURSOS } from '@/lib/recursos/guias';
import { fechaArticulo, minutosLectura } from '@/lib/recursos/articulos';
import { articuloLd, faqLd, migasLd, textoPlano } from '@/lib/recursos/articulos/schema';
import { contarPalabras } from '@/lib/recursos/articulos/validar';
import { PAGINAS } from '@/lib/seo/paginas';
import type { Articulo, Bloque } from '@/lib/recursos/articulos/tipos';

// Pinta un artículo de /recursos escrito como datos (lib/recursos/articulos).
// Todo lo que no es contenido —JSON-LD, índice, «En resumen», FAQ, fuentes,
// enlaces relacionados y llamada a la acción— sale de aquí, igual en todos.

const GRADIENTES: Record<string, string> = {
  abrir: 'linear-gradient(140deg,#2b2a1d,#6E7650)',
  sustituciones: 'linear-gradient(140deg,#22463a,#4E9E7F)',
  rentabilidad: 'linear-gradient(140deg,#1f3d42,#3E7C86)',
  operacion: 'linear-gradient(140deg,#5e2318,#C2503A)',
  espana: 'linear-gradient(140deg,#22251A,#5A6142)',
  software: 'linear-gradient(140deg,#1C1F14,#343825)',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (f: string) => { const [a, m, d] = f.split('-'); return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`; };

function Ld({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

function BloqueArticulo({ b }: { b: Bloque }) {
  switch (b.t) {
    case 'p':
      return <p><TextoMarcado texto={b.texto} /></p>;
    case 'lista': {
      const Lista = b.ordenada ? 'ol' : 'ul';
      return (
        <Lista style={{ paddingLeft: 22, margin: '14px 0 20px', lineHeight: 1.6 }}>
          {b.items.map((it, i) => <li key={i} style={{ margin: '6px 0' }}><TextoMarcado texto={it} /></li>)}
        </Lista>
      );
    }
    case 'pasos':
      return (
        <ol style={{ listStyle: 'none', padding: 0, margin: '20px 0', display: 'grid', gap: 12 }}>
          {b.items.map((it, i) => (
            <li key={i} style={{ display: 'flex', gap: 14, background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '16px 18px' }}>
              <span aria-hidden="true" style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 999, background: '#343825', color: '#fff', fontWeight: 800, fontSize: 13, display: 'grid', placeItems: 'center' }}>{i + 1}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 4 }}>{it.titulo}</div>
                <div style={{ fontSize: 15, lineHeight: 1.6, color: '#3A3A34' }}><TextoMarcado texto={it.texto} /></div>
              </div>
            </li>
          ))}
        </ol>
      );
    case 'tabla':
      return (
        <figure style={{ margin: '22px 0' }}>
          <div style={{ overflowX: 'auto', border: '1px solid #E7E7E0', borderRadius: 16, background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: b.cabecera.length > 3 ? 560 : undefined }}>
              <thead>
                <tr style={{ background: '#F5F5F1' }}>
                  {b.cabecera.map((c) => (
                    <th key={c} scope="col" style={{ textAlign: 'left', padding: '11px 14px', fontSize: 11.5, letterSpacing: '.05em', textTransform: 'uppercase', color: '#5A5A52', fontWeight: 700, borderBottom: '1px solid #E7E7E0' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.filas.map((f, i) => (
                  <tr key={i} style={{ borderBottom: i < b.filas.length - 1 ? '1px solid #EDEDE6' : undefined }}>
                    {f.map((c, j) => (
                      <td key={j} style={{ padding: '11px 14px', verticalAlign: 'top', lineHeight: 1.45, fontWeight: j === 0 ? 600 : 400, color: j === 0 ? '#1A1A1A' : '#3A3A34' }}><TextoMarcado texto={c} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {b.nota && <figcaption style={{ fontSize: 12.5, color: '#6B6B63', marginTop: 8, lineHeight: 1.5 }}><TextoMarcado texto={b.nota} /></figcaption>}
        </figure>
      );
    case 'nota':
      return <Callout title={b.titulo}><TextoMarcado texto={b.texto} /></Callout>;
    case 'cifras':
      return <StatBlock eyebrow={b.titulo} stats={b.cifras.map((c) => ({ value: c.valor, label: c.etiqueta }))} note={textoPlano(b.nota)} />;
    case 'herramienta':
      return <CalculadoraRentabilidad />;
    case 'descarga': {
      // Sin captcha de servidor la ruta responde 503 a todo: mejor no enseñar un
      // formulario que siempre falla. Aparece solo en el primer despliegue que
      // tenga `TURNSTILE_SECRET_KEY` (la página es estática: se decide al construir).
      if (!captchaDeServidorListo()) return null;
      // Al cliente le llegan los textos del recuadro; el archivo va por correo
      // (su ruta no es secreta, ver lib/recursos/descargas.ts).
      const r = RECURSOS_DESCARGABLES[b.recurso];
      return <DescargaRecurso recurso={b.recurso} formato={r.formato} llamada={r.llamada} promesa={r.promesa} />;
    }
  }
}

export function ArticuloDatos({ a }: { a: Articulo }) {
  const toc: TocItem[] = [
    ...a.secciones.map((s) => ({ id: s.id, label: s.titulo })),
    { id: 'preguntas-frecuentes', label: 'Preguntas frecuentes' },
    ...(a.fuentes.length ? [{ id: 'fuentes', label: 'Fuentes' }] : []),
  ];
  const categoria = CATEGORIAS_RECURSOS.find((c) => c.key === a.categoria);
  const relacionadas = a.relacionadas.map((ruta) => {
    const p = PAGINAS.find((x) => x.path === ruta);
    return { href: ruta, category: categoria?.label ?? 'Recursos', categoryColor: '#6E7650', title: p?.etiqueta ?? ruta };
  });

  return (
    <PageShell>
      <Ld data={migasLd(a)} />
      <Ld data={articuloLd(a)} />
      <Ld data={faqLd(a)} />
      <ArticleShell
        category={a.seccion}
        coverGradient={GRADIENTES[a.categoria] ?? GRADIENTES.software}
        title={a.titulo}
        intro={textoPlano(a.entradilla)}
        readTime={`${minutosLectura(contarPalabras(a))} min de lectura`}
        actualizado={fechaArticulo(a)}
        toc={toc}
      >
        {portadaArticulo(a.slug) && <PortadaCabecera portada={portadaArticulo(a.slug)!} />}

        <section aria-label="En resumen" style={{ background: '#fff', border: '1px solid #E0E5D0', borderLeft: '4px solid #6E7650', borderRadius: 16, padding: '18px 20px', margin: '0 0 28px' }}>
          <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#6E7650', marginBottom: 8 }}>En resumen</div>
          <p style={{ margin: 0, fontSize: 16.5, lineHeight: 1.6, color: '#1A1A1A' }}><TextoMarcado texto={a.respuesta} /></p>
        </section>

        {a.secciones.map((s) => (
          <section key={s.id} aria-labelledby={s.id}>
            <h2 id={s.id}>{s.titulo}</h2>
            {s.bloques.map((b, i) => <BloqueArticulo key={i} b={b} />)}
          </section>
        ))}

        <h2 id="preguntas-frecuentes">Preguntas frecuentes</h2>
        <ArticleFaq items={a.faq.map((f) => ({ q: textoPlano(f.q), a: textoPlano(f.a) }))} />

        {a.fuentes.length > 0 && (
          <>
            <h2 id="fuentes">Fuentes</h2>
            <ol style={{ paddingLeft: 22, fontSize: 14, lineHeight: 1.55, color: '#3A3A34' }}>
              {a.fuentes.map((f) => (
                <li key={f.url} style={{ margin: '6px 0' }}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3A3A34', textDecoration: 'underline', textUnderlineOffset: 3 }}>{f.titulo}</a>
                  <span style={{ color: '#6B6B63' }}> · consultada el {fechaLarga(f.consultada)}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        {a.cta.enlace
          ? <CtaBlock title={a.cta.titulo} body={textoPlano(a.cta.texto)} href={a.cta.enlace.href} cta={a.cta.enlace.texto} />
          : <CtaBlock title={a.cta.titulo} body={textoPlano(a.cta.texto)} cta="Probar 7 días gratis →" />}
        <RelatedLinks items={[...relacionadas, { href: '/recursos', category: 'Centro de Recursos', categoryColor: '#22251A', title: 'Ver todas las guías para tu estudio →' }]} />
      </ArticleShell>
    </PageShell>
  );
}

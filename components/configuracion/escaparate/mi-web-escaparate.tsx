'use client';

/* eslint-disable @next/next/no-img-element -- foto del estudio (Storage) o la de muestra */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { BarChart3, ExternalLink, Eye, EyeOff, Globe, PenLine, Plus } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { hrefDeHerramienta, hrefDeLugar, hrefDeTarjeta } from '@/lib/configuracion/destino';
import { pasosMiWeb, type DatosMiWeb, type IdPasoMiWeb } from '@/lib/configuracion/mi-web-pasos';
import { filaDePortada } from '@/lib/widgets/fila-portada';
import { conVistaPrevia } from '@/lib/widgets/integracion';
import { Interruptor } from '@/components/ui/interruptor';
import { BotonCopiar, useOrigen } from '@/components/configuracion/tab-estudio-enlaces';
import { useConstructorWidgets } from '@/components/widgets/usar-constructor';
import { usePublicarEnMiWeb } from '@/components/widgets/v2/usar-publicar-en-mi-web';
import { Barra, BotonAccion, Etiqueta, Marco, Telefono, Tema, type Accion } from './piezas';
import e from './escaparate.module.css';

// «Mi web» como la «Tienda online» de Shopify (maqueta aprobada por el fundador el 27-nov-2026). Los mismos
// cinco asuntos, estados, cajones y herramienta que la guiada (lib/configuracion/mi-web-pasos.ts): la página
// en grande, su dirección, los widgets con su aspecto real, quién te encuentra y cómo te presentas.

interface Comun {
  showToast: (m: string) => void;
  datos: Omit<DatosMiWeb, 'widgets'>;
  acciones: Record<Exclude<IdPasoMiWeb, 'network'>, Accion>;
  network: { on: boolean | null; onCambiar: (v: boolean) => Promise<string | null> };
}

interface Puesto { id: string; nombre: string; chip: string | null; aviso: boolean }

/** Los que se enseñan con su aspecto: la vista de `/reservar` de cada uno (lib/widgets/catalogo.ts). */
const MUESTRARIO = [
  { id: 'horario', nombre: 'Horario y reservas', detalle: 'Que reserven desde tu web', q: 'tab=clases&solo=1' },
  { id: 'planes', nombre: 'Planes y precios', detalle: 'Que compren desde tu web', q: 'tab=planes' },
  { id: 'contacto', nombre: 'Formulario de contacto', detalle: 'Las consultas llegan a Clientes', q: 'tab=contacto' },
  { id: 'estudio', nombre: 'El estudio', detalle: 'Dónde estás y qué ofreces', q: 'tab=estudio' },
  { id: 'equipo', nombre: 'Instructoras', detalle: 'Tu equipo, en tu web', q: 'tab=equipo' },
] as const;

export function MiWebEscaparate(props: Comun) {
  const { studio } = useStudio();
  return studio?.slug
    ? <ConWidgets {...props} slug={studio.slug} />
    : <Vista {...props} slug={null} puestos={[]} nombres={[]} avisoWidgets={null} pendiente={null} veResultados={false} />;
}

function ConWidgets(props: Comun & { slug: string }) {
  const s = useConstructorWidgets({ slug: props.slug, showToast: props.showToast, textos: 'v2' });
  const barra = usePublicarEnMiWeb(s);
  const w = useMemo(() => {
    const filas = [...s.filasTienes].sort((a, b) => Date.parse(b.en) - Date.parse(a.en));
    const leidas = filas.map(f => ({ f, p: filaDePortada(f, s.ahora) }));
    return {
      puestos: leidas.map(({ f, p }) => ({ id: f.id, nombre: f.nombre, chip: p.chip?.texto ?? null, aviso: !!p.aviso || p.chip?.tono === 'aviso' })),
      nombres: filas.map(f => f.nombre),
      avisoWidgets: leidas.map(x => x.p.aviso).find(a => !!a)?.texto ?? null,
    };
  }, [s.filasTienes, s.ahora]);
  return <Vista {...props} {...w} pendiente={barra.texto} veResultados={s.veResultados} />;
}

function Vista({ datos: base, acciones, network, showToast, slug, puestos, nombres, avisoWidgets, pendiente, veResultados }: Comun & {
  slug: string | null;
  puestos: Puesto[];
  nombres: string[];
  avisoWidgets: string | null;
  /** Lo que hay sin publicar en su web. `null`: nada. */
  pendiente: string | null;
  veResultados: boolean;
}) {
  const { studio } = useStudio();
  const datos: DatosMiWeb = { ...base, widgets: { nombres, aviso: avisoWidgets } };
  const pasos = pasosMiWeb(datos);
  const paso = (id: IdPasoMiWeb) => pasos.find(p => p.id === id)!;
  const origen = useOrigen();
  const url = slug ? `/reservar/${encodeURIComponent(slug)}` : null;
  const legible = url ? `${origen.replace(/^https?:\/\//, '').replace(/^www\./, '')}${url}` : null;
  const widgetsHref = hrefDeHerramienta('widgets');
  const aWidgets = (texto: string): Accion => ({ tipo: 'enlace', href: widgetsHref, texto });
  const oculta = datos.pagina?.oculta === true;
  // La píldora de la vista previa: lo que está sin publicar y, si no, lo primero que falta.
  const pildora: { texto: string; accion: Accion } | null = pendiente
    ? { texto: pendiente, accion: aWidgets(pendiente) }
    : !datos.direccion ? { texto: 'Ponle una dirección a tu página', accion: acciones.direccion }
    : !datos.descripcion ? { texto: 'Preséntate: falta tu descripción', accion: acciones.presentacion }
    : null;

  return (
    <div className={e.raiz} data-testid="mi-web-escaparate" data-escaparate>
      <Barra titulo="Mi web" Icono={Globe} ruta={hrefDeLugar({ tab: 'web' })}>
        {datos.pagina && (
          <button type="button" aria-haspopup="dialog" onClick={() => acciones['quien-la-ve'].tipo === 'cajon' && acciones['quien-la-ve'].abrir()} className={e.boton}>
            {oculta ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}{oculta ? 'Oculta' : 'Visible'}
          </button>
        )}
        {url && <a href={url} target="_blank" rel="noreferrer" className={e.boton}><ExternalLink size={14} aria-hidden />Abrir mi página</a>}
      </Barra>

      <div className={e.escaparate}>
        {url ? (
          <PaginaEnGrande url={url} />
        ) : (
          <img src="/por-defecto/estudio-hero.webp" alt="" className={e.fondo} />
        )}
        <div className={e.velo} />
        <div className={e.pie}>
          <div style={{ minWidth: 0 }}>
            <p className={e.nombre}>Mi página de reservas</p>
            <p className={e.detalle}>{legible ?? 'Aún sin dirección'}</p>
          </div>
          {pildora ? <BotonAccion accion={pildora.accion} clase={e.pastilla} texto={pildora.texto}><PenLine size={16} aria-hidden /></BotonAccion> : <span />}
          <div className={e.pieDerecha}>
            <Link href="/configuracion/apariencia?paso=estilo" className={e.boton}>Cambiar estilo</Link>
          </div>
        </div>
      </div>

      <section className={`${e.tarjeta} ${e.promo}`} aria-labelledby="mi-web-direccion" id="paso-direccion">
        <div>
          <h3 id="mi-web-direccion">{paso('direccion').titulo}</h3>
          <p className={e.suave}>{paso('direccion').nota}</p>
          <div className={e.acciones}><BotonAccion accion={acciones.direccion} /></div>
        </div>
        <div className={e.ilustracion} aria-hidden>
          <span style={{ position: 'absolute', left: 44, right: 22, top: 34, bottom: -10, borderRadius: 16, border: '1px solid var(--border)' }} />
          <span style={{ position: 'absolute', left: 58, right: 46, top: 52, display: 'flex', height: 40, alignItems: 'center', gap: 6, padding: '0 16px', borderRadius: 99, background: 'var(--card)', boxShadow: '0 8px 20px rgba(0,0,0,0.1)', fontSize: 14 }}>
            tentare.app/<i style={{ width: 76, height: 9, borderRadius: 9, background: 'var(--border)' }} />
          </span>
        </div>
      </section>

      {url && (
        <div className={e.tarjeta} style={{ padding: 8 }}>
          <table className={e.tabla}>
            <thead><tr><th>Dirección</th><th className={e.opcional}>Para qué</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              <tr>
                <td style={{ overflowWrap: 'anywhere' }}>{legible} <Etiqueta tono="contorno">Para tu web</Etiqueta></td>
                <td className={`${e.suave} ${e.opcional}`}>Enlazarla o integrarla en tu web</td>
                <td><Etiqueta tono={oculta ? 'falta' : datos.pagina ? 'ok' : 'neutra'}>{oculta ? 'Oculta' : datos.pagina ? 'Visible' : 'Sin comprobar'}</Etiqueta></td>
                <td style={{ textAlign: 'right' }}>{origen && <BotonCopiar texto={`${origen}${url}`} que="El enlace de la página de reservas" showToast={showToast} />}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className={e.seccion} id="paso-widgets">
        <h2>{paso('widgets').titulo}</h2>
        <div className={e.acciones}>
          {veResultados && url && <Link href={`${widgetsHref}&vista=resultados`} className={e.botonGris}><BarChart3 size={14} aria-hidden />Ver resultados</Link>}
          <Link href={widgetsHref} className={e.botonGris}><Plus size={14} aria-hidden />Tus widgets</Link>
        </div>
      </div>
      <p className={e.suave} data-testid="mi-web-estado-widgets">{pendiente ?? paso('widgets').estado}</p>
      {url && (
        <ul className={e.rejilla} style={{ margin: 0, padding: 0, listStyle: 'none' } as CSSProperties}>
          {MUESTRARIO.map(m => {
            const puesto = puestos.find(p => p.id === m.id);
            return (
              <Tema key={m.id} nombre={m.nombre} detalle={m.detalle} accion={aWidgets(puesto ? 'Cambiar' : 'Agregar')}
                estado={puesto ? (puesto.chip ?? 'En tu web') : null} tono={puesto?.aviso ? 'falta' : 'ok'}>
                <Marco src={conVistaPrevia(`${url}?embed=1&${m.q}`)} titulo={`Así se ve: ${m.nombre}`} ancho={420} alto={410} />
              </Tema>
            );
          })}
          <li className={e.explora}>
            <h3>Explora más widgets</h3>
            <p className={e.suave}>Clase de prueba, bonos, citas, una clase concreta o la cuenta de tus clientes.</p>
            <Link href={widgetsHref} className={e.botonGris}>Ver todos</Link>
          </li>
        </ul>
      )}

      <div className={e.seccion}><h2>Quién te encuentra</h2></div>
      <div className={`${e.tarjeta} ${e.ajustes}`}>
        <div className={e.caja}>
          <div className={e.opcion} id="paso-quien-la-ve">
            <div>
              <b>{paso('quien-la-ve').titulo}</b>
              <p className={e.suave}>{paso('quien-la-ve').porque}</p>
              <div className={e.estado}><Etiqueta tono={oculta ? 'falta' : datos.pagina ? 'ok' : 'neutra'}>{paso('quien-la-ve').estado}</Etiqueta></div>
            </div>
            <BotonAccion accion={acciones['quien-la-ve']} />
          </div>
          <div className={e.opcion} id="network">
            <div>
              <b>{paso('network').titulo}</b>
              <p className={e.suave}>{paso('network').porque}</p>
              <p className={e.suave}>{paso('network').nota}</p>
            </div>
            <InterruptorNetwork {...network} />
          </div>
        </div>
      </div>

      <div className={e.seccion} id="paso-presentacion"><h2>{paso('presentacion').titulo}</h2></div>
      <div className={`${e.tarjeta} ${e.presentacion}`}>
        <div className={e.ficha}>
          <img src={studio?.imagenBienvenidaUrl || '/por-defecto/estudio-hero.webp'} alt="" loading="lazy" />
          <div>
            <h3>{studio?.nombre}</h3>
            <p className={e.suave} style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {studio?.descripcion?.trim() || 'Tu descripción saldrá aquí.'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
          <p>{paso('presentacion').porque}</p>
          <Etiqueta tono={datos.descripcion ? 'ok' : 'falta'}>{paso('presentacion').estado}</Etiqueta>
          <BotonAccion accion={acciones.presentacion} />
          <p className={e.suave}>{paso('presentacion').donde}. {paso('presentacion').nota}</p>
        </div>
      </div>

      <p className={e.pieDePagina}>
        <span className={e.suave}>El enlace y el QR de tu app están en </span><Link href="/configuracion/apariencia?paso=instalar">Mi app</Link>
        <span className={e.suave}> · La dirección de tu web, en </span><Link href={hrefDeTarjeta('contacto')}>Mi estudio</Link>
      </p>
    </div>
  );
}

/** Su página de verdad en ordenador y en móvil. Con `vista-previa=1`, para que mirarla no cuente como visita. */
function PaginaEnGrande({ url }: { url: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(966);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const o = new ResizeObserver(([x]) => setAncho(x.contentRect.width));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return (
    <div ref={caja} className={e.ventana} aria-hidden>
      <div className={e.soloAncho}>
        <Marco src={conVistaPrevia(url)} titulo="Vista previa de tu página de reservas" ancho={1280} alto={760} escala={ancho / 1280} />
      </div>
      <Telefono src={conVistaPrevia(url)} titulo="Tu página en el móvil" ancho={158} clase={e.movilWeb} bajoLaIsla />
    </div>
  );
}

/** El interruptor de Network: se guarda al tocarlo y solo se mueve con la fila confirmada. */
function InterruptorNetwork({ on, onCambiar }: Comun['network']): ReactNode {
  const [pedido, setPedido] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function cambiar(v: boolean) {
    if (pedido !== null || on === null) return;
    setPedido(v);
    setError(null);
    try {
      const fallo = await onCambiar(v);
      if (fallo) setError(fallo);
    } catch {
      setError('No hemos podido hablar con el servidor');
    } finally {
      setPedido(null);
    }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <Interruptor on={pedido ?? on ?? false} onChange={v => { void cambiar(v); }} ariaLabel="Aparecer en Tentare Network" disabled={on === null} ocupado={pedido !== null} />
      {error && <span role="alert" className="max-w-[16rem] text-[12px] font-medium text-destructive">{error}</span>}
    </div>
  );
}

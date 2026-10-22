'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, EyeOff, Globe, Loader2, TrendingUp } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { cn } from '@/lib/utils';
import { btnPrimary, btnSecondary } from '@/components/configuracion/estilos';
import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { BotonVivo } from '@/components/dashboard/vivo';
import { llevarAlTitulo } from './lleva-al-titulo';
import { LineaDePasos } from '@/components/dashboard/linea-de-pasos';
import { WIDGETS, esDisponible, type WidgetDisponible } from '@/lib/widgets/catalogo';
import { leerCopiados } from '@/lib/widgets/config';
import { textoMes, type EmbudoWidget } from '@/lib/widgets/embudo';
import { unirGrupos } from '@/lib/widgets/en-tu-web';
import { hrefDeTarjeta } from '@/lib/configuracion/destino';
import { puedeVer } from '@/lib/permisos-reglas';
import { nadaParaSinMarco } from '@/lib/widget/estilo-nativa';
import { leerWeb, nombrePlataforma, type EstadoWeb, type PlataformaWeb } from '@/lib/widgets/recetas';
import { FOCO, TACTIL, fechaCorta } from './piezas';
import { PasoPlataforma } from './paso-plataforma';
import { PasoQue } from './paso-que';
import { PasoComo } from './paso-como';
import { PasoPonlo } from './paso-ponlo';
import { LoQueTienes } from './lo-que-tienes';
import { VistaPrevia, type Dispositivo } from './vista-previa';
import { GestionDominios } from './dominios';
import { hayCopias, useConstructorWidgets } from './usar-constructor';
import type { MostrarToast } from '@/components/ui/toast';

// «Tentare Widgets»: el constructor, en el orden en que lo piensa la dueña de
// un estudio —con qué está hecha su web (una vez), qué pone y dónde, cómo se
// ve, y ponerlo—. Tentare no hace la web del estudio: le da piezas que
// funcionan de verdad para meter en la suya.
//
// ⚠️ La config efectiva viaja CONGELADA en el código copiado (decisión de
// producto del 2026-08-20, no reabrir): esto guarda en `studios.widget_builder`
// solo para no perder lo ajustado al volver. Guardado con debounce y SOLO tras
// una edición — nunca al montar (fijar línea base al cargar escribe datos que
// nadie tocó). Y FUSIONANDO sobre lo que había (`fusionarWidgetBuilder`): ahí
// viven también `_web` y la huella de lo copiado.
//
// ⚠️ Los tres pasos están SIEMPRE montados y solo se oculta el que no toca:
// el código (su <pre>) tiene que estar en el DOM desde el principio, también
// mientras se contesta la pregunta de la web.
//
// El ESTILO de sus widgets (Fase B, 28-sep-2026) es otra cosa: no va en el
// código ni en `widget_builder`, sino en el tema publicado, y se aplica con su
// botón (./usar-estilo-web.ts). Por eso su borrador vive aquí arriba: lo leen la
// vista previa, «Cómo se ve» y «Ponlo en tu web», y no depende del widget abierto.
//
// «Lo que tienes en tu web» (Fase C, 28-sep-2026) es la portada cuando ya ha
// copiado algo: un paso más (`'tienes'`) en estado de React, nunca en la URL
// (escribir `&paso=` rompería los enlaces que ya traen aquí). Se decide SOLO con
// lo copiado, que se sabe al montar: lo visto en su web llega después, y
// decidir con eso haría saltar la pantalla. Se monta y se desmonta; los tres
// pasos siguen montados debajo, ocultos, con el código en el DOM.
//
// El botón que abre la ventana (Fase D, 29-sep-2026) sigue ese estilo en vivo:
// el código lleva variables CSS y, de respaldo, el botón como se ve HOY en su
// web —lo PUBLICADO, nunca el borrador: es lo que pintará mientras no llegue el
// de ahora—. La vista previa, en cambio, pinta el borrador. Y al copiar se
// marca si lo copiado lee esas variables (`copiado.botonVivo`), con el mismo
// predicado que las emite: es lo único que dice si un botón pegado cambia solo.
//
// Sin marco (Fase E, 29-sep-2026) el estilo también llega, con sus datos: la
// vista previa pinta el borrador con las mismas funciones que el bundle, y al
// copiar se guarda la versión que dirá ver su web (`firmaContenidoDe`).
//
// El código por ID (30-sep-2026, lib/widgets/pieza.ts): el código lleva solo el
// id del widget, y su contenido lo pone Tentare con lo PUBLICADO (`widget_piezas`).
// Lo publicado se crea al abrir «Ponlo en tu web» la primera vez (aún no hay
// nada pegado con ese id: no cambia nada en su web) y después solo cambia con
// «Aplicar en mi web» o al copiar el código. Lo que va en el propio HTML (el
// ancho, la carga diferida, el botón) sigue pidiendo pegarlo otra vez. Si no hay
// nada publicado y no se puede crear, el código congelado de siempre.
//
// ⚠️ El color del estudio es el del TEMA (`estiloWeb.base.colorPrimario`, lo que
// elige en Marca), no la columna `studios.color_primario`: en casi todos los
// estudios esa columna es el índigo que escribe el alta y no ha elegido nadie
// (lib/emails/color-marca.ts). La columna, solo mientras carga el tema. Con él
// se pintan el botón a su página en el código (su `style`, que `firmaCodigo` no
// cuenta), la vista previa y las muestras.

// El estado y las reglas viven en `useConstructorWidgets` (./usar-constructor.tsx),
// que comparte con «Tu web» v2 (./v2/, tras `MI_WEB_NUEVA`); aquí se quedan los
// pasos de ESTA pantalla y su JSX de siempre.

type Paso = 'tienes' | 'plataforma' | 'que' | 'como' | 'ponlo';
// Sin web no hay dónde «ponerlo»: el último paso se llama por lo que hace.
function pasosDe(plataforma: PlataformaWeb | null): readonly { id: Exclude<Paso, 'plataforma'>; nombre: string; siguiente: string }[] {
  const ponlo = plataforma === 'sinweb' ? 'Compártelo' : 'Ponlo en tu web';
  return [
    { id: 'que', nombre: 'Qué y dónde', siguiente: 'Siguiente: qué y dónde' },
    { id: 'como', nombre: 'Cómo se ve', siguiente: 'Siguiente: cómo se ve' },
    { id: 'ponlo', nombre: ponlo, siguiente: `Siguiente: ${ponlo.toLowerCase()}` },
  ];
}
/** Panel nuevo: el título-objetivo y la frase de cada paso (Bonsai B1). */
const TITULO_PASO: Record<'que' | 'como' | 'ponlo', (p: PlataformaWeb | null) => { titulo: string; sub: string }> = {
  que: () => ({ titulo: 'Elige qué enseñas y dónde', sub: 'Una pieza de tu estudio dentro de tu web: tu horario, tus precios o la cuenta de tus alumnas.' }),
  // «a la derecha» no era verdad en el móvil, donde la vista previa va encima.
  como: () => ({ titulo: 'Cómo se ve', sub: 'Míralo en la vista previa, tal como lo verá tu alumna. El estilo es el mismo para todos tus widgets.' }),
  ponlo: p => (p === 'sinweb'
    ? { titulo: 'Compártelo', sub: 'Copia el enlace y ponlo donde quieras: Instagram, WhatsApp o tu newsletter.' }
    : { titulo: 'Ponlo en tu web', sub: 'Copia el código y pégalo en tu web, o mándaselo a quien te la lleva.' }),
};
type EstadoGuardado = 'guardando' | 'guardado' | 'error' | null;

export function ConstructorWidgets({ slug, showToast, onVerResultados }: {
  slug: string;
  showToast: MostrarToast;
  /**
   * Lleva a «Cómo le va a tu página», centrada en la fila de esa etiqueta
   * (`null`: sin etiqueta que medir, se abre sin centrar en ninguna).
   */
  onVerResultados?: (etiqueta: string | null) => void;
}) {
  const { studio } = useStudio();
  const panelNuevo = usePanelNuevo();
  const {
    rol, origen, estiloWeb,
    setActivoId, w, copiados, web, configEfectiva, entrada,
    guardado, cambiar, guardarWeb, plataforma, receta, metodo, elegirMetodo,
    veResultados, resultadosMes, paginaOculta, sinAplicar, creando, prepararCodigo, aplicando, aplicarContenido,
    registrarCopia, ahora, datos, guardarDominios, dominiosAutorizados, direccionWeb,
    copias, filasTienes, copia, desfase, porId, conCopias, etiquetaActiva, resultadoActivo,
    faltaPrevia, paginaCompleta, urlPrevia, contenido, anchoWidget, noSigueElEstilo, forma, suWeb, piezas, avisos,
    quitarDisenoPropio,
  } = useConstructorWidgets({ slug, showToast });

  const [paso, setPaso] = useState<Paso>(() => {
    if (!leerWeb(studio?.widgetBuilder).plataforma) return 'plataforma';
    return hayCopias(leerCopiados(studio?.widgetBuilder)) ? 'tienes' : 'que';
  });
  function contestarWeb(nueva: EstadoWeb) {
    guardarWeb(nueva);
    irA(pasoAnterior === 'tienes' ? 'tienes' : 'que');
  }

  // ── Pasos ──
  const contenedores = useRef<Partial<Record<Paso, HTMLDivElement | null>>>({});
  // Si abre «Cambiar» y se arrepiente, vuelve a donde estaba.
  const [pasoAnterior, setPasoAnterior] = useState<Paso>('que');
  // Al paso nuevo: con el foco (se anuncia) y, en el panel nuevo, con su título a la vista
  // debajo de las barras de arriba (`llevarAlTitulo`). Antes se quedaba a media pantalla.
  function alPaso(p: Paso) {
    const c = contenedores.current[p];
    if (!panelNuevo) { c?.focus(); return; }
    c?.focus({ preventScroll: true });
    const destino = document.querySelector<HTMLElement>('[data-titulo-paso]') ?? c;
    if (destino) llevarAlTitulo(destino);
  }
  function irA(p: Paso) {
    if (p === 'ponlo') prepararCodigo(w.id);
    setPaso(p);
    // Al paso nuevo, con el foco: se anuncia y queda a la vista.
    requestAnimationFrame(() => alPaso(p));
  }

  // ── Vista previa ──
  const [dispositivo, setDispositivo] = useState<Dispositivo>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches ? 'movil' : 'escritorio');

  // La portada no tiene pasos, ni vista previa, ni el aviso de cabecera: cada
  // fila lleva el suyo.
  const conPrevia = paso !== 'plataforma' && paso !== 'tienes';
  // Panel nuevo: «Primeros pasos» flota abajo a la derecha y tapa la vista previa y los botones
  // de la pantalla (medido: en «¿Con qué está hecha tu web?» cubría «Siguiente»). Mientras el
  // constructor está abierto, la lista se esconde (sigue en la home y en el resto de pantallas).
  const escondeLista = panelNuevo;
  useEffect(() => {
    if (!escondeLista) return;
    document.body.classList.add('sin-primeros-pasos-flotante');
    return () => document.body.classList.remove('sin-primeros-pasos-flotante');
  }, [escondeLista]);
  const pasos = pasosDe(plataforma);
  const indice = pasos.findIndex(p => p.id === paso);
  // Un paso anterior solo lleva ✓ si de verdad está hecho: sin la clase de
  // «Una clase concreta», «Qué y dónde» no lo está.
  const hecho = (id: Paso, i: number) => i < indice && !(id === 'que' && faltaPrevia);

  // ── La portada: qué hace cada botón ──
  function abrirPieza(id: string, p: Paso) {
    setActivoId(id);
    if (p === 'ponlo') prepararCodigo(id);
    setPaso(p);
    requestAnimationFrame(() => alPaso(p));
  }
  // «Ir a las webs autorizadas»: la lista vive en «Ponlo en tu web», dentro del
  // pliegue «Para quien te hace la web» (y solo con la nativa, por eso la fila
  // no enseña el botón con otra forma). Se abre el pliegue (`verDominios`) y se
  // lleva allí el foco, que la pone a la vista: dejarla en el paso con el
  // pliegue cerrado era mandarla a buscarla.
  const dominiosRef = useRef<HTMLDivElement | null>(null);
  const [verDominios, setVerDominios] = useState(false);
  function irAWebsAutorizadas(id: string) {
    setActivoId(id);
    prepararCodigo(id);
    setPaso('ponlo');
    setVerDominios(true);
    // Tras pintar el paso: el pliegue ya está abierto (su efecto corre al
    // confirmar el clic, antes del siguiente fotograma).
    requestAnimationFrame(() => {
      const lista = dominiosRef.current;
      if (lista) {
        lista.focus({ preventScroll: true });
        lista.scrollIntoView({ block: 'center' });
      } else {
        contenedores.current.ponlo?.focus();
      }
      // Se suelta: la próxima vez que lo pida, vuelve a abrirlo aunque lo cerrara.
      setVerDominios(false);
    });
  }
  // «Que siga el estilo de tus widgets» desde la portada: lo HACE (quita el
  // diseño propio de ese widget) y abre «Cómo se ve», donde se ve el cambio y
  // se aplica (o se copia, si su código es de antes). Antes solo navegaba y
  // tenía que volver a encontrar el botón.
  function pasarAlEstiloComun(id: string) {
    quitarDisenoPropio(id);
    abrirPieza(id, 'como');
  }
  function ponerOtraCosa() {
    // Lo primero que aún no tiene: lo más probable es que venga a por eso.
    const libre = WIDGETS.find((x): x is WidgetDisponible => esDisponible(x) && !!x.principal && !(x.id in copiados));
    if (libre) setActivoId(libre.id);
    irA('que');
  }

  return (
    <div className="space-y-5">
      {paginaOculta && (
        <div role="note" data-testid="aviso-pagina-oculta" className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] leading-relaxed text-foreground">
          <EyeOff size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <p className="text-pretty">
            <strong className="font-semibold">Tu página está oculta</strong>, y lo que pongas en tu web también: tus widgets enseñan «Estamos preparando esta página» y desde ellos no se puede reservar ni comprar.{' '}
            <Link href={hrefDeTarjeta('pagina-publica')} className={cn('inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:no-underline', FOCO)}>
              Cambiarlo<ArrowUpRight size={12} aria-hidden />
            </Link>
          </p>
        </div>
      )}
      {paso !== 'plataforma' && (
        <div className="space-y-3">
          {conPrevia && conCopias && (
            <button
              type="button"
              onClick={() => irA('tienes')}
              className={cn(TACTIL, 'gap-1.5 text-[12.5px] font-medium text-foreground underline underline-offset-2 hover:no-underline', FOCO)}
            >
              <ArrowLeft size={14} aria-hidden />Lo que tienes en tu web
            </button>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
              <Globe size={14} aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">Tu web: <strong className="font-semibold text-foreground">{plataforma ? nombrePlataforma(plataforma) : 'sin decir'}</strong>{direccionWeb && plataforma !== 'sinweb' ? ` · ${direccionWeb}` : ''}</span>
              <button
                type="button"
                onClick={() => { setPasoAnterior(paso); irA('plataforma'); }}
                aria-label="Cambiar con qué está hecha tu web"
                className={cn('min-h-11 px-1 font-medium text-foreground underline underline-offset-2 hover:no-underline [@media(pointer:fine)]:min-h-8', FOCO)}
              >
                Cambiar
              </button>
            </p>
            {conPrevia && resultadosMes && etiquetaActiva && (
              <ResumenMes resultado={resultadoActivo} onVer={onVerResultados ? () => onVerResultados(etiquetaActiva) : undefined} />
            )}
          </div>
          {conPrevia && panelNuevo && (
            <div className="border-y border-border py-2">
              <LineaDePasos pasos={pasos.map(p => ({ id: p.id, corto: p.nombre }))} paso={paso as Exclude<Paso, 'plataforma' | 'tienes'>} onPaso={irA} hecho={(id, i) => hecho(id, i)} />
            </div>
          )}
          {conPrevia && !panelNuevo && (
            <nav aria-label="Pasos" className="flex flex-wrap gap-2">
              {pasos.map((p, i) => {
                const actual = p.id === paso;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-current={actual ? 'step' : undefined}
                    onClick={() => irA(p.id)}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1.5 pr-3.5 text-[12.5px] font-medium transition-colors',
                      actual ? 'border-foreground/70 bg-card text-foreground shadow-xs' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                      FOCO,
                    )}
                  >
                    <span aria-hidden className={cn('flex size-7 items-center justify-center rounded-full text-[12px] font-semibold', actual ? 'bg-foreground text-background' : 'bg-muted')}>
                      {hecho(p.id, i) ? <Check size={13} /> : i + 1}
                    </span>
                    {p.nombre}
                  </button>
                );
              })}
            </nav>
          )}
          {conPrevia && (
            <EstadoGuardadoLinea
              estado={guardado}
              porId={porId}
              pendiente={copia?.pieza && sinAplicar.length > 0 ? 'aplicar' : desfase ? 'pegar' : null}
            />
          )}
        </div>
      )}

      {conPrevia && desfase && copia && (
        <div aria-live="polite" className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] leading-relaxed text-foreground">
          <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p>
              <strong>Has cambiado algo que va en el código después de copiarlo el {fechaCorta(copia.en)}.</strong>{' '}
              Tu web sigue con lo de antes hasta que copies el código nuevo y lo pegues en lugar del anterior.
              {!copia.pieza && entrada.pieza && ' El código nuevo se pone al día solo: después, cambiar lo que enseña ya no te obligará a pegarlo otra vez.'}
            </p>
            {paso !== 'ponlo' && (
              <button type="button" onClick={() => irA('ponlo')} className={cn(TACTIL, 'font-semibold underline underline-offset-2 hover:no-underline', FOCO)}>
                Ir a copiarlo
              </button>
            )}
          </div>
        </div>
      )}

      {conPrevia && copia?.pieza && sinAplicar.length > 0 && (
        <div role="region" aria-label="Cambios sin aplicar" className="flex flex-wrap items-start gap-x-4 gap-y-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] leading-relaxed text-foreground">
          <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <p className="min-w-0 flex-[1_1_16rem]">
            <strong>Tienes cambios sin aplicar en tu web</strong> ({unirGrupos(sinAplicar)}). No hace falta volver a pegar nada: al aplicarlos, tu web los enseña en unos minutos.
          </p>
          {panelNuevo ? (
            <BotonVivo onClick={() => void aplicarContenido()} disabled={aplicando} label={<>{aplicando && <Loader2 size={14} className="animate-spin" aria-hidden />}Aplicar en mi web</>} />
          ) : (
            <button type="button" onClick={() => void aplicarContenido()} disabled={aplicando} className={cn(btnPrimary, 'inline-flex items-center gap-1.5')}>
              {aplicando && <Loader2 size={14} className="animate-spin" aria-hidden />}Aplicar en mi web
            </button>
          )}
        </div>
      )}

      <div className={cn('grid items-start gap-6', conPrevia && '@4xl/config:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]')}>
        <div className="min-w-0 space-y-4">
          {panelNuevo && conPrevia && (
            <div data-titulo-paso="">
              <h3 className="text-[22px] font-bold leading-tight text-foreground">{TITULO_PASO[paso as 'que' | 'como' | 'ponlo'](plataforma).titulo}</h3>
              <p className="mt-1 max-w-xl text-[13.5px] text-muted-foreground text-pretty">{TITULO_PASO[paso as 'que' | 'como' | 'ponlo'](plataforma).sub}</p>
            </div>
          )}
          {paso === 'tienes' && (
            <div ref={el => { contenedores.current.tienes = el; }} tabIndex={-1} className="outline-none">
              <LoQueTienes
                filas={filasTienes}
                ahora={ahora}
                estilo={estiloWeb}
                onCambiar={id => abrirPieza(id, 'que')}
                onCopiarNuevo={id => abrirPieza(id, 'ponlo')}
                onEstiloComun={pasarAlEstiloComun}
                onWebsAutorizadas={irAWebsAutorizadas}
                onCambiarEstilo={() => irA('como')}
                onOtraCosa={ponerOtraCosa}
                onVerResultados={veResultados ? onVerResultados : undefined}
              />
            </div>
          )}
          {paso === 'plataforma' && (
            <div ref={el => { contenedores.current.plataforma = el; }} tabIndex={-1} className="outline-none">
              <PasoPlataforma
                web={web}
                sitioWeb={studio?.sitioWeb ?? null}
                onContestar={contestarWeb}
                onCancelar={plataforma ? () => irA(pasoAnterior) : undefined}
              />
            </div>
          )}
          <div ref={el => { contenedores.current.que = el; }} tabIndex={-1} hidden={paso !== 'que'} className="outline-none">
            <PasoQue
              w={w}
              c={configEfectiva}
              metodo={metodo}
              plataforma={plataforma}
              receta={receta}
              cambiar={cambiar}
              datos={datos}
              avisos={avisos}
              copias={copias}
              porId={porId}
              onElegirWidget={setActivoId}
              onMetodo={elegirMetodo}
            />
          </div>
          <div ref={el => { contenedores.current.como = el; }} tabIndex={-1} hidden={paso !== 'como'} className="outline-none">
            <PasoComo
              key={w.id}
              w={w}
              c={configEfectiva}
              metodo={metodo}
              plataforma={plataforma}
              cambiar={cambiar}
              colorEstudio={datos.colorEstudio}
              estilo={estiloWeb}
              // Lo aplica solo la propietaria, igual que decide el servidor
              // (`/api/estudio/widget-estilo`): el resto lo ve sin poder tocarlo.
              soloLectura={rol !== 'PROPIETARIO'}
              verApariencia={puedeVer(rol, '/configuracion/apariencia')}
              piezas={piezas}
              porId={porId}
            />
          </div>
          <div ref={el => { contenedores.current.ponlo = el; }} tabIndex={-1} hidden={paso !== 'ponlo'} className="outline-none">
            <PasoPonlo
              key={w.id}
              entrada={entrada}
              metodo={metodo}
              plataforma={plataforma}
              receta={receta}
              estudio={studio?.nombre ?? 'mi estudio'}
              origen={origen}
              copiado={copia}
              desfase={desfase}
              estiloSinAplicar={estiloWeb.pendiente}
              // Solo lo lee la nativa: aplicado es que le llega algo (quitar solo el pie, no).
              estiloAplicado={estiloWeb.fase === 'listo' ? !nadaParaSinMarco(estiloWeb.publicado) : null}
              onCopiado={registrarCopia}
              preparando={creando === w.id}
              onMetodo={elegirMetodo}
              cambiar={cambiar}
              proximasClases={datos.proximasClases}
              dominiosAutorizados={dominiosAutorizados}
              verDominios={verDominios}
              dominios={(
                <div ref={dominiosRef} tabIndex={-1} className="outline-none">
                  <GestionDominios
                    dominios={dominiosAutorizados}
                    onGuardar={guardarDominios}
                    showToast={showToast}
                    puedeCambiar={rol === 'PROPIETARIO'}
                    sugerido={direccionWeb}
                  />
                </div>
              )}
              showToast={showToast}
            />
          </div>

          {conPrevia && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {indice > 0 ? (
                panelNuevo ? (
                  <button type="button" onClick={() => irA(pasos[indice - 1].id)} className="inline-flex h-11 items-center gap-1.5 rounded-full px-2 text-[14px] font-semibold text-foreground transition-colors hover:bg-muted">
                    <ArrowLeft size={15} aria-hidden />Atrás
                  </button>
                ) : (
                  <button type="button" onClick={() => irA(pasos[indice - 1].id)} className={cn(btnSecondary, 'inline-flex items-center gap-1.5')}>
                    <ArrowLeft size={15} aria-hidden />Atrás
                  </button>
                )
              ) : <span />}
              {indice < pasos.length - 1 && (
                panelNuevo ? (
                  <BotonVivo grande onClick={() => irA(pasos[indice + 1].id)} label={<>{pasos[indice + 1].siguiente}<ArrowRight size={15} aria-hidden /></>} />
                ) : (
                  <button type="button" onClick={() => irA(pasos[indice + 1].id)} className={btnPrimary}>
                    {pasos[indice + 1].siguiente}<ArrowRight size={15} aria-hidden />
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {conPrevia && (
          <div className="order-first min-w-0 @4xl/config:sticky @4xl/config:top-[calc(var(--panel-sticky-top,0px)+4rem)] @4xl/config:order-none">
            {/* Pegada DEBAJO de la barra de arriba (sticky y translúcida: con `top-4` la
                cabecera de la vista previa pasaba por debajo y se leía a medias). Lo mismo
                que la columna de Configuración: lo que mide el menú (`--panel-sticky-top`)
                más los 4rem de la barra (h-14 y su mb-2). */}
            {panelNuevo ? (
              // Como Apariencia (Bonsai b-30…): el widget real, sobre un panel de color. La tarjeta blanca
              // de dentro es la vista previa de siempre: su rótulo y sus controles siguen leyéndose.
              <div className="rounded-[28px] bg-[linear-gradient(140deg,color-mix(in_srgb,var(--t-blue-500)_88%,white),color-mix(in_srgb,var(--t-magenta-500)_72%,white))] p-3 sm:p-5 dark:bg-[linear-gradient(140deg,color-mix(in_srgb,var(--t-blue-500)_55%,var(--background)),color-mix(in_srgb,var(--t-magenta-500)_45%,var(--background)))]">
                <div className="rounded-2xl bg-card p-3 text-card-foreground shadow-t-card sm:p-4">
                <VistaPrevia
                  // Tras aplicar o deshacer, otra vez desde cero: lo publicado cambió en el servidor.
                  key={`${w.id}-${metodo}-${estiloWeb.version}`}
                  contenido={contenido}
                  falta={faltaPrevia}
                  forma={forma}
                  web={suWeb}
                  paginaDeReservas={`${new URL(origen).host}/reservar/${slug}`}
                  anchoWidget={anchoWidget}
                  abrirEn={urlPrevia}
                  dispositivo={dispositivo}
                  onDispositivo={setDispositivo}
                  noSigueElEstilo={noSigueElEstilo}
                  alSeguirElEstilo={!paginaCompleta && noSigueElEstilo ? () => cambiar({ identidad: 'estudio' }) : null}
                />
                </div>
              </div>
            ) : (
              <VistaPrevia
                // Tras aplicar o deshacer, otra vez desde cero: lo publicado cambió en el servidor.
                key={`${w.id}-${metodo}-${estiloWeb.version}`}
                contenido={contenido}
                falta={faltaPrevia}
                forma={forma}
                web={suWeb}
                paginaDeReservas={`${new URL(origen).host}/reservar/${slug}`}
                anchoWidget={anchoWidget}
                abrirEn={urlPrevia}
                dispositivo={dispositivo}
                onDispositivo={setDispositivo}
                noSigueElEstilo={noSigueElEstilo}
                alSeguirElEstilo={!paginaCompleta && noSigueElEstilo ? () => cambiar({ identidad: 'estudio' }) : null}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// El estado de lo guardado, sin que parezca que su web ya ha cambiado: lo
// guardado es lo de esta pantalla; lo que va en el código llega a su web cuando
// lo pega. (El estilo de sus widgets no pasa por aquí: se aplica con su botón.)
function EstadoGuardadoLinea({ estado, porId, pendiente }: {
  estado: EstadoGuardado;
  porId: boolean;
  /** Lo guardado aquí aún no está en su web: qué falta para que llegue. */
  pendiente: 'aplicar' | 'pegar' | null;
}) {
  return (
    <p role="status" aria-live="polite" className={cn('flex min-h-5 items-center gap-1.5 text-[12px] text-muted-foreground', estado === 'error' && 'text-destructive')}>
      {estado === 'guardando' && <><Loader2 size={12} className="animate-spin" aria-hidden />Guardando tus ajustes…</>}
      {/* «Guardado» con un ✓ verde se lee como «ya está en mi web»: con algo pendiente, se dice que aquí sí y allí aún no. */}
      {estado === 'guardado' && pendiente === 'aplicar' && 'Guardado aquí. En tu web, aún no: pulsa «Aplicar en mi web».'}
      {estado === 'guardado' && pendiente === 'pegar' && 'Guardado aquí. En tu web, aún no: copia el código y pégalo en lugar del de antes.'}
      {estado === 'guardado' && !pendiente && <><CheckCircle2 size={12} className="text-success" aria-hidden />{porId
        ? 'Tus ajustes están guardados. Llegan a tu web al pulsar «Aplicar en mi web» o al copiar el código.'
        : 'Tus ajustes están guardados. Lo que va en el código llega a tu web cuando lo pegues.'}</>}
      {estado === 'error' && 'No se han guardado tus ajustes. El código que copies sigue valiendo.'}
    </p>
  );
}


// El mes del widget activo, en una línea (`textoMes`, la misma de la portada).
// Sin visitas con su etiqueta lo dice así — no «0 % de conversión», que se
// leería como un widget que no funciona.
function ResumenMes({ resultado, onVer }: { resultado: EmbudoWidget | null; onVer?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
      <TrendingUp size={13} aria-hidden />
      <span>{textoMes(resultado)}</span>
      {onVer && (
        <button type="button" onClick={onVer} className={cn('inline-flex min-h-11 items-center gap-0.5 font-medium text-foreground underline underline-offset-2 hover:no-underline [@media(pointer:fine)]:min-h-8', FOCO)}>
          Ver resultados<ArrowRight size={12} aria-hidden />
        </button>
      )}
    </div>
  );
}

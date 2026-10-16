'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BotonVivo } from '@/components/dashboard/vivo';
import { LineaDePasos } from '@/components/dashboard/linea-de-pasos';
import { puedeVer } from '@/lib/permisos-reglas';
import { nadaParaSinMarco } from '@/lib/widget/estilo-nativa';
import { usaBotonPropio, type PlataformaWeb } from '@/lib/widgets/recetas';
import { FOCO, TACTIL } from '../piezas';
import { llevarAlTitulo } from '../lleva-al-titulo';
import { QueEnsena, QueQuieres, DondeLoQuieres } from '../paso-que';
import { ColoresPropios, PasoComo } from '../paso-como';
import { PasoPonlo } from '../paso-ponlo';
import { GestionDominios } from '../dominios';
import { VistaPrevia, type Dispositivo } from '../vista-previa';
import type { ConstructorWidgets } from '../usar-constructor';
import { TuWebHechaCon } from './tu-web-hecha-con';

// El asistente de «Tu web» v2 (decisión 3): cuatro pasos cortos en lugar de tres
// largos —Qué pones · Dónde va · Cómo se ve · Ponlo en tu web—, con «Salir» y un
// «Terminar» que vuelve a la portada (antes el último paso no tenía final). Cada
// paso compone piezas que ya existen, con sus variantes de la v2:
//  1. Qué pones: las cuatro grandes, las seis de «Más cosas» a la vista,
//     «Próximamente» en una lista discreta y «Qué sale en tu horario».
//  2. Dónde va: «Tu web está hecha con» (monogramas), las tres formas con
//     «Recomendado» y, al pie, UNA línea: lo de este paso va dentro del código.
//  3. Cómo se ve: dos niveles de estilo, «Tu web es…», el fundido y «Más
//     ajustes» (con el ancho, marcado «Va en el código»). Sin su barra: se publica
//     con la barra única.
//  4. Ponlo en tu web: copiar, los pasos con su dibujo, una frase de cómo llegan
//     los cambios y, para quien te hace la web, los colores propios del widget.
// Sin las etiquetas «Pegar el código otra vez / Con «Publicar…» / Siempre al día»
// (decisión 2): las apaga `EtiquetasDeCambio`, que pone `TuWebWidgets`.
//
// ⚠️ Los cuatro pasos están SIEMPRE montados y solo se oculta el que no toca
// (como en el constructor de siempre): el código (su <pre>) está en el DOM desde
// el principio. «Salir» y «Terminar» no descartan nada: lo sin publicar sigue
// en la barra de la portada.

export type PasoV2 = 'que' | 'donde' | 'como' | 'ponlo';
export const PASOS_V2: readonly PasoV2[] = ['que', 'donde', 'como', 'ponlo'];

function nombres(plataforma: PlataformaWeb | null): Record<PasoV2, { corto: string; titulo: string; sub: string }> {
  const sinWeb = plataforma === 'sinweb';
  return {
    que: { corto: 'Qué pones', titulo: 'Elige qué pones en tu web', sub: 'Una pieza de tu estudio dentro de tu web y qué enseña. En la vista previa la ves tal como la verá tu alumna.' },
    donde: { corto: 'Dónde va', titulo: 'Elige dónde va', sub: 'Dentro de una página, como un botón o como un enlace. Te decimos qué funciona mejor en la tuya.' },
    // «a la derecha» no era verdad en el móvil, donde la vista previa va encima.
    como: { corto: 'Cómo se ve', titulo: 'Cómo se ve', sub: 'Míralo en la vista previa, tal como lo verá tu alumna. El estilo es el mismo para todos tus widgets.' },
    ponlo: sinWeb
      ? { corto: 'Compártelo', titulo: 'Compártelo', sub: 'Copia el enlace y ponlo donde quieras: Instagram, WhatsApp o tu newsletter.' }
      : { corto: 'Ponlo en tu web', titulo: 'Ponlo en tu web', sub: 'Copia el código y pégalo en tu web, o mándaselo a quien te la lleva.' },
  };
}

export function AsistenteWidgets({ s, paso, onPaso, onSalir, verDominios, onDominiosVistos }: {
  s: ConstructorWidgets;
  paso: PasoV2;
  /** Ir a otro paso. Quien lo llama no deja pasar de «Dónde va» sin su web contestada. */
  onPaso: (p: PasoV2) => void;
  /** «Salir» y «Terminar»: a la portada, sin descartar nada. */
  onSalir: () => void;
  /** Viene de «Ir a las webs autorizadas»: se abre el pliegue de la lista y se lleva allí el foco. */
  verDominios: boolean;
  onDominiosVistos: () => void;
}) {
  const { w, configEfectiva, metodo, plataforma, studio, rol, estiloWeb, datos } = s;
  const n = nombres(plataforma);
  const indice = PASOS_V2.indexOf(paso);
  const titulo = useRef<HTMLDivElement | null>(null);
  const contenedores = useRef<Partial<Record<PasoV2, HTMLDivElement | null>>>({});
  const dominiosRef = useRef<HTMLDivElement | null>(null);

  // Al paso nuevo (también al entrar desde la portada): con el foco, que lo
  // anuncia, y con su título a la vista debajo de las barras de arriba.
  // `focus()` a secas dejaba la pantalla a media altura (#2743).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (verDominios && paso === 'ponlo') {
        const lista = dominiosRef.current;
        if (lista) {
          lista.focus({ preventScroll: true });
          lista.scrollIntoView({ block: 'center' });
        }
        // Se suelta: la próxima vez que lo pida, vuelve a abrirlo aunque lo cerrara.
        onDominiosVistos();
        return;
      }
      contenedores.current[paso]?.focus({ preventScroll: true });
      if (titulo.current) llevarAlTitulo(titulo.current);
    });
    return () => cancelAnimationFrame(id);
    // Solo al cambiar de paso (o al pedir la lista): no en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, verDominios]);

  // Lo publicado se crea la primera vez que se entra en «Ponlo en tu web» (hasta
  // entonces no hay id que poner en el código). Si aún se está leyendo, se
  // espera a que llegue —mientras tanto no se deja copiar (`preparando`): se
  // copiaría el código de antes, sin id— y se prepara entonces.
  const estadoPublicacion = s.publicacion.estado;
  const prepararCodigo = s.prepararCodigo;
  useEffect(() => {
    if (paso === 'ponlo' && estadoPublicacion === 'listo') prepararCodigo(w.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, estadoPublicacion, w.id]);
  const preparando = s.creando === w.id || (rol === 'PROPIETARIO' && estadoPublicacion === 'cargando');

  // ── Vista previa ── (lo de siempre; móvil por defecto y a tamaño real, en el PR 3)
  const [dispositivo, setDispositivo] = useState<Dispositivo>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches ? 'movil' : 'escritorio');

  // Un paso anterior solo lleva ✓ si de verdad está hecho: sin la clase de «Una
  // clase concreta», «Qué pones» no lo está; sin su web, «Dónde va» tampoco.
  const hecho = (id: PasoV2, i: number) => i < indice && !(id === 'que' && s.faltaPrevia) && !(id === 'donde' && !plataforma);
  const siguiente = PASOS_V2[indice + 1] ?? null;
  const bloqueado = paso === 'donde' && !plataforma;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-border py-2">
        <button
          type="button"
          onClick={onSalir}
          aria-label="Salir a tus widgets"
          className={cn(TACTIL, 'shrink-0 gap-1.5 rounded-full px-1 text-[14px] font-semibold text-foreground hover:underline', FOCO)}
        >
          <ArrowLeft size={15} aria-hidden />Salir
        </button>
        <div className="min-w-0 flex-1">
          <LineaDePasos pasos={PASOS_V2.map(id => ({ id, corto: n[id].corto }))} paso={paso} onPaso={onPaso} hecho={hecho} />
        </div>
      </div>

      <div className="grid items-start gap-6 @4xl/config:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
        <div className="min-w-0 space-y-4">
          <div ref={titulo} data-titulo-paso="">
            <h3 className="text-[22px] font-bold leading-tight text-foreground">{n[paso].titulo}</h3>
            <p className="mt-1 max-w-xl text-[13.5px] text-muted-foreground text-pretty">{n[paso].sub}</p>
          </div>

          <div ref={el => { contenedores.current.que = el; }} tabIndex={-1} hidden={paso !== 'que'} className="space-y-4 outline-none">
            <QueQuieres activo={w} avisos={s.avisos} copias={s.copias} onElegir={s.setActivoId} masCosasALaVista />
            <QueEnsena key={w.id} w={w} c={configEfectiva} metodo={metodo} cambiar={s.cambiar} datos={datos} porId={s.porId} tituloHorario="Qué sale en tu horario" />
          </div>

          <div ref={el => { contenedores.current.donde = el; }} tabIndex={-1} hidden={paso !== 'donde'} className="space-y-4 outline-none">
            <TuWebHechaCon web={s.web} sitioWeb={studio?.sitioWeb ?? null} direccion={s.direccionWeb} onContestar={s.guardarWeb} />
            {plataforma ? (
              <DondeLoQuieres w={w} c={configEfectiva} metodo={metodo} plataforma={plataforma} receta={s.receta} cambiar={s.cambiar} onMetodo={s.elegirMetodo} conPie />
            ) : (
              <p className="text-[12.5px] text-muted-foreground">Cuando nos digas con qué está hecha tu web, aquí verás cómo ponerlo: dentro de una página, como un botón o como un enlace, con la forma que mejor funciona en la tuya.</p>
            )}
          </div>

          <div ref={el => { contenedores.current.como = el; }} tabIndex={-1} hidden={paso !== 'como'} className="outline-none">
            <PasoComo
              key={w.id}
              w={w}
              c={configEfectiva}
              metodo={metodo}
              plataforma={plataforma}
              cambiar={s.cambiar}
              colorEstudio={datos.colorEstudio}
              estilo={estiloWeb}
              // Lo publica solo la propietaria, igual que decide el servidor
              // (`/api/estudio/widget-estilo`): el resto lo ve sin poder tocarlo.
              soloLectura={rol !== 'PROPIETARIO'}
              verApariencia={puedeVer(rol, '/configuracion/apariencia')}
              piezas={s.piezas}
              porId={s.porId}
              sinBarraAplicar
              variante="v2"
            />
          </div>

          <div ref={el => { contenedores.current.ponlo = el; }} tabIndex={-1} hidden={paso !== 'ponlo'} className="outline-none">
            <PasoPonlo
              key={w.id}
              entrada={s.entrada}
              metodo={metodo}
              plataforma={plataforma}
              receta={s.receta}
              estudio={studio?.nombre ?? 'mi estudio'}
              origen={s.origen}
              copiado={s.copia}
              desfase={s.desfase}
              estiloSinAplicar={estiloWeb.pendiente}
              // Solo lo lee la nativa: publicado es que le llega algo (quitar solo el pie, no).
              estiloAplicado={estiloWeb.fase === 'listo' ? !nadaParaSinMarco(estiloWeb.publicado) : null}
              onCopiado={s.registrarCopia}
              preparando={preparando}
              onMetodo={s.elegirMetodo}
              cambiar={s.cambiar}
              proximasClases={datos.proximasClases}
              dominiosAutorizados={s.dominiosAutorizados}
              verDominios={verDominios}
              dominios={(
                <div ref={dominiosRef} tabIndex={-1} className="outline-none">
                  <GestionDominios
                    dominios={s.dominiosAutorizados}
                    onGuardar={s.guardarDominios}
                    showToast={s.showToast}
                    puedeCambiar={rol === 'PROPIETARIO'}
                    sugerido={s.direccionWeb}
                  />
                </div>
              )}
              showToast={s.showToast}
              variante="v2"
              onCambiarWeb={() => onPaso('donde')}
              // Sin diseño que poner con un enlace ni con el botón de su propia web.
              colores={metodo !== 'enlace' && !(metodo === 'boton' && usaBotonPropio(plataforma)) ? (
                <ColoresPropios
                  w={w}
                  c={configEfectiva}
                  metodo={metodo}
                  plataforma={plataforma}
                  cambiar={s.cambiar}
                  colorEstudio={datos.colorEstudio}
                  porId={s.porId}
                />
              ) : undefined}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {indice > 0 ? (
              <button type="button" onClick={() => onPaso(PASOS_V2[indice - 1])} className="inline-flex h-11 items-center gap-1.5 rounded-full px-2 text-[14px] font-semibold text-foreground transition-colors hover:bg-muted">
                <ArrowLeft size={15} aria-hidden />Atrás
              </button>
            ) : <span />}
            {siguiente ? (
              <div className="flex flex-col items-end gap-1">
                <BotonVivo
                  grande
                  disabled={bloqueado}
                  onClick={() => onPaso(siguiente)}
                  label={<>Siguiente: {n[siguiente].corto.toLowerCase()}<ArrowRight size={15} aria-hidden /></>}
                />
                {bloqueado && <p className="text-[12px] text-muted-foreground">Primero, dinos con qué está hecha tu web.</p>}
              </div>
            ) : (
              <BotonVivo grande onClick={onSalir} label={<><Check size={15} aria-hidden />Terminar</>} />
            )}
          </div>
        </div>

        <div className="order-first min-w-0 @4xl/config:sticky @4xl/config:top-[calc(var(--panel-sticky-top,0px)+4rem)] @4xl/config:order-none">
          {/* Como Apariencia (Bonsai b-30…): el widget real, sobre un panel de color, pegado debajo de la barra de arriba. */}
          <div className="rounded-[28px] bg-[linear-gradient(140deg,color-mix(in_srgb,var(--t-blue-500)_88%,white),color-mix(in_srgb,var(--t-magenta-500)_72%,white))] p-3 sm:p-5 dark:bg-[linear-gradient(140deg,color-mix(in_srgb,var(--t-blue-500)_55%,var(--background)),color-mix(in_srgb,var(--t-magenta-500)_45%,var(--background)))]">
            <div className="rounded-2xl bg-card p-3 text-card-foreground shadow-t-card sm:p-4">
              <VistaPrevia
                // Tras publicar o deshacer, otra vez desde cero: lo publicado cambió en el servidor.
                key={`${w.id}-${metodo}-${estiloWeb.version}`}
                contenido={s.contenido}
                falta={s.faltaPrevia}
                forma={s.forma}
                web={s.suWeb}
                paginaDeReservas={`${new URL(s.origen).host}/reservar/${s.slug}`}
                anchoWidget={s.anchoWidget}
                abrirEn={s.urlPrevia}
                dispositivo={dispositivo}
                onDispositivo={setDispositivo}
                noSigueElEstilo={s.noSigueElEstilo}
                alSeguirElEstilo={!s.paginaCompleta && s.noSigueElEstilo ? () => s.cambiar({ identidad: 'estudio' }) : null}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

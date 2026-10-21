'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, EyeOff, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { PantallaVacia, Pildoras } from '@/components/dashboard/vivo';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { TabCrecimientoWeb } from '@/components/configuracion/tab-crecimiento-web';
import { hrefDeTarjeta } from '@/lib/configuracion/destino';
import { WIDGETS, esDisponible, type WidgetDisponible } from '@/lib/widgets/catalogo';
import type { AccionAviso } from '@/lib/widgets/fila-portada';
import { EtiquetasDeCambio, FOCO, PUBLICAR_V2, TextosDePublicar } from '../piezas';
import { useConstructorWidgets } from '../usar-constructor';
import { llevarAlTitulo } from '../lleva-al-titulo';
import { AsistenteWidgets, PASOS_V2, type PasoV2 } from './asistente';
import { BarraPublicarEnMiWeb } from './barra-publicar';
import { PortadaTusWidgets } from './portada';
import { usePublicarEnMiWeb } from './usar-publicar-en-mi-web';

// «Tu web» v2 (16-oct-2026, propuesta aprobada por el fundador el 15-oct,
// decisiones 1, 3 y 5): la herramienta de widgets rehecha, tras `PANEL_NUEVO` y
// `MI_WEB_NUEVA` (la elige `HerramientaWidgets`, el único punto de bifurcación).
//
//  · Siempre se entra en la portada «Tus widgets» (decisión 5): sin nada
//    copiado, el vacío que enseña; con algo, una fila por pieza con UN estado y
//    como mucho UN aviso.
//  · El asistente es un modo aparte, con cuatro pasos cortos, «Salir» y
//    «Terminar» (decisión 3). El modo vive en el estado de React, nunca en la
//    URL: escribir `&paso=` rompería los enlaces que ya traen aquí.
//  · Una sola barra para que su web cambie sin pegar nada: «Publicar en mi web»
//    (decisión 1).
//
// El estado y las reglas son los del constructor de siempre
// (`useConstructorWidgets`): lo que cambia es la presentación y el orden. Y
// esto NO esconde «Primeros pasos» con `sin-primeros-pasos-flotante`: otra
// sesión lo pliega a su píldora (decisión 8), y esa clase deja de hacer nada.

type Vista = 'widgets' | 'crecimiento';
type Modo = { tipo: 'portada' } | { tipo: 'asistente'; paso: PasoV2 };

export function TuWebWidgets({ showToast }: { showToast: (m: string) => void }) {
  const { studio } = useStudio();
  if (!studio?.slug) {
    // Sin la dirección de su página no hay widget que dar: se dice qué falta y a dónde ir.
    return studio ? (
      <PantallaVacia
        tono="azul"
        Icono={Link2}
        titulo="Primero, la dirección de tu página"
        texto="Los widgets enseñan tu horario, tus precios y la cuenta de tus alumnas dentro de tu web, y necesitan la dirección de tu página de reservas para funcionar."
        accion={{ label: 'Poner mi dirección', href: '/configuracion?tab=web#direccion-y-enlaces' }}
      />
    ) : null;
  }
  return <TuWebDelEstudio slug={studio.slug} showToast={showToast} />;
}

function TuWebDelEstudio({ slug, showToast }: { slug: string; showToast: (m: string) => void }) {
  const s = useConstructorWidgets({ slug, showToast, textos: 'v2' });
  const barra = usePublicarEnMiWeb(s);
  const [vista, setVista] = useState<Vista>('widgets');
  // «Cómo le va a tu página» de «Mi web» guiada llega con `&vista=resultados`: se entra ya ahí. Se lee
  // una vez al montar y sin `useSearchParams` (que, sin un <Suspense> encima, cambia cómo se monta la
  // pantalla en el build de producción). Cambiar de píldora no toca la URL.
  useEffect(() => {
    if (!s.veResultados || new URLSearchParams(window.location.search).get('vista') !== 'resultados') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- La URL solo se lee en el navegador, tras montar: en render daría otra cosa que el servidor.
    setVista('crecimiento');
  }, [s.veResultados]);
  const [enfoque, setEnfoque] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>({ tipo: 'portada' });
  const [verDominios, setVerDominios] = useState(false);
  const arriba = useRef<HTMLDivElement | null>(null);

  // Sin su web contestada, no se pasa de «Dónde va»: es donde se pregunta, y lo
  // que viene después (la recomendación, los pasos de su plataforma) depende de ella.
  function abrir(p: PasoV2) {
    const destino = !s.plataforma && PASOS_V2.indexOf(p) > PASOS_V2.indexOf('donde') ? 'donde' : p;
    setModo({ tipo: 'asistente', paso: destino });
  }
  function abrirPieza(id: string, p: PasoV2) {
    s.setActivoId(id);
    abrir(p);
  }
  function accion(id: string, hace: AccionAviso) {
    if (hace === 'copiar') { s.prepararCodigo(id); abrirPieza(id, 'ponlo'); return; }
    if (hace === 'activar-solo-horario') {
      // Lo HACE (enciende la opción de ese widget; queda «sin publicar» en la barra) y abre «Qué pones», donde está.
      s.activarSoloHorario(id);
      abrirPieza(id, 'que');
      return;
    }
    if (hace === 'estilo-comun') {
      // Lo HACE (quita el diseño propio de ese widget) y abre «Cómo se ve», donde se ve el cambio.
      s.quitarDisenoPropio(id);
      abrirPieza(id, 'como');
      return;
    }
    // «Ir a las webs autorizadas»: la lista vive en «Ponlo en tu web», en «Para quien te hace la web».
    s.prepararCodigo(id);
    setVerDominios(true);
    abrirPieza(id, 'ponlo');
  }
  function ponerOtraCosa() {
    // Lo primero que aún no tiene: lo más probable es que venga a por eso.
    const libre = WIDGETS.find((x): x is WidgetDisponible => esDisponible(x) && !!x.principal && !(x.id in s.copiados));
    if (libre) s.setActivoId(libre.id);
    abrir('que');
  }
  const verResultados = s.veResultados ? (e: string | null) => { setEnfoque(e); setVista('crecimiento'); } : undefined;

  return (
    <TextosDePublicar.Provider value={PUBLICAR_V2}>
      {/* Sin las etiquetas de cómo llega cada cambio, tarjeta a tarjeta (decisión 2). */}
      <EtiquetasDeCambio.Provider value={false}>
        <TarjetaAjuste id="widgets" marco={false}>
          <div ref={arriba} className="space-y-5">
            {s.paginaOculta && (
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

            {modo.tipo === 'portada' ? (
              <>
                <Pildoras
                  opciones={[{ valor: 'widgets' as Vista, label: 'Tus widgets' }, { valor: 'crecimiento' as Vista, label: 'Cómo le va a tu página' }]}
                  etiqueta="Qué ver"
                  valor={vista}
                  onCambio={v => { setVista(v); setEnfoque(null); }}
                />
                {vista === 'widgets' ? (
                  <PortadaTusWidgets
                    s={s}
                    onEmpezar={id => abrirPieza(id, 'que')}
                    onCambiar={id => abrirPieza(id, 'que')}
                    onCopiar={id => { s.prepararCodigo(id); abrirPieza(id, 'ponlo'); }}
                    onAccion={accion}
                    onOtraCosa={ponerOtraCosa}
                    onCambiarEstilo={() => abrir('como')}
                    onVerResultados={verResultados}
                  />
                ) : (
                  <TabCrecimientoWeb showToast={showToast} enfoque={enfoque} />
                )}
              </>
            ) : (
              <AsistenteWidgets
                s={s}
                paso={modo.paso}
                onPaso={abrir}
                onSalir={() => {
                  setVista('widgets');
                  setModo({ tipo: 'portada' });
                  // De vuelta arriba de la portada: venía del final del último paso.
                  requestAnimationFrame(() => { if (arriba.current) llevarAlTitulo(arriba.current); });
                }}
                verDominios={verDominios}
                onDominiosVistos={() => setVerDominios(false)}
              />
            )}

            <BarraPublicarEnMiWeb s={s} barra={barra} />
          </div>
        </TarjetaAjuste>
      </EtiquetasDeCambio.Provider>
    </TextosDePublicar.Provider>
  );
}

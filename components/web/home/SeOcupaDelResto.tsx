import Link from 'next/link';
import type { ReactNode } from 'react';
import { BotonBloque } from '@/components/landing/BotonBloque';
import { FOTOS, FOTOS_APORTADAS, altoDe, rutaFoto } from '@/components/landing/fotos';
import { Icono } from '@/components/student/ui/Icono';
import { AppAlumna } from './piezas';

// ─────────────────────────────────────────────────────────────────────────────
// «Lo que tus alumnas notan, y tú dejas de hacer a mano.» — el BENTO de la home
// (25-oct-2026). Forma de la referencia del fundador: seis tarjetas suaves con una
// etiqueta de categoría, un titular grande, tres líneas y un enlace con flecha;
// debajo, o bien una foto de personas que se funde con el fondo, o bien un móvil
// real, y siempre un fragmento de interfaz flotando encima.
//
// Primera versión descartada el mismo día: repetía lo que ya cuentan las pestañas
// de debajo (reservas, cobros, equipo) y rellenaba con «equipo cercano» y «datos
// bajo llave». Aquí va SOLO lo que la home no cuenta en otro sitio, y cada frase
// sale de la página de función que enlaza:
//   · elegir sitio: mapa de puestos de la sala (calendario-y-salas); el móvil es la
//     captura REAL de la app (Estudio Alma, datos de muestra de
//     e2e/landing-capturas.spec.ts);
//   · clase fija: reserva automática, pausa con fechas, se suelta sin cuota
//     (plazas-fijas; en la web comercial sigue «plaza fija» hasta que el fundador
//     decida lo contrario);
//   · asistencia: QR de la alumna que se lee en la puerta (control-de-asistencia);
//   · cancelación: ventana por tipo de clase, bono configurable y cobro OPCIONAL,
//     apagado de serie y con tu aprobación (cancelaciones-y-politicas);
//   · asistente: el FAQ «¿Qué es “Pregúntale a Tentare”?» de components/landing/data.ts;
//   · bonos: avisos «por caducar» y «se te ha agotado» (cron notif-bonos) y la
//     captura real de «Mi plan».
//
// NO: nada de sustituciones ni «baja cubierta» en esta home (orden del fundador,
// 25-oct-2026; ver .claude/tentare-os.md).
//
// Fotos: la de personas es la aportada por el fundador (`FOTOS_APORTADAS.equipo`) y
// la de la sala es la de plazas. Son las únicas que hay libres: si hay más fotos de
// gente real, se cambian en `Foto` sin tocar el diseño.
// Los nombres y cifras de los fragmentos son de muestra, como en el resto de la
// home. Todo lo decorativo va con aria-hidden: lo que lee un lector de pantalla es la
// etiqueta, el titular, el texto y el enlace de cada tarjeta.
// ─────────────────────────────────────────────────────────────────────────────

function Tarjeta({ clase, retardo, etiqueta, titulo, texto, href, enlace, children }: {
  clase: string; retardo?: number; etiqueta: string; titulo: string; texto: string; href?: string; enlace?: string; children: ReactNode;
}) {
  return (
    <article className={`wh-bt-tarjeta ${clase} lp-rv`} style={retardo ? { ['--lp-r' as string]: retardo } : undefined}>
      <div className="wh-bt-texto">
        <p className="wh-bt-et">{etiqueta}</p>
        <h3 className="wh-h3">{titulo}</h3>
        <p className="wh-texto">{texto}</p>
        {href && enlace ? <Link href={href} className="wh-enlace-flecha wh-bt-mas">{enlace} <span aria-hidden="true">→</span></Link> : null}
      </div>
      <div className="wh-bt-escena" aria-hidden="true">{children}</div>
    </article>
  );
}

/** La sala de plazas, fundida con el fondo de la tarjeta. */
function FotoSala() {
  const r = FOTOS.plazas.recortes.escritorio;
  return (
    <picture className="wh-bt-foto wh-bt-foto-sala">
      <source type="image/avif" srcSet={`${rutaFoto(FOTOS.plazas, 'escritorio', 640, 'avif')} 640w, ${rutaFoto(FOTOS.plazas, 'escritorio', 1024, 'avif')} 1024w`} sizes="(max-width: 720px) 92vw, 420px" />
      <img
        src={rutaFoto(FOTOS.plazas, 'escritorio', 640, 'webp')}
        srcSet={`${rutaFoto(FOTOS.plazas, 'escritorio', 640, 'webp')} 640w, ${rutaFoto(FOTOS.plazas, 'escritorio', 1024, 'webp')} 1024w`}
        sizes="(max-width: 720px) 92vw, 420px"
        width={640}
        height={altoDe(r, 640)}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}

/** Personas de verdad, a la derecha y fundidas con el fondo. */
function FotoPersonas() {
  const f = FOTOS_APORTADAS.equipo;
  return (
    <picture className="wh-bt-foto wh-bt-foto-gente">
      <source type="image/avif" srcSet={`/landing/fotos-aportadas/${f.base}.avif`} />
      <img src={`/landing/fotos-aportadas/${f.base}.webp`} width={f.ancho} height={f.alto} alt="" loading="lazy" decoding="async" />
    </picture>
  );
}

function Aviso({ icono, titulo, linea, clase }: { icono: 'hecho' | 'campana'; titulo: string; linea: string; clase?: string }) {
  return (
    <div className={`wh-bt-flota ${clase ?? ''}`}>
      <span className="wh-bt-tic"><Icono nombre={icono} tamano={14} grosor={2.2} /></span>
      <span><b>{titulo}</b>{linea}</span>
    </div>
  );
}

export function SeOcupaDelResto() {
  const semanas: readonly { dia: string; pausa?: boolean }[] = [
    { dia: '27 oct' }, { dia: '3 nov' }, { dia: '10 nov' }, { dia: '17 nov', pausa: true }, { dia: '24 nov' },
  ];
  return (
    <section id="te-suena" className="wh-seccion wh-resto" aria-labelledby="wh-resto-h">
      <div className="wh-contenedor">
        <div className="wh-bt-cab">
          <h2 id="wh-resto-h" className="wh-h2">Lo que tus alumnas notan, y tú dejas de hacer a mano.</h2>
          <p className="wh-lead">Pones la regla una vez y Tentare la aplica igual para todas.</p>
        </div>

        <div className="wh-bt">
          <Tarjeta clase="wh-bt-t1" etiqueta="Reservas y sala" titulo="Cada alumna elige su reformer."
            texto="Al reservar desde su app ve el mapa de la sala y escoge su sitio. Nadie más lo ocupa."
            href="/funcionalidades/calendario-y-salas" enlace="Cómo se montan las salas">
            <div className="wh-bt-movil"><AppAlumna captura="elegirReformer" escala={0.7} /></div>
          </Tarjeta>

          <Tarjeta clase="wh-bt-t2" retardo={8} etiqueta="Clases fijas" titulo="Su sitio de los martes, reservado solo."
            texto="Das la clase fija una vez y Tentare se la reserva cada semana. La pausas en vacaciones y se suelta si deja de tener cuota."
            href="/funcionalidades/plazas-fijas" enlace="Cómo funcionan las plazas fijas">
            <FotoSala />
            <div className="wh-bt-fija">
              <div className="wh-bt-ficha">
                <span><b>Carmen · Reformer Fundamental</b>Todos los martes, 09:00</span>
                <em className="wh-bt-pastilla wh-bt-p-ok">Clase fija</em>
              </div>
              <ul className="wh-bt-semanas">
                {semanas.map((s) => (
                  <li key={s.dia} className={s.pausa ? 'wh-bt-semana-pausa' : undefined}>
                    <b>{s.dia}</b>
                    {s.pausa ? <span>Vacaciones</span> : <span className="wh-bt-tic"><Icono nombre="hecho" tamano={12} grosor={2.4} /></span>}
                  </li>
                ))}
              </ul>
            </div>
          </Tarjeta>

          <Tarjeta clase="wh-bt-t3" retardo={16} etiqueta="Asistencia" titulo="Reservar no es venir."
            texto="Cada alumna lleva su QR en la app y lo escaneáis en la puerta: Tentare comprueba en ese momento si tiene plaza en su clase."
            href="/funcionalidades/control-de-asistencia" enlace="Cómo se controla la asistencia">
            <FotoPersonas />
            <Aviso icono="hecho" titulo="María L. · Escaneado" linea="Reformer Fundamental, 09:00 · plaza confirmada" clase="wh-bt-flota-abajo" />
          </Tarjeta>

          <Tarjeta clase="wh-bt-t4" etiqueta="Cancelaciones" titulo="Cancelar tarde tiene la regla que tú pongas."
            texto="Eliges hasta cuándo se cancela gratis y qué pasa con el bono. Cobrar la plaza perdida es opcional: viene apagado y lo apruebas tú."
            href="/funcionalidades/cancelaciones-y-politicas" enlace="Cómo funcionan las cancelaciones">
            <div className="wh-bt-reglas">
              <p className="wh-bt-linea">Cancelación gratuita hasta <b>12 h</b> antes</p>
              <div className="wh-bt-ficha">
                <span><b>Marta · cancela con 20 h</b>Reformer Fundamental</span>
                <em className="wh-bt-pastilla wh-bt-p-ok">Sesión devuelta</em>
              </div>
              <div className="wh-bt-ficha wh-bt-ficha-desplaza">
                <span><b>Lucía · cancela con 2 h</b>Reformer Avanzado</span>
                <em className="wh-bt-pastilla wh-bt-p-aviso">Sesión no devuelta</em>
              </div>
            </div>
          </Tarjeta>

          <Tarjeta clase="wh-bt-t5" retardo={8} etiqueta="Asistente" titulo="Pregúntale a Tentare por tu estudio."
            texto="Quién lleva semanas sin venir, qué clases tienen huecos: te responde con tus datos. No cobra, no borra y no escribe a tus alumnas.">
            <div className="wh-bt-chat">
              <p className="wh-bt-pregunta">¿Quién lleva más de tres semanas sin venir?</p>
              <div className="wh-bt-respuesta">
                <b>Cuatro alumnas con cuota llevan más de tres semanas sin venir.</b>
                <ul>
                  <li><span>Marta R.</span><i>34 días</i></li>
                  <li><span>Elena P.</span><i>29 días</i></li>
                  <li><span>Irene S.</span><i>24 días</i></li>
                </ul>
              </div>
            </div>
          </Tarjeta>

          <Tarjeta clase="wh-bt-t6" retardo={16} etiqueta="Bonos y avisos" titulo="Ningún bono caduca por sorpresa."
            texto="Tentare avisa a la alumna en el móvil cuando su bono está por caducar con sesiones sin usar, y cuando se le agota."
            href="/funcionalidades/bonos-y-membresias" enlace="Cómo funcionan los bonos">
            <div className="wh-bt-movil"><AppAlumna captura="miPlan" escala={0.7} /></div>
            <Aviso icono="campana" titulo="Tu bono está por caducar" linea="Te quedan 2 sesiones por usar" clase="wh-bt-flota-arriba" />
          </Tarjeta>
        </div>

        <div className="wh-bt-pie">
          <BotonBloque />
        </div>
      </div>
    </section>
  );
}

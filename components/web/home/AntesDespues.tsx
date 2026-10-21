'use client';

import { useState } from 'react';
import { MarcoIphone } from '@/components/ui/marco-iphone';

// ─────────────────────────────────────────────────────────────────────────────
// «Antes / con Tentare» (home, 21-oct-2026): el deslizador de Mariana Tek («Put your
// brand first»), pero lo que se compara no es otra app: es pedir la plaza por WhatsApp
// frente a reservarla en la app del estudio (decisión del fundador). Las dos caras
// cuentan la MISMA clase —Reformer Flow, mañana a las 10:15—, así que se ve lo que
// cambia: la alumna pregunta, espera a que acabe la clase y se queda sin sitio; en la
// app la ve con plazas y la reserva.
//
// El chat es un dibujo genérico de mensajería (sin el logo ni el nombre de ninguna app)
// con un estudio inventado, el mismo «Estudio Alma» de la captura. El deslizador es un
// <input type="range"> de verdad: se arrastra con el ratón o el dedo y se mueve con las
// flechas del teclado, y el lector de pantalla lo anuncia.
// ─────────────────────────────────────────────────────────────────────────────

type Mensaje = { de: 'ella' | 'estudio'; texto: string; hora: string };

const CHAT: readonly Mensaje[] = [
  { de: 'ella', texto: 'Hola! ¿Queda sitio mañana en el reformer de las 10:15?', hora: '09:02' },
  { de: 'estudio', texto: '¡Hola! Estoy en clase, en cuanto acabe lo miro y te digo', hora: '09:47' },
  { de: 'ella', texto: 'Vale, gracias!', hora: '09:48' },
  { de: 'ella', texto: '¿Al final hay sitio?', hora: '13:20' },
  { de: 'estudio', texto: 'Perdona, se acaba de llenar. Te apunto por si alguien cancela', hora: '16:05' },
];

function Chat() {
  return (
    <div className="wh-ad-chat" aria-hidden="true">
      <div className="wh-ad-chat-cab">
        <span className="wh-ad-chat-atras">‹</span>
        <span className="wh-ad-chat-avatar">A</span>
        <span className="wh-ad-chat-nombre"><b>Estudio Alma</b><span>en línea</span></span>
      </div>
      <div className="wh-ad-chat-fecha">Hoy</div>
      <ul className="wh-ad-chat-lista">
        {CHAT.map((m) => (
          <li key={m.hora} className={m.de === 'ella' ? 'wh-ad-burbuja wh-ad-burbuja-ella' : 'wh-ad-burbuja'}>
            {m.texto}
            <span className="wh-ad-hora">{m.hora}</span>
          </li>
        ))}
      </ul>
      <div className="wh-ad-chat-pie"><span>Mensaje</span></div>
    </div>
  );
}

function App({ n }: { n: string }) {
  const c = { n };
  return (
    <picture className="wh-ad-app">
      <source type="image/avif" srcSet={`/landing/capturas/${c.n}-390.avif 390w, /landing/capturas/${c.n}-780.avif 780w`} sizes="250px" />
      <img
        src={`/landing/capturas/${c.n}-390.webp`}
        srcSet={`/landing/capturas/${c.n}-390.webp 390w, /landing/capturas/${c.n}-780.webp 780w`}
        sizes="250px"
        width={780}
        height={1696}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}

// `captura` llega del servidor (app/page.tsx, CAPTURAS_APP.reservar): así este componente
// de cliente no arrastra piezas.tsx entero al JavaScript de la home.
export function AntesDespues({ captura }: { captura: string }) {
  const [pos, setPos] = useState(50);
  return (
    <section id="antes-y-ahora" className="wh-seccion wh-ad" aria-labelledby="wh-ad-h">
      <div className="wh-contenedor wh-ad-rejilla">
        <div className="wh-ad-visual">
          <div className="wh-ad-tel" style={{ ['--pos' as string]: `${pos}%` }}>
            <MarcoIphone modelo="17-pro" escala={0.78} tinta="oscura" indicador="oscura">
              <div className="wh-ad-pantalla">
                <App n={captura} />
                <div className="wh-ad-antes"><Chat /></div>
                <span className="wh-ad-linea" aria-hidden="true"><span className="wh-ad-asa">‹ ›</span></span>
              </div>
            </MarcoIphone>
            <input
              type="range"
              min={0}
              max={100}
              value={pos}
              onChange={(e) => setPos(Number(e.target.value))}
              className="wh-ad-rango"
              aria-label="Comparar: a la izquierda, pedir la plaza por WhatsApp; a la derecha, reservarla en la app"
              aria-valuetext={pos > 60 ? 'Se ve sobre todo el WhatsApp' : pos < 40 ? 'Se ve sobre todo la app' : 'Mitad y mitad'}
            />
          </div>
          <div className="wh-ad-etiquetas" aria-hidden="true"><span>Por WhatsApp</span><span>Con Tentare</span></div>
        </div>
        <div className="wh-ad-texto">
          <h2 id="wh-ad-h" className="wh-h2">Del WhatsApp a la app de tu estudio.</h2>
          <p className="wh-lead">
            Antes, una plaza era una conversación: preguntar, esperar a que acabaras la clase y, a veces, llegar tarde.
            Ahora la alumna la ve libre y la reserva ella, a la hora que sea.
          </p>
          <p className="wh-ad-pista">Desliza el móvil para comparar.</p>
        </div>
      </div>
    </section>
  );
}

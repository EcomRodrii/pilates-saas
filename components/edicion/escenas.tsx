import { Check, Lock, QrCode, Gift } from 'lucide-react';
import type { TarjetaEdicion } from '@/lib/edicion/invierno-26';

// Las ilustraciones de las tarjetas de la edición: como en las Editions de Shopify, no es un icono sino un TROZO DE PANTALLA con datos de
// muestra (aquí dibujado en HTML y CSS: pesa cero, se anima y se ve nítido a cualquier tamaño). Los nombres y las cifras son de muestra, nunca
// de un estudio real, y todo va `aria-hidden`: un lector de pantalla no debe leer cifras de ejemplo como si fueran suyas. Server Component.

type Props = { tipo: TarjetaEdicion['escena']; muestra: TarjetaEdicion['muestra'] };

const Barra = ({ n, alto }: { n: number; alto: number }) => <i className="ed-esc-barra" style={{ ['--h' as string]: `${alto}%`, ['--d' as string]: `${n * 70}ms` }} />;

export function EscenaTarjeta({ tipo, muestra: [a, b] }: Props) {
  return (
    <span className={`ed-esc ed-esc--${tipo}`} aria-hidden="true">
      {tipo === 'telefono' && (
        <span className="ed-tel">
          <span className="ed-tel-isla" />
          <small>{a}</small>
          <span className="ed-tel-anillo"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" /><circle cx="18" cy="18" r="15" className="ed-tel-arco" /></svg><b>7</b></span>
          <em>{b}</em>
        </span>
      )}
      {tipo === 'semana' && (
        <span className="ed-sem">
          <span className="ed-sem-cab"><b>{a}</b><small>{b}</small></span>
          <span className="ed-sem-rejilla">
            {[0, 1, 2, 3, 4].map((d) => (
              <span key={d} className="ed-sem-col">
                <i className={`ed-sem-bloque ed-sem-bloque--${(d + 1) % 3}`} style={{ ['--t' as string]: `${(d * 13) % 34}%`, ['--l' as string]: `${28 + (d % 2) * 8}%` }} />
                {d === 2 && <i className="ed-sem-bloque ed-sem-bloque--dest" style={{ ['--t' as string]: '56%', ['--l' as string]: '26%' }} />}
              </span>
            ))}
          </span>
        </span>
      )}
      {tipo === 'recibos' && (
        <span className="ed-rec">
          <span className="ed-rec-cab"><b>{a}</b><span className="ed-pil ed-pil--ok"><Check size={10} strokeWidth={2.4} /> Cobrado</span></span>
          {[['AM', 'Ana Martín', b], ['LR', 'Laura Ramos', 'Mensual 2 días · 59 €']].map(([i, n, c]) => (
            <span key={i} className="ed-rec-fila"><span className="ed-ini">{i}</span><span className="ed-rec-txt"><b>{n}</b><small>{c}</small></span></span>
          ))}
        </span>
      )}
      {tipo === 'navegador' && (
        <span className="ed-nav-m">
          <span className="ed-nav-m-barra"><i /><i /><i /><small>{a}</small></span>
          <span className="ed-nav-m-cuerpo">
            <b>{b}</b>
            {['Reformer · 10:00', 'Suelo · 12:00', 'Yoga · 18:30'].map((c) => <span key={c} className="ed-nav-m-fila">{c}<em>Reservar</em></span>)}
          </span>
        </span>
      )}
      {tipo === 'bandeja' && (
        <span className="ed-ban">
          <span className="ed-ban-cab"><b>{a}</b><span className="ed-pil ed-pil--aviso">Decidir</span></span>
          <span className="ed-ban-fila"><span className="ed-ini">LR</span><span className="ed-rec-txt"><b>{b}</b><small>Hace un momento</small></span></span>
          <span className="ed-ban-fila ed-ban-fila--tenue"><span className="ed-ini">AM</span><span className="ed-rec-txt"><b>Una cosa más</b><small>Ayer</small></span></span>
        </span>
      )}
      {tipo === 'barras' && (
        <span className="ed-bar">
          <b>{a}</b><strong>{b}</strong>
          <span className="ed-bar-gr">{[42, 68, 55, 82, 74, 91].map((h, n) => <Barra key={n} n={n} alto={h} />)}</span>
        </span>
      )}
      {tipo === 'codigo' && (
        <span className="ed-cod">
          <Lock size={15} strokeWidth={1.8} />
          <b>{a}</b>
          <span className="ed-cod-cas">{[4, 8, 1, 7, 2, 9].map((n, i) => <i key={i} style={{ ['--d' as string]: `${i * 90}ms` }}>{n}</i>)}</span>
          <small>{b}</small>
        </span>
      )}
      {tipo === 'chat' && (
        <span className="ed-chat">
          <span className="ed-chat-b ed-chat-b--a"><b>{a}</b><small>{b}</small></span>
          <span className="ed-chat-b ed-chat-b--b">Vale, gracias</span>
        </span>
      )}
      {tipo === 'regalo' && (
        <span className="ed-reg"><Gift size={18} strokeWidth={1.6} /><small>{a}</small><strong>{b}</strong><i /></span>
      )}
      {tipo === 'qr' && (
        <span className="ed-qr"><QrCode size={54} strokeWidth={1.2} /><small>{a}</small><b>{b}</b></span>
      )}
    </span>
  );
}

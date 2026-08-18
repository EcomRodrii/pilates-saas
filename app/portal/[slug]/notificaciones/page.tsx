'use client';

import Link from 'next/link';

// AVISOS — pantalla del prototipo navegable de Claude Design.
//
// La fuente de datos no cambia: sigue siendo la tabla `notification` del motor
// de notificaciones vía /api/notifications, acotada por el JWT de la socia, y
// se siguen marcando todas como leídas al abrir la bandeja.
//
// Lo que cambia es la composición. El diseño tira TRES cosas del centro
// anterior y hay que entender por qué antes de echarlas de menos:
//
//  1. Los iconos de colores por categoría. En una bandeja de cuatro líneas, un
//     círculo rojo y otro ámbar compiten con el titular por la primera mirada;
//     el diseño deja que hable el texto y reserva el único acento —un punto de
//     6 px— para lo que de verdad hay que distinguir: lo que aún no has leído.
//  2. La agrupación Hoy / Esta semana / Anteriores. Con el sello temporal en
//     cada aviso, la cabecera de grupo repite la misma información dos veces.
//  3. Las tarjetas. Aquí la lista son filas separadas por hilos, que es lo que
//     permite bajar el ritmo vertical a 22 px sin que se vea apretado.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useModo } from '@/lib/portal-modo';
import { useStudio } from '@/lib/studio-context';
import { portalAuthHeader } from '@/lib/api-client';
import { fetchNotificaciones, accionNotificacion, type NotifItem } from '@/lib/notifications/client';
import { resumenAvisos, selloTemporal } from '@/lib/avisos-portal';
import { display, micro, sans, transicion, dur } from '@/lib/portal-design';

// El diseño apaga los avisos ya leídos bajando título y detalle a la vez. Sale
// más fiel con una opacidad que con dos colores nuevos: 0,81 sobre el crema deja
// el titular en #4A5145, que es EXACTAMENTE el del diseño, y además funciona en
// modo noche, donde un par de grises fijos se verían apagados al revés.
const APAGADO_LEIDO = 0.81;

export default function AvisosPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const { t, noche } = useModo();
  const { studio } = useStudio();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [cargando, setCargando] = useState(true);

  // El estudio hace falta para acotar la bandeja a ESTE portal y al rol SOCIA
  // (lib/notifications/ambito.ts). Llega del contexto, que lo recibe ya
  // resuelto en servidor — pero no en el primer render: hasta entonces no se
  // pide nada y `cargando` sigue true, para no pintar "no hay nada" con la
  // bandeja llena ni disparar el read-all de más abajo antes de tiempo.
  const studioId = studio?.id;

  const cargar = useCallback(async () => {
    // Si el contexto no llega a resolver el estudio (su fetch tiene una rama de
    // error que deja `studio` en null para siempre), esto se quedaría en "Un
    // momento…" eterno. Mejor la bandeja vacía, que al menos dice algo.
    if (!studioId) { setCargando(false); return; }
    const { items } = await fetchNotificaciones(portalAuthHeader, { ambito: 'socia', studioId });
    setItems(items);
    setCargando(false);
  }, [studioId]);

  // setState tras el await (asíncrono), no en cascada — falso positivo del lint.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  // Al abrir la bandeja se marcan todas como leídas (limpia el punto de la
  // campana). El estado local NO se toca a propósito: los puntos siguen ahí
  // mientras la pantalla está abierta, que es justo lo que se vino a mirar.
  useEffect(() => {
    if (!cargando && studioId && items.some(i => i.readAt == null)) {
      void accionNotificacion(portalAuthHeader, { ambito: 'socia', studioId }, 'read-all');
    }
  }, [cargando, items, studioId]);

  const sinLeer = useMemo(() => items.filter(i => i.readAt == null).length, [items]);

  async function abrir(n: NotifItem) {
    if (n.readAt == null && studioId) await accionNotificacion(portalAuthHeader, { ambito: 'socia', studioId }, 'read', n.id);
    if (n.deepLink) router.push(n.deepLink);
  }

  return (
    <div style={{ minHeight: '100%', background: t.bg, color: t.ink }}>
      <div style={{ padding: '62px 24px 24px' }}>
        {/* ⚠️ `<Link>` y no un `<button onClick={router.push}>`, que es lo que
            había: un botón que navega con JavaScript NO HACE NADA hasta que la
            página hidrata. En un móvil lento la socia toca la flecha de volver
            y no pasa nada — la misma sensación de «la app no responde» que ya
            costó otros arreglos. Un enlace navega igual sin JS, y Next lo
            precarga.

            Es también la causa de que `portal-bonos-compras` fallara en la
            PRIMERA pasada de CI y pasara al relanzar: en frío la hidratación
            llega tarde y el clic se pierde. Se arregla en la app, no en el
            test. */}
        <Link
          href={`/portal/${slug}/home`}
          aria-label="Volver a Inicio"
          style={{
            width: 38, height: 38, borderRadius: '50%',
            border: `1px solid ${t.line}`,
            background: noche ? 'rgba(36,40,32,.7)' : 'rgba(255,255,255,.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: sans, fontSize: 13, color: t.ink, cursor: 'pointer',
            transition: transicion(['background'], dur.color),
          }}
        >
          ←
        </Link>

        <h1 style={{ ...display(50), color: t.ink, marginTop: 20 }}>Avisos</h1>
        <p style={{ ...display(19, true), color: t.muted, marginTop: 10 }}>
          {cargando ? 'Un momento…' : resumenAvisos(sinLeer)}
        </p>

        {/* La bandeja vacía usa los mismos hilos que la llena: una fila sola,
            no un cartel centrado. Y habla en la voz del detalle (sans), no en
            la de la portada — dos frases seguidas en serif cursiva compiten
            entre ellas. */}
        {!cargando && items.length === 0 ? (
          <div style={{ marginTop: 32, padding: '22px 0', borderTop: `1px solid ${t.line}`, borderBottom: `1px solid ${t.line}` }}>
            <p style={{ fontFamily: sans, fontSize: 11.5, color: t.muted, textWrap: 'pretty' } as React.CSSProperties}>
              Aquí aparecerán tus reservas, los cambios de clase y los pagos.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column' }}>
            {items.map((it, i) => (
              <Aviso
                key={it.id}
                item={it}
                ultimo={i === items.length - 1}
                onAbrir={() => void abrir(it)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type Tokens = ReturnType<typeof useModo>['t'];

function Aviso({ item, ultimo, onAbrir, t }: {
  item: NotifItem; ultimo: boolean; onAbrir: () => void; t: Tokens;
}) {
  const leido = item.readAt != null;
  const pulsable = item.deepLink != null;

  return (
    <div
      onClick={pulsable ? onAbrir : undefined}
      role={pulsable ? 'button' : undefined}
      tabIndex={pulsable ? 0 : undefined}
      onKeyDown={pulsable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } } : undefined}
      style={{
        display: 'flex', gap: 14, padding: '22px 0',
        borderTop: `1px solid ${t.line}`,
        borderBottom: ultimo ? `1px solid ${t.line}` : undefined,
        cursor: pulsable ? 'pointer' : 'default',
      }}
    >
      {/* La columna del punto mide 6 px SIEMPRE, esté o no el punto: si se
          colapsa en los leídos, el texto de esas filas se desalinea con el de
          las demás y la lista pierde el borde izquierdo común. */}
      <div style={{ flex: '0 0 6px', paddingTop: leido ? undefined : 8 }}>
        {!leido && <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.ink }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, opacity: leido ? APAGADO_LEIDO : 1 }}>
        <div style={{ ...micro(9, 0.2), color: t.micro }}>{selloTemporal(item.createdAt)}</div>
        <div style={{ ...display(22, false, 1.1), color: t.ink, marginTop: 8, textWrap: 'pretty' } as React.CSSProperties}>
          {item.title}
        </div>
        <div style={{ fontFamily: sans, fontSize: 11.5, color: t.muted, marginTop: 8, textWrap: 'pretty' } as React.CSSProperties}>
          {item.body}
        </div>
      </div>
    </div>
  );
}

'use client';

// BONOS — vista de presentación, desacoplada de la sesión real (Fase 5 del
// editor de temas: vista previa completa de la app de socias). Extraída de
// app/portal/[slug]/bonos/page.tsx, que ahora es un wrapper fino.
//
// `navegar` reemplaza `router.push` directo: en preview no hay a dónde ir
// (esas rutas — /compras, /progreso — no existen bajo /portal-preview), así
// que el wrapper de preview pasa un no-op en vez de sacar al iframe hacia el
// portal real.

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { bonoActivo, plazaFijaTexto, fechaLarga } from '@/lib/bonos-portal';
import { display, micro, sans, texto, radio, transicion, dur, EASE, escala } from '@/lib/portal-design';
import { bloquesVisibles, type BloqueHome } from '@/lib/portal-home-bloques';
import { BloqueHomeRender } from '@/components/portal/bloque-home-render';
import { semantic } from '@/lib/portal-tokens';
import { BandaFoto } from '@/components/portal/banda-foto';
import type { PortalSession } from '@/lib/portal-auth';

export function PortalBonosView({
  session, navegar, bloquesOverride,
}: { session: PortalSession | null; navegar: (ruta: string) => void; bloquesOverride?: BloqueHome[] }) {
  const { slug } = useParams<{ slug: string }>();
  const { suscripciones, planesTarifa, tiposClase, salas, plazasFijas, reservas, bloquesBonos: bloquesBonosPublicado } = useStudio();
  const { t, noche } = useModo();
  const socioId = session?.socioId ?? null;

  // Constructor de bloques (Fase 1 del Theme Builder, generaliza Fase 3): el
  // saldo/plan es el único bloque `sistema` de esta pantalla — se ordena por
  // CSS `order` sin mover el DOM, mismo mecanismo que Inicio/Clases.
  const bloques = bloquesOverride ?? bloquesBonosPublicado;
  const bloquesOrdenados = useMemo(() => bloquesVisibles(bloques), [bloques]);
  const wrap = (sistemaId: 'listadoBonos') => {
    const i = bloquesOrdenados.findIndex((b) => b.kind === 'sistema' && b.sistemaId === sistemaId);
    return { style: { order: i === -1 ? 0 : i } };
  };
  /**
   * El texto de un bloque de SISTEMA, ya resuelto. `resolverBloques` rellena
   * lo que el estudio no haya tocado con el literal de siempre, así que sin
   * config guardada esto devuelve exactamente lo que se pintaba antes.
   */
  const txt = (sistemaId: 'listadoBonos', campo: string, siVacio: string): string => {
    const b = bloquesOrdenados.find((x) => x.kind === 'sistema' && x.sistemaId === sistemaId);
    const v = b && b.kind === 'sistema' ? b.config?.[campo] : undefined;
    // ⚠️ La cadena VACÍA cuenta como "no puesto" y cae al literal de quien
    // llama — el parámetro se llama `siVacio`. Sin esto, un campo cuyo
    // `porDefecto` es '' (como `fraseConClase`, que va vacío a propósito para
    // que cada variante de cabecera conserve SU frase) borraba el texto en vez
    // de heredarlo. Lo cazó el e2e de la cabecera `titular` en CI.
    return typeof v === 'string' && v !== '' ? v : siVacio;
  };

  const bloquesPersonalizados = useMemo(
    () => bloquesOrdenados
      .map((b, i) => ({ b, orden: i }))
      .filter((x): x is { b: Exclude<BloqueHome, { kind: 'sistema' }>; orden: number } => x.b.kind !== 'sistema'),
    [bloquesOrdenados],
  );

  const bono = useMemo(
    () => bonoActivo(suscripciones, planesTarifa, tiposClase, socioId),
    [suscripciones, planesTarifa, tiposClase, socioId],
  );
  const plaza = useMemo(
    () => plazaFijaTexto(plazasFijas, socioId, salas, tiposClase),
    [plazasFijas, socioId, salas, tiposClase],
  );
  const clasesHechas = useMemo(
    () => reservas.filter(r => r.socioId === socioId && r.estado === 'ASISTIDA').length,
    [reservas, socioId],
  );

  const fila = (titulo: string, valor: string | null, onClick: () => void, ultima = false) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 66, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
        borderTop: `1px solid ${t.line}`,
        borderBottom: ultima ? `1px solid ${t.line}` : undefined,
        transition: `padding-left ${dur.control}ms ${EASE}`,
      }}
    >
      <span style={{ ...display(23), color: t.ink }}>{titulo}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {valor && <span style={{ fontFamily: sans, fontSize: 11.5, color: t.muted }}>{valor}</span>}
        <span style={{ fontFamily: sans, fontSize: 13, color: t.heroAccent }}>→</span>
      </span>
    </button>
  );

  return (
    <div style={{ minHeight: '100%', background: t.bg, color: t.ink }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div {...wrap('listadoBonos')}>
      {/* La foto de ESTA pantalla. El padding de arriba se lo queda la banda
          cuando hay foto: si no, la imagen aparecería flotando 62 px por
          debajo del borde, con un hueco vacío encima que no pinta nada. */}
      {txt('listadoBonos', 'fotoUrl', '') && (
        <div style={{ paddingTop: 62 }}>
          <BandaFoto url={txt('listadoBonos', 'fotoUrl', '')} />
        </div>
      )}
      <div style={{ padding: txt('listadoBonos', 'fotoUrl', '') ? '0 24px 24px' : '62px 24px 24px' }}>
        <div style={{ ...micro(9.5, 0.28), color: t.micro }}>{txt('listadoBonos', 'antetitulo', 'Saldo y planes')}</div>
        <h1 style={{ ...display(escala('titulo-pantalla', 50)), color: t.ink, marginTop: 12 }}>{txt('listadoBonos', 'titulo', 'Bonos')}</h1>

        {bono ? (
          <div style={{
            marginTop: 28, borderRadius: 'var(--portal-radius-card, 26px)', background: t.surface, padding: '26px 24px',
            boxShadow: '0 18px 40px -28px rgba(34,42,30,.5)',
          }}>
            {/* ⚠️ Con VARIOS bonos el título no puede ser el nombre de uno: el
                número de debajo ya es la suma de todos, y «Bono 10 · Reformer»
                encima de «17 de 25» se lee como que ese bono tiene 25 sesiones.
                Con uno solo se mantiene su nombre, que es más concreto. */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ ...display(26), color: t.ink }}>
                {bono.bonos.length > 1 ? 'Tu saldo' : bono.nombre}
              </div>
              <div style={{ ...micro(8.5, 0.22, 600), color: t.heroAccent, whiteSpace: 'nowrap' }}>Activo</div>
            </div>

            {/* Un mensual ilimitado no tiene fracción que contar: enseñar «0 de 0»
                o una barra al 100 % haría creer que se ha gastado. */}
            {bono.totalSesiones != null && bono.totalRestantes != null ? (
              <>
                {/* ⚠️ El titular es el saldo TOTAL, no el del bono en curso.
                    Con varios bonos, «4 de 4» era el del que se está gastando
                    ahora y obligaba a sumar la cola a mano para saber lo que de
                    verdad le queda — que es justo lo que vino a mirar. */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 22 }}>
                  <span style={{ ...display(escala('numero-bono', 62), false, 0.9), color: t.ink }}>{bono.totalRestantes}</span>
                  <span style={{ fontFamily: sans, fontSize: 12, color: t.muted }}>
                    de {bono.totalSesiones} sesiones disponibles
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: t.line, marginTop: 20, overflow: 'hidden' }}>
                  <div style={{
                    // Sobre el saldo total, coherente con el número de arriba.
                    width: `${(bono.progresoTotal ?? 0) * 100}%`, height: 5, borderRadius: 3,
                    background: 'var(--portal-brand)',
                    transition: `width ${dur.card}ms ${EASE}`,
                  }} />
                </div>
              </>
            ) : (
              <div style={{ ...display(30, true), color: t.ink, marginTop: 22 }}>Sesiones ilimitadas</div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: sans, fontSize: 11, fontWeight: bono.urgente || bono.caducado ? 700 : 400,
                  color: bono.caducado
                    ? (noche ? semantic.danger.textNoche : semantic.danger.text)
                    : bono.urgente
                    ? (noche ? semantic.warning.textNoche : semantic.warning.text)
                    : t.muted,
                }}
              >
                {/* Con varios bonos esta fecha es la del PRIMERO que caduca,
                    no la de todo el saldo — se dice, o parecería que las 25
                    sesiones caducan ese día.
                    `textoCaducidad` ya empieza por «Caduca en…», así que se le
                    baja la inicial en vez de anteponer otro «caduca» y dejar
                    «Lo primero caduca: Caduca en 50 días». Y solo en bonos: en
                    un mensual la frase es «Próxima renovación en…», donde «el
                    primero» no significa nada. */}
                {bono.textoCaducidad
                  ? `${bono.bonos.length > 1 && !bono.esMensual
                      ? `El primero ${bono.textoCaducidad.charAt(0).toLowerCase()}${bono.textoCaducidad.slice(1)}`
                      : bono.textoCaducidad}${bono.caducaEn ? ` · ${fechaLarga(bono.caducaEn)}` : ''}`
                  : bono.caducaEn ? `${bono.esMensual ? 'Próxima renovación' : 'Caduca'} el ${fechaLarga(bono.caducaEn)}`
                  : bono.esMensual ? 'Activo' : 'Sin fecha de caducidad'}
              </span>
              {/* El precio es el del bono elegido: al lado de un saldo total
                  se leería como el valor de todo, así que con varios se calla
                  (cada uno tiene el suyo, y el detalle vive en la lista). */}
              {bono.precio != null && bono.bonos.length === 1 && (
                <span style={{ fontFamily: sans, fontSize: 11, color: t.muted, whiteSpace: 'nowrap' }}>
                  {bono.precio} €{bono.esMensual ? '/mes' : ''}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => navegar(`/portal/${slug}/compras`)}
              style={{
                height: 54, width: '100%', borderRadius: `var(--portal-radius-boton, ${radio.botonAlto - 6}px)`,
                border: `1px solid ${noche ? 'rgba(243,241,233,.16)' : 'rgba(34,38,31,.16)'}`,
                background: 'none', color: t.ink, ...texto.boton, fontSize: 13.5,
                marginTop: 22, cursor: 'pointer',
                transition: transicion(['background'], dur.color),
              }}
            >
              {bono.esMensual ? 'Cambiar de plan' : 'Renovar bono'}
            </button>
          </div>
        ) : null}

        {bono && bono.bonos.length > 1 && (
          // La cola, como LISTA y no como párrafo.
          //
          // Antes era una frase larga ("Tienes 5 bonos más en cola: Bono 4
          // (4 sesiones), Bono 4 (2 sesiones)… Se usarán en cuanto se agote el
          // actual. En total te quedan 12 sesiones.") que había que leer entera
          // para sacar algo que es, literalmente, una tabla. Y el total iba al
          // final, escondido, cuando es lo primero que se busca — por eso ahora
          // manda en el titular de arriba.
          <div
            style={{
              marginTop: 14, borderRadius: 'var(--portal-radius-card, 26px)',
              background: noche ? t.surface2 : '#EEF0EA',
              border: `1px solid ${noche ? t.line : 'rgba(44,53,44,.14)'}`,
              padding: '18px 20px',
            }}
          >
            <div style={{ ...micro(9, 0.24, 600), color: t.muted }}>
              Tus bonos ({bono.bonos.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12 }}>
              {bono.bonos.map((b, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
                    padding: '9px 0',
                    borderTop: i === 0 ? 'none' : `1px solid ${noche ? t.line : 'rgba(44,53,44,.10)'}`,
                    // Un bono gastado se apaga, pero NO se esconde: lo pagó, y
                    // verlo desaparecer de la lista se lee como que se lo han
                    // quitado.
                    opacity: b.agotado ? 0.45 : 1,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: t.ink,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {b.nombre}
                      {/* Solo el primero: es el que se está gastando ahora, y
                          saberlo explica por qué caduca antes que los demás. */}
                      {i === 0 && !b.agotado && (
                        <span style={{ fontWeight: 400, color: t.muted }}> · en curso</span>
                      )}
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 10.5, color: t.muted, marginTop: 2 }}>
                      {b.agotado
                        ? 'Sin sesiones'
                        : b.textoCaducidad
                        ? `${b.textoCaducidad}${b.caducaEn ? ` · ${fechaLarga(b.caducaEn)}` : ''}`
                        : b.caducaEn ? `Caduca el ${fechaLarga(b.caducaEn)}`
                        : 'Sin caducidad'}
                    </div>
                  </div>
                  <span style={{
                    fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: t.ink,
                    whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {b.restantes ?? '–'}/{b.total ?? '–'}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ fontFamily: sans, fontSize: 10.5, color: t.muted, marginTop: 10 }}>
              Se gastan por orden: primero el que caduca antes.
            </div>
          </div>
        )}

        {!bono && (
          // Sin bono la pantalla no se queda muda: lo que toca es comprar uno.
          <div style={{
            marginTop: 28, borderRadius: 'var(--portal-radius-card, 26px)', background: t.surface, padding: '26px 24px',
            boxShadow: '0 18px 40px -28px rgba(34,42,30,.5)',
          }}>
            <div style={{ ...display(26), color: t.ink }}>Todavía no tienes bono</div>
            <p style={{ fontFamily: sans, fontSize: 11.5, color: t.muted, marginTop: 10, textWrap: 'pretty' } as React.CSSProperties}>
              Con un bono activo reservas desde aquí sin pasar por recepción.
            </p>
            <button
              type="button"
              onClick={() => navegar(`/portal/${slug}/compras`)}
              style={{
                height: 54, width: '100%', borderRadius: `var(--portal-radius-boton, ${radio.botonAlto - 6}px)`, border: 'none',
                background: 'var(--portal-brand)', color: t.accentInk, ...texto.boton, fontSize: 13.5,
                marginTop: 22, cursor: 'pointer',
              }}
            >
              Ver los bonos
            </button>
          </div>
        )}

        {plaza && (
          <div style={{
            marginTop: 14, borderRadius: 'var(--portal-radius-card, 26px)',
            background: noche ? t.surface2 : '#EEF0EA',
            border: `1px solid ${noche ? t.line : 'rgba(44,53,44,.14)'}`,
            padding: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.ink }} />
              <span style={{ ...micro(8.5, 0.24, 600), color: t.ink }}>Plaza fija</span>
            </div>
            <div style={{ ...display(27, true, 1.05), color: t.ink, marginTop: 10 }}>{plaza.cuando}</div>
            {plaza.donde && (
              <div style={{ fontFamily: sans, fontSize: 11.5, color: t.muted, marginTop: 8 }}>{plaza.donde}</div>
            )}
          </div>
        )}

        <div style={{ height: 34 }} />
        {fila('Comprar otro bono', null, () => navegar(`/portal/${slug}/compras`))}
        {fila(
          'Historial de sesiones',
          `${clasesHechas} ${clasesHechas === 1 ? 'clase' : 'clases'}`,
          () => navegar(`/portal/${slug}/progreso`),
          true,
        )}
      </div>
      </div>

      {/* Bloques del catálogo (banner/texto/cta/faq) — hermanos del bloque de
          saldo/plan en el mismo contenedor flex, con el `order` que les toque
          para intercalarse antes o después de él. */}
      {bloquesPersonalizados.map(({ b, orden }) => (
        <div key={b.id} data-bloque-id={b.id} style={{ order: orden, padding: '0 24px' }}>
          <BloqueHomeRender bloque={b} slug={slug} />
        </div>
      ))}
      </div>
    </div>
  );
}

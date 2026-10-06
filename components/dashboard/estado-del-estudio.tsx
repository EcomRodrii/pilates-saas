'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight, Check } from 'lucide-react';
import { TentiIcono } from '@/components/tenti/tenti-icono';
import { ANCLA_DECIDIR, invalidarEstadoEstudio, useEstadoEstudio } from '@/lib/estado-estudio-cliente';
import type { LineaEstado } from '@/lib/estado-estudio';
import { estadoDeLaBandeja, subio } from '@/lib/tenti/momentos';

// «Lo que espera tu visto bueno» — la bandeja única de la home, justo debajo de
// la agenda del día. Contesta la segunda pregunta con la que se abre el panel:
// después de «qué pasa hoy», «¿tengo que hacer algo, o Tentare ya se encarga?».
//
// Tres bloques, en este orden y por este motivo:
//   1. Lo que espera tu decisión — lo único que es trabajo tuyo.
//   2. Tentare lo está haciendo — procesos en marcha que no tienes que tocar.
//   3. Resuelto por Tentare — para que se vea que el sistema trabaja.
//
// Sin nada en ninguno de los tres queda una sola línea discreta. No se oculta
// del todo porque «nada espera tu visto bueno» ES información (es lo que la
// deja cerrar la pantalla tranquila), pero tampoco ocupa una tarjeta: un bloque
// grande que dice lo mismo cada mañana entrena a no mirarlo.
//
// `accionesEnLinea` son las tarjetas que resuelven AQUÍ MISMO lo que la lista
// cuenta sin `href` (reservas por aprobar, penalizaciones, devoluciones, canjes,
// bajas de última hora del equipo): un solo sitio para decidir, en vez de una
// línea arriba y su botón tres secciones más abajo. Las monta la página con sus
// mismos guardias de rol; cada tarjeta carga lo suyo y devuelve null si no
// tiene nada, así que el hueco se pliega con `:empty`.
//
// ⚠️ El árbol es el MISMO en todos los estados (cargando, endpoint caído, una
// línea, bandeja completa): solo cambian clases y hermanos. Si el hueco saltara
// de rama, las tarjetas se desmontarían al llegar o refrescarse el recuento —
// y una que estuviera a mitad de «Cobrando…» volvería a ofrecer el botón con la
// lista recargada antes de que el servidor contestara.
//
// Tenti, en dos sitios de la bandeja (lib/tenti/momentos.ts):
//   · en el titular de «Decidir», donde va el Check cuando no hay nada: con
//     algo esperando, 'esperaTuOk' (o 'agobiado' desde UMBRAL_AGOBIO). La cifra
//     es la de la bandeja, el texto no cambia («N cosas esperan tu visto
//     bueno») y, si la bandeja sube con la pantalla delante (al volver a la
//     pestaña o tras resolver algo), una 'sorpresa' sin sonido;
//   · en «Tentare lo está haciendo», 'trabajando': ese bloque solo existe si
//     hay algo en marcha, así que la cara dice literalmente su título.
export function EstadoDelEstudio({ accionesEnLinea }: { accionesEnLinea?: React.ReactNode }) {
  const e = useEstadoEstudio();
  // Sin datos (cargando, error o un rol que no ve ninguna fuente) no se afirma
  // nada, pero las tarjetas se pintan igual: su dinero no puede depender de que
  // un recuento haya llegado.
  const datos = e?.aplica ? e : null;
  const estadoTenti = estadoDeLaBandeja(datos?.nDecidir);
  const subidas = useSubidas(datos?.nDecidir ?? null);
  const hayActividad = !!datos && (datos.enMarcha.length > 0 || datos.resuelto.length > 0);
  const conBandeja = !!datos && (datos.nDecidir > 0 || hayActividad);

  // Si una tarjeta tiene algo, «nada espera tu visto bueno» sería mentira: el
  // recuento va con hasta 30 s de caché y la tarjeta lee en vivo. Se esconde
  // el titular en vez de contradecir lo que se ve justo debajo.
  const ocultaSiHayTarjeta = 'group-has-[[data-acciones-en-linea]>*]/estado:hidden';

  return (
    <div className="group/estado flex flex-col gap-3">
      {datos && !conBandeja && (
        <p className={`flex items-center gap-2 px-1 text-[13px] text-muted-foreground ${ocultaSiHayTarjeta}`}>
          <Check size={15} style={{ color: 'var(--success)' }} aria-hidden />
          {datos.titulo}
        </p>
      )}

      <section
        aria-label="Lo que espera tu visto bueno"
        // Sin bandeja, el marco solo existe si alguna tarjeta tiene algo: nunca
        // una caja vacía (y, oculta, tampoco cuenta como región).
        className={`flex flex-col gap-3 rounded-xl border p-4 ${conBandeja ? '' : 'has-[>[data-acciones-en-linea]:empty]:hidden'}`}
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
      >
        {datos && conBandeja && (
          <div className={`flex flex-col gap-2 ${datos.nDecidir === 0 ? ocultaSiHayTarjeta : ''}`}>
            <p className="flex items-center gap-2 text-[15px] font-bold text-foreground">
              {estadoTenti
                ? (
                  <TentiIcono
                    ancho={18}
                    estado={estadoTenti}
                    emocion={subidas > 0 ? { tipo: 'sorpresa', clave: `sorpresa-${subidas}` } : null}
                  />
                )
                : datos.nDecidir === 0 && <Check size={16} style={{ color: 'var(--success)' }} aria-hidden />}
              {datos.titulo}
            </p>
            {datos.decidir.length > 0 && <Lineas lineas={datos.decidir} />}
          </div>
        )}

        {/* Debajo de «Decidir», con el mismo ancho que sus líneas: las tarjetas
            van sin marco propio (ya lo pone la sección) y separadas de la lista
            por la misma raya que los bloques de abajo. */}
        <div
          data-acciones-en-linea
          className={`flex flex-col gap-4 empty:hidden ${datos && datos.decidir.length > 0 ? 'border-t pt-3' : ''}`}
          style={{ borderColor: 'var(--border)' }}
        >
          {accionesEnLinea}
        </div>

        {/* Tenti firma lo que Tentare está haciendo por su cuenta: 'trabajando',
            porque el bloque solo existe si hay algo en marcha. No dice «todo
            bien» ni celebra nada: lo resuelto va aparte, con su Check. */}
        {datos && conBandeja && datos.enMarcha.length > 0 && (
          <Bloque titulo="Tentare lo está haciendo" icono={<TentiIcono ancho={18} estado="trabajando" />}>
            <Lineas lineas={datos.enMarcha} tenue />
          </Bloque>
        )}

        {datos && conBandeja && datos.resuelto.length > 0 && (
          <Bloque titulo="Resuelto por Tentare" icono={<Check size={14} style={{ color: 'var(--success)' }} aria-hidden />}>
            <Lineas lineas={datos.resuelto} tenue />
          </Bloque>
        )}
      </section>
    </div>
  );
}

/**
 * Cuántas veces ha subido `n` mientras este componente está montado (nunca al
 * cargar). Estado derivado durante el render, el patrón de React para «lo que
 * cambió desde el render anterior»: sin efecto ni ref leído al pintar.
 */
function useSubidas(n: number | null): number {
  const [visto, setVisto] = useState<{ n: number | null; subidas: number }>({ n, subidas: 0 });
  if (visto.n !== n) {
    const subidas = visto.subidas + (subio(visto.n, n) ? 1 : 0);
    setVisto({ n, subidas });
    return subidas;
  }
  return visto.subidas;
}

function Bloque({ titulo, icono, children }: { titulo: string; icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icono}
        {titulo}
      </p>
      {children}
    </div>
  );
}

// Lleva a la tarjeta de esta misma sección y le pasa el foco, para que con
// teclado se siga directo al botón. Sin `#` en la URL: recargar no debe saltar.
function irATarjeta(ev: React.MouseEvent<HTMLAnchorElement>, ancla: string) {
  ev.preventDefault();
  const tarjeta = document.getElementById(ancla);
  if (!tarjeta) {
    // La línea dice que hay algo y la tarjeta no: el recuento va por detrás
    // (otra persona ya lo resolvió). Se refresca en vez de dejar un clic mudo.
    invalidarEstadoEstudio();
    return;
  }
  const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  tarjeta.scrollIntoView({ block: 'nearest', behavior: suave ? 'smooth' : 'auto' });
  tarjeta.focus({ preventScroll: true });
}

function Lineas({ lineas, tenue }: { lineas: LineaEstado[]; tenue?: boolean }) {
  return (
    <ul className="flex flex-col gap-1">
      {lineas.map(l => {
        const texto = <span className="flex-1 leading-snug">{l.texto}</span>;
        const clase = tenue ? 'text-[13px] text-muted-foreground' : 'text-[13px] text-foreground';
        const ancla = l.href ? undefined : ANCLA_DECIDIR[l.id];
        return (
          <li key={l.id}>
            {l.href ? (
              <Link href={l.href} className={`flex items-center gap-2 rounded-md py-0.5 hover:underline ${clase}`}>
                {texto}
                <ArrowRight size={13} className="shrink-0 opacity-60" aria-hidden />
              </Link>
            ) : ancla ? (
              // Se resuelve en una tarjeta de esta misma sección, justo debajo:
              // enlazar a otra pantalla sería mandarla lejos de donde se actúa.
              <a href={`#${ancla}`} onClick={ev => irATarjeta(ev, ancla)}
                className={`flex items-center gap-2 rounded-md py-0.5 hover:underline ${clase}`}>
                {texto}
                <ArrowDown size={13} className="shrink-0 opacity-60" aria-hidden />
              </a>
            ) : (
              <span className={`flex items-center gap-2 py-0.5 ${clase}`}>{texto}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertCircle, ArrowUpRight, BadgeEuro, Building2, CalendarCheck, CalendarDays, Clapperboard, Clock, Gift, Info, Mail,
  Newspaper, PartyPopper, ShoppingBag, Sparkles, Star, Ticket, UserRound, Users, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { inputCls } from '@/components/configuracion/estilos';
import { widgetsVisibles, type MetodoIntegracion, type WidgetDisponible } from '@/lib/widgets/catalogo';
import type { ConfigConstructor } from '@/lib/widgets/config';
import { botonDeSuWeb, nombrePlataforma, usaBotonPropio, type PlataformaWeb, type Receta } from '@/lib/widgets/recetas';
import type { TipoPlan } from '@/lib/types';
import { AjusteInterruptor, Ajuste, Chips, Etiqueta, FOCO, GrupoOpciones, Plegable, Segmentado, Tarjeta, fechaCorta } from './piezas';

// Paso 1 · Qué y dónde. Primero QUÉ quiere poner y DÓNDE lo quiere (con la
// forma que mejor funciona en su web ya marcada), y solo después los ajustes
// de contenido que viajan con esa forma: con un enlace no se pinta ningún
// filtro, porque el enlace no se lo lleva. Un control que no hace nada es peor
// que no tenerlo.

export const ICONOS: Record<string, LucideIcon> = {
  CalendarDays, Clock, UserRound, CalendarCheck, BadgeEuro, Ticket, Gift, ShoppingBag,
  Sparkles, Mail, Newspaper, Building2, Users, Star, PartyPopper, Clapperboard,
};

export interface DatosPanel {
  tiposClase: readonly { id: string; nombre: string }[];
  instructoras: readonly { id: string; nombre: string }[];
  salas: readonly { id: string; nombre: string }[];
  /** `cuando`: la fecha y hora en largo, para decir cuándo deja de servir el enlace. */
  proximasClases: readonly { id: string; etiqueta: string; cuando: string }[];
  /** Cuántos planes contratables hay de cada tipo. */
  planesPorTipo: Readonly<Record<TipoPlan, number>>;
  colorEstudio: string;
  /** Las reglas de reserva del estudio, ya en frases (lib/reservar/promesas.ts). */
  reglas: readonly string[];
}

export interface AvisoDeDatos { texto: string; enlace: ReactNode }

/** Lo copiado de cada widget: cuándo, y si lo de ahora ya no es eso. */
export type EstadoCopias = Readonly<Record<string, { en: string; desfasado: boolean }>>;

type Donde = 'dentro' | 'boton' | 'enlace';
const DONDE_DE: Record<MetodoIntegracion, Donde> = { iframe: 'dentro', nativa: 'dentro', popup: 'boton', boton: 'boton', enlace: 'enlace' };

export function PasoQue({ w, c, metodo, plataforma, receta, cambiar, datos, avisos, copias, porId = false, onElegirWidget, onMetodo }: {
  w: WidgetDisponible;
  c: ConfigConstructor;
  metodo: MetodoIntegracion;
  plataforma: PlataformaWeb | null;
  receta: Receta;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  datos: DatosPanel;
  avisos: readonly AvisoDeDatos[];
  copias: EstadoCopias;
  /**
   * Su código va por id (lib/widgets/pieza.ts): lo que enseña llega a su web con
   * «Aplicar en mi web», sin volver a pegar nada.
   */
  porId?: boolean;
  onElegirWidget: (id: string) => void;
  onMetodo: (m: MetodoIntegracion) => void;
}) {
  return (
    <div className="space-y-4">
      <QueQuieres activo={w} avisos={avisos} copias={copias} onElegir={onElegirWidget} />
      <DondeLoQuieres w={w} c={c} metodo={metodo} plataforma={plataforma} receta={receta} cambiar={cambiar} onMetodo={onMetodo} />
      <QueEnsena key={w.id} w={w} c={c} metodo={metodo} cambiar={cambiar} datos={datos} porId={porId} />
    </div>
  );
}

// ── ¿Qué quieres poner en tu web? ─────────────────────────────────────────────

function icono(nombre: string, size = 17) {
  const Icono = ICONOS[nombre] ?? CalendarDays;
  return <Icono size={size} strokeWidth={1.8} />;
}

// Lo que ya puso en su web, en cada tarjeta: así, si cambió un widget que no
// es el que tiene abierto, lo ve al volver sin tener que entrar en cada uno.
function notaCopia(copia: EstadoCopias[string] | undefined): ReactNode {
  if (!copia) return undefined;
  return copia.desfasado ? (
    <span className="flex items-center gap-1 font-medium text-foreground">
      <AlertCircle size={12} aria-hidden className="shrink-0 text-warning" />Cambiado después de copiarlo
    </span>
  ) : (
    <span className="text-muted-foreground">Copiado el {fechaCorta(copia.en)}</span>
  );
}

function QueQuieres({ activo, avisos, copias, onElegir }: {
  activo: WidgetDisponible;
  avisos: readonly AvisoDeDatos[];
  copias: EstadoCopias;
  onElegir: (id: string) => void;
}) {
  const visibles = widgetsVisibles();
  const disponibles = visibles.filter((x): x is WidgetDisponible => x.estado === 'disponible');
  const principales = disponibles.filter(x => x.principal);
  const otros = disponibles.filter(x => !x.principal);
  const enCamino = visibles.filter(x => x.estado === 'en-preparacion');
  return (
    <Tarjeta titulo="¿Qué quieres poner en tu web?">
      <GrupoOpciones
        etiqueta="Qué quieres poner en tu web"
        tamano="grande"
        valor={activo.principal ? activo.id : null}
        onChange={onElegir}
        className="@md/config:grid-cols-2"
        opciones={principales.map(x => ({
          valor: x.id, titulo: x.respuesta, detalle: x.descripcion, icono: icono(x.icono),
          insignia: x.id === 'horario' ? 'Lo que más se usa' : undefined, nota: notaCopia(copias[x.id]),
        }))}
      />
      <Plegable titulo="Más cosas para tu web" abierto={!activo.principal} className="border-t border-border pt-2">
        <GrupoOpciones
          etiqueta="Más cosas para tu web"
          valor={activo.principal ? null : activo.id}
          onChange={onElegir}
          className="@md/config:grid-cols-2"
          opciones={otros.map(x => ({ valor: x.id, titulo: x.respuesta, detalle: x.descripcion, icono: icono(x.icono, 16), nota: notaCopia(copias[x.id]) }))}
        />
        {enCamino.length > 0 && (
          <ul aria-label="Próximamente" className="mt-3 grid gap-2 @md/config:grid-cols-2">
            {enCamino.map(x => (
              // No es un botón: no hace nada todavía. Se lee, no se pulsa.
              <li key={x.id} className="flex items-start gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 opacity-80">
                <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">{icono(x.icono, 16)}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-muted-foreground">{x.nombre}</span>
                    <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-medium text-muted-foreground">Próximamente</span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{x.estado === 'en-preparacion' ? x.falta : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Plegable>
      {avisos.length > 0 && (
        <ul className="space-y-2">
          {avisos.map(a => (
            <li key={a.texto} className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              <span>{a.texto} {a.enlace}</span>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

// ── ¿Dónde lo quieres? ────────────────────────────────────────────────────────

function DondeLoQuieres({ w, c, metodo, plataforma, receta: r, cambiar, onMetodo }: {
  w: WidgetDisponible;
  c: ConfigConstructor;
  metodo: MetodoIntegracion;
  plataforma: PlataformaWeb | null;
  receta: Receta;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  onMetodo: (m: MetodoIntegracion) => void;
}) {
  const no = (m: MetodoIntegracion) => (!w.metodos.includes(m) ? 'Este widget no se puede poner así.' : r.desactivados[m]);
  const botones = (['popup', 'boton'] as const).filter(m => !no(m));
  const donde = DONDE_DE[metodo];
  const recomendado = DONDE_DE[r.recomendado];
  const botonPropio = metodo === 'boton' && usaBotonPropio(plataforma);

  // Tocar la que ya está marcada no hace nada: «Dentro de una página» cubre
  // también la forma sin marco, y volver al iframe cambiaría su código sin que
  // se note.
  function elegir(d: Donde) {
    if (d === donde) return;
    if (d === 'dentro') onMetodo('iframe');
    else if (d === 'enlace') onMetodo('enlace');
    else if (donde !== 'boton') onMetodo(botones.includes(r.recomendado as 'popup' | 'boton') ? r.recomendado : botones[0]);
  }

  return (
    <Tarjeta titulo="¿Dónde lo quieres?">
      <GrupoOpciones
        etiqueta="Dónde lo quieres"
        valor={donde}
        onChange={elegir}
        className="@md/config:grid-cols-3"
        opciones={[
          { valor: 'dentro', titulo: 'Dentro de una página', detalle: 'Por ejemplo, en tu página «Horarios». Se adapta sola a su alto.', desactivada: no('iframe'), dibujo: <DibujoDentro /> },
          { valor: 'boton', titulo: 'Un botón', detalle: 'En el menú o en la portada de tu web.', desactivada: botones.length ? undefined : (no('boton') ?? no('popup')), dibujo: <DibujoBoton /> },
          { valor: 'enlace', titulo: 'Un enlace', detalle: 'Para la bio de Instagram, WhatsApp o tu newsletter. Sin código.', desactivada: no('enlace'), dibujo: <DibujoEnlace /> },
        ].map(o => ({ ...o, valor: o.valor as Donde, insignia: o.valor === recomendado ? 'Recomendado' : undefined }))}
      />

      {donde === 'boton' && (
        <Ajuste etiqueta="Al pulsar el botón">
          <Segmentado
            etiqueta="Qué hace el botón"
            valor={metodo === 'popup' ? 'popup' : 'boton'}
            onChange={onMetodo}
            opciones={[
              { valor: 'popup', nombre: 'Se abre encima de tu web', desactivada: !!no('popup') },
              { valor: 'boton', nombre: 'Lleva a tu página de reservas', desactivada: !!no('boton') },
            ]}
          />
          {no('popup') && <p className="mt-1.5 text-[12px] text-muted-foreground">{no('popup')}</p>}
        </Ajuste>
      )}

      {metodo === 'nativa' && (
        <p className="rounded-xl bg-muted/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground">
          Ahora va <strong>sin marco</strong> (integración nativa). Se cambia en el último paso, en «Para quien te hace la web».
        </p>
      )}

      <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground">
        <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
        {/* El motivo es de la RECOMENDADA: si eligió otra, se dice que es una
            recomendación y no una explicación de lo que ha marcado. */}
        <span>
          {metodo === r.recomendado
            ? <>{plataforma && <strong>{nombrePlataforma(plataforma)}: </strong>}{r.motivo}</>
            : <><strong>Recomendado para tu web: </strong>{r.motivo}</>}
        </span>
      </p>
      {r.avisos[metodo] && (
        <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground">
          <AlertCircle size={15} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <span>{r.avisos[metodo]}</span>
        </p>
      )}

      {botonPropio && (
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          Lo harás con {botonDeSuWeb(plataforma)} y tu enlace: el botón se verá exactamente como el resto de tu web.
        </p>
      )}
      {(metodo === 'popup' || (metodo === 'boton' && !botonPropio)) && <ElBoton w={w} c={c} metodo={metodo} cambiar={cambiar} />}
    </Tarjeta>
  );
}

function ElBoton({ w, c, metodo, cambiar }: {
  w: WidgetDisponible;
  c: ConfigConstructor;
  metodo: 'popup' | 'boton';
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
}) {
  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[13.5px] font-semibold text-foreground">El botón</h4>
        <Etiqueta tipo="codigo" />
      </div>
      <Ajuste etiqueta="Texto del botón" descripcion="Corto y con verbo: «Reservar clase», «Ver precios».">
        <input
          aria-label="Texto del botón"
          value={c.textoBoton ?? ''}
          placeholder={w.textoBoton}
          maxLength={40}
          onChange={e => cambiar({ textoBoton: e.target.value || null })}
          className={inputCls}
        />
      </Ajuste>
      <Ajuste etiqueta="Cómo es" descripcion="Con tu color de marca de ahora, el de Apariencia. Míralo en la vista previa: se puede pulsar.">
        <Segmentado
          etiqueta="Estilo del botón"
          valor={c.estiloBoton}
          onChange={v => cambiar({ estiloBoton: v })}
          opciones={[{ valor: 'relleno', nombre: 'Relleno' }, { valor: 'contorno', nombre: 'Solo el borde' }] as const}
        />
      </Ajuste>
      {metodo === 'boton' && (
        <Ajuste etiqueta="Al pulsarlo" descripcion="En una pestaña nueva, tu web sigue abierta detrás.">
          <Segmentado
            etiqueta="Dónde se abre"
            valor={c.abrirEn}
            onChange={v => cambiar({ abrirEn: v })}
            opciones={[{ valor: 'nueva', nombre: 'En una pestaña nueva' }, { valor: 'misma', nombre: 'En la misma pestaña' }] as const}
          />
        </Ajuste>
      )}
      {metodo === 'popup' && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Se abre encima de tu web, sin salir de ella. En el móvil ocupa la pantalla; la ✕ la cierra.
        </p>
      )}
    </div>
  );
}

// ── Qué enseña ───────────────────────────────────────────────────────────────

function EnlaceA({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-2 hover:no-underline', FOCO)}>
      {children}<ArrowUpRight size={12} aria-hidden />
    </Link>
  );
}

const SE_ACTUALIZA_SOLO: Record<string, ReactNode> = {
  citas: <>Los servicios que se pueden pedir salen de <EnlaceA href="/configuracion?tab=clases">Mis clases y citas</EnlaceA>.</>,
  estudio: <>La descripción, la dirección y el horario salen de <EnlaceA href="/configuracion?tab=estudio">Tu estudio</EnlaceA>.</>,
  equipo: <>Salen las instructoras que dan clase, con su foto. Se editan en <EnlaceA href="/equipo">Equipo</EnlaceA>.</>,
  bonos: <>Sale cada bono activo con su precio. Se editan en <EnlaceA href="/productos">Paquetes</EnlaceA>.</>,
  contacto: <>Nombre, email y mensaje. Cada consulta te llega a <EnlaceA href="/clientas">Clientas</EnlaceA>.</>,
};

function QueEnsena({ w, c, metodo, cambiar, datos, porId }: {
  w: WidgetDisponible;
  c: ConfigConstructor;
  metodo: MetodoIntegracion;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  datos: DatosPanel;
  porId: boolean;
}) {
  // Lo que enseña va en el código, o (por id) llega con «Aplicar en mi web».
  const etiqueta = porId ? 'aplicar' : 'codigo';
  const siCambia = porId
    ? 'Si lo cambias después de pegarlo, pulsa «Aplicar en mi web»: no hace falta volver a pegar nada.'
    : 'Si lo cambias después de pegarlo, tendrás que copiarlo otra vez.';
  const paginaCompleta = metodo === 'boton' || metodo === 'enlace';
  const reservas = w.categoria === 'reservas' && w.id !== 'cuenta';
  const reglas = reservas && datos.reglas.length > 0 && (
    <Plegable titulo="Con qué reglas reservan" className="border-t border-border pt-2">
      <ul className="space-y-2 rounded-xl bg-muted/50 p-3.5">
        {datos.reglas.map(r => (
          <li key={r} className="flex gap-2 text-[12.5px] leading-relaxed text-foreground">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
            {r}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        Son las de tu estudio: tu web las cumple igual que su app. <EnlaceA href="/configuracion?tab=reservas">Cambiarlas</EnlaceA>
      </p>
    </Plegable>
  );

  if (w.contenido.includes('horario')) {
    return (
      <Tarjeta titulo="Qué enseña" etiqueta={etiqueta} subtitulo={siCambia}>
        <ContenidoHorario c={c} metodo={metodo} cambiar={cambiar} datos={datos} />
        {reglas}
      </Tarjeta>
    );
  }
  if (w.contenido.includes('sesion')) {
    return (
      <Tarjeta titulo="¿Qué clase?" etiqueta={etiqueta} subtitulo={porId ? siCambia : undefined}>
        <SelectorClase c={c} cambiar={cambiar} proximas={datos.proximasClases} />
        {reglas}
      </Tarjeta>
    );
  }
  if (w.contenido.includes('cuentaInicio')) {
    return (
      <Tarjeta titulo="Qué enseña" etiqueta={etiqueta} subtitulo={porId ? siCambia : undefined}>
        <Ajuste etiqueta="Al abrir, enseña" descripcion="Tus alumnas pasan de una cosa a otra con un toque.">
          <Segmentado
            etiqueta="Con qué abre su cuenta"
            valor={c.cuentaInicio}
            onChange={v => cambiar({ cuentaInicio: v })}
            opciones={[{ valor: 'reservas', nombre: 'Sus reservas' }, { valor: 'bonos', nombre: 'Sus bonos y su perfil' }] as const}
          />
        </Ajuste>
      </Tarjeta>
    );
  }
  if (w.contenido.includes('tiposPlan')) {
    return paginaCompleta ? (
      <Tarjeta titulo="Qué enseña" etiqueta="vivo">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          El {metodo === 'enlace' ? 'enlace' : 'botón'} abre tu página de reservas con todos tus precios. Para enseñar solo algunos, ponlo dentro de la página o en un botón que se abre encima.
        </p>
      </Tarjeta>
    ) : (
      <Tarjeta titulo="¿Qué se vende?" etiqueta={etiqueta} subtitulo={siCambia}>
        <QueSeVende c={c} cambiar={cambiar} planesPorTipo={datos.planesPorTipo} />
      </Tarjeta>
    );
  }
  return (
    <Tarjeta titulo="Qué enseña" etiqueta="vivo">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {SE_ACTUALIZA_SOLO[w.id] ?? 'Tus datos de Tentare tal cual.'} Si cambias algo allí, se ve en tu web al momento, sin volver a copiar nada.
      </p>
      {reglas}
    </Tarjeta>
  );
}

type Orden = 'dias' | 'columnas' | 'semana';

function ContenidoHorario({ c, metodo, cambiar, datos }: {
  c: ConfigConstructor;
  metodo: MetodoIntegracion;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  datos: DatosPanel;
}) {
  const nativa = metodo === 'nativa';
  const paginaCompleta = metodo === 'boton' || metodo === 'enlace';
  // El iframe abre por días y la integración sin marco en columnas.
  const disenoDefecto = nativa ? 'ligero' : 'completo';
  const semana = !nativa && c.presentacion === 'semana';
  const orden: Orden = semana ? 'semana' : paginaCompleta ? 'dias' : (c.diseno ?? disenoDefecto) === 'ligero' ? 'columnas' : 'dias';
  const [algunas, setAlgunas] = useState(c.tipos.length + c.instructoras.length + c.salas.length > 0);

  function ordenar(v: Orden) {
    if (v === 'semana') cambiar({ presentacion: 'semana' });
    else if (v === 'columnas') cambiar({ presentacion: 'lista', diseno: nativa ? null : 'ligero' });
    // La página completa no lee `diseno`: se deja como estaba.
    else if (paginaCompleta) cambiar({ presentacion: 'lista' });
    else cambiar({ presentacion: 'lista', diseno: nativa ? 'completo' : null });
  }
  function todas() {
    setAlgunas(false);
    if (c.tipos.length || c.instructoras.length || c.salas.length) cambiar({ tipos: [], instructoras: [], salas: [] });
  }

  const opcionesOrden = [
    { valor: 'dias' as const, titulo: 'Día a día', dibujo: <DibujoDias /> },
    ...(paginaCompleta ? [] : [{ valor: 'columnas' as const, titulo: 'Siete días en columnas', dibujo: <DibujoColumnas /> }]),
    ...(nativa ? [] : [{ valor: 'semana' as const, titulo: 'Calendario con horas', dibujo: <DibujoSemana /> }]),
  ];

  return (
    <>
      <Ajuste etiqueta="Cómo se ordena">
        <GrupoOpciones
          etiqueta="Cómo se ordena"
          tamano="mini"
          valor={orden}
          onChange={ordenar}
          className={opcionesOrden.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}
          opciones={opcionesOrden}
        />
        {nativa && c.presentacion === 'semana' && (
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            Sin marco, el horario se ve en lista. El calendario con horas funciona dentro de una página, en un botón o en un enlace.
          </p>
        )}
      </Ajuste>

      {paginaCompleta ? (
        <p className="rounded-xl bg-muted/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          El {metodo === 'enlace' ? 'enlace' : 'botón'} abre tu página de reservas con todas tus clases. Para enseñar solo algunas o quitar el precio, ponlo dentro de la página o en un botón que se abre encima.
        </p>
      ) : (
        <>
          <div className="space-y-3">
            <Ajuste etiqueta="¿Qué clases salen?">
              <Segmentado
                etiqueta="Qué clases salen"
                valor={algunas ? 'algunas' : 'todas'}
                onChange={v => (v === 'todas' ? todas() : setAlgunas(true))}
                opciones={[{ valor: 'todas', nombre: 'Todas' }, { valor: 'algunas', nombre: 'Solo algunas' }] as const}
              />
            </Ajuste>
            {algunas && (
              <div className="space-y-4 rounded-xl border border-border p-3.5">
                <Chips
                  etiqueta="Solo estas clases"
                  descripcion="Sin nada marcado, todas."
                  opciones={datos.tiposClase}
                  seleccion={c.tipos}
                  onChange={ids => cambiar({ tipos: ids })}
                  vacio="Todavía no hay tipos de clase."
                />
                <Chips
                  etiqueta="Solo las de estas instructoras"
                  descripcion="Sin nada marcado, las de todas."
                  opciones={datos.instructoras}
                  seleccion={c.instructoras}
                  onChange={ids => cambiar({ instructoras: ids })}
                  vacio="Todavía no hay instructoras activas."
                />
                {datos.salas.length > 1 && (
                  <Chips
                    etiqueta="Solo en estas salas"
                    descripcion="Sin nada marcado, en todas."
                    opciones={datos.salas}
                    seleccion={c.salas}
                    onChange={ids => cambiar({ salas: ids })}
                    vacio="Todavía no hay salas."
                  />
                )}
              </div>
            )}
          </div>
          <div className="space-y-3">
            <p className="text-[13px] font-medium text-foreground">Qué se ve de cada clase</p>
            <AjusteInterruptor etiqueta="El precio" descripcion="Sin él se reserva igual: solo deja de verse." on={c.mostrarPrecio} onChange={v => cambiar({ mostrarPrecio: v })} />
            <AjusteInterruptor etiqueta="El nivel" descripcion="Principiante, medio, avanzado…" on={c.mostrarNivel} onChange={v => cambiar({ mostrarNivel: v })} />
          </div>
          <Plegable titulo="Más opciones" abierto={c.vista === 'hoy' || !c.mostrarSustituta} className="border-t border-border pt-2">
            <div className="space-y-4">
              {!semana && (
                <AjusteInterruptor etiqueta="Al abrir, solo las clases de hoy" descripcion="Si no, enseña los próximos días." on={c.vista === 'hoy'} onChange={v => cambiar({ vista: v ? 'hoy' : 'todo' })} />
              )}
              <AjusteInterruptor etiqueta="Aviso «Hoy la da…»" descripcion="Cuando otra instructora cubre la clase." on={c.mostrarSustituta} onChange={v => cambiar({ mostrarSustituta: v })} />
            </div>
          </Plegable>
        </>
      )}
    </>
  );
}

function QueSeVende({ c, cambiar, planesPorTipo }: {
  c: ConfigConstructor;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  planesPorTipo: Readonly<Record<TipoPlan, number>>;
}) {
  const [algunos, setAlgunos] = useState(c.tiposPlan.length > 0);
  const opciones = ([['MENSUAL', 'Cuotas'], ['BONO', 'Bonos'], ['PUNTUAL', 'Clase suelta']] as const)
    .filter(([t]) => planesPorTipo[t] > 0)
    .map(([id, nombre]) => ({ id, nombre: `${nombre} · ${planesPorTipo[id]}` }));
  return (
    <>
      <Segmentado
        etiqueta="Qué se vende"
        valor={algunos ? 'algunos' : 'todo'}
        onChange={v => {
          setAlgunos(v === 'algunos');
          if (v === 'todo' && c.tiposPlan.length) cambiar({ tiposPlan: [] });
        }}
        opciones={[{ valor: 'todo', nombre: 'Todo' }, { valor: 'algunos', nombre: 'Solo algunos' }] as const}
      />
      {algunos && (
        <Chips
          etiqueta="Solo estos"
          descripcion="Sin nada marcado, todo lo que tienes a la venta."
          opciones={opciones}
          seleccion={c.tiposPlan}
          onChange={ids => cambiar({ tiposPlan: ids as TipoPlan[] })}
          vacio="No tienes planes a la venta online."
        />
      )}
      <p className="text-[12px] text-muted-foreground">Precios, nombres y el «más elegido» salen de <EnlaceA href="/productos">Paquetes</EnlaceA>.</p>
    </>
  );
}

/** La clase de «Una clase concreta». Se pide también en el último paso si falta. */
export function SelectorClase({ c, cambiar, proximas }: {
  c: ConfigConstructor;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  proximas: DatosPanel['proximasClases'];
}) {
  const elegida = proximas.find(s => s.id === c.sesion);
  return (
    <Ajuste etiqueta="La clase" descripcion="El enlace lleva directo a ella: sin buscarla en el horario.">
      <select
        aria-label="Qué clase"
        value={c.sesion ?? ''}
        onChange={e => cambiar({ sesion: e.target.value || null })}
        className={inputCls}
      >
        <option value="">Elige una clase próxima…</option>
        {proximas.map(s => <option key={s.id} value={s.id}>{s.etiqueta}</option>)}
      </select>
      {proximas.length === 0 && (
        <p className="mt-2 text-[12px] text-muted-foreground">No hay clases próximas. Crea alguna en el <EnlaceA href="/calendario">calendario</EnlaceA>.</p>
      )}
      {elegida && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground">
          <AlertCircle size={15} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <span>Deja de servir cuando pase la clase (<strong>{elegida.cuando}</strong>). Para algo que dure, pon tu horario.</span>
        </p>
      )}
    </Ajuste>
  );
}

// ── Dibujos ──────────────────────────────────────────────────────────────────
// Con `currentColor`: toman el gris del texto y se leen en claro y en oscuro.

function DibujoDentro() {
  return (
    <svg viewBox="0 0 120 58" className="h-11 w-full">
      <rect x="8" y="7" width="104" height="44" rx="4" fill="none" stroke="currentColor" strokeOpacity=".45" />
      <rect x="14" y="12" width="30" height="4" rx="2" fill="currentColor" fillOpacity=".3" />
      <rect x="14" y="21" width="92" height="25" rx="3" fill="currentColor" fillOpacity=".12" />
      <rect x="18" y="25" width="40" height="5" rx="2" fill="currentColor" fillOpacity=".7" />
      <rect x="18" y="34" width="60" height="5" rx="2" fill="currentColor" fillOpacity=".35" />
    </svg>
  );
}

function DibujoBoton() {
  return (
    <svg viewBox="0 0 120 58" className="h-11 w-full">
      <rect x="8" y="7" width="104" height="44" rx="4" fill="none" stroke="currentColor" strokeOpacity=".45" />
      <rect x="14" y="12" width="30" height="4" rx="2" fill="currentColor" fillOpacity=".3" />
      <rect x="14" y="22" width="60" height="4" rx="2" fill="currentColor" fillOpacity=".3" />
      <rect x="14" y="31" width="44" height="12" rx="6" fill="currentColor" fillOpacity=".8" />
    </svg>
  );
}

function DibujoEnlace() {
  return (
    <svg viewBox="0 0 120 58" className="h-11 w-full">
      <rect x="44" y="4" width="32" height="50" rx="6" fill="none" stroke="currentColor" strokeOpacity=".45" />
      <circle cx="60" cy="16" r="5" fill="currentColor" fillOpacity=".3" />
      <rect x="49" y="26" width="22" height="3" rx="1.5" fill="currentColor" fillOpacity=".3" />
      <rect x="48" y="34" width="24" height="8" rx="3" fill="none" stroke="currentColor" strokeOpacity=".8" />
    </svg>
  );
}

function DibujoDias() {
  return (
    <svg viewBox="0 0 90 50" className="h-10 w-full">
      {[8, 24, 40, 56].map((x, i) => <rect key={x} x={x} y="6" width="12" height="8" rx="3" fill="currentColor" fillOpacity={i === 0 ? '.8' : '.25'} />)}
      <rect x="8" y="19" width="74" height="9" rx="3" fill="none" stroke="currentColor" strokeOpacity=".45" />
      <rect x="8" y="32" width="74" height="9" rx="3" fill="none" stroke="currentColor" strokeOpacity=".45" />
    </svg>
  );
}

function DibujoColumnas() {
  return (
    <svg viewBox="0 0 90 50" className="h-10 w-full">
      {[0, 1, 2, 3, 4].map(i => (
        <g key={i}>
          <rect x={7 + i * 16} y="6" width="13" height="38" rx="3" fill="none" stroke="currentColor" strokeOpacity=".45" />
          <rect x={9 + i * 16} y={10 + (i % 2) * 8} width="9" height="6" rx="2" fill="currentColor" fillOpacity=".55" />
        </g>
      ))}
    </svg>
  );
}

function DibujoSemana() {
  return (
    <svg viewBox="0 0 90 50" className="h-10 w-full">
      {[0, 1, 2, 3].map(i => <line key={i} x1="8" x2="82" y1={12 + i * 10} y2={12 + i * 10} stroke="currentColor" strokeOpacity=".3" />)}
      <rect x="14" y="13" width="12" height="8" rx="2" fill="currentColor" fillOpacity=".55" />
      <rect x="38" y="23" width="12" height="8" rx="2" fill="currentColor" fillOpacity=".55" />
      <rect x="62" y="13" width="12" height="18" rx="2" fill="currentColor" fillOpacity=".55" />
    </svg>
  );
}

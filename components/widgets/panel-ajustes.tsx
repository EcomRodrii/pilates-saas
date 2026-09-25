'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Building2, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inputCls } from '@/components/configuracion/estilos';
import { SelectorFuente } from '@/components/ui/selector-fuente';
import { MODO_TOKENS } from '@/lib/portal-modo';
import type { MetodoIntegracion, WidgetDisponible } from '@/lib/widgets/catalogo';
import { anchoPorDefecto, ETIQUETA_VALIDA, type ConfigConstructor } from '@/lib/widgets/config';
import type { TipoPlan } from '@/lib/types';
import { Ajuste, AjusteInterruptor, Chips, ColorOpcional, Grupo, Segmentado } from './piezas';

// El panel de ajustes, en cuatro pestañas para no tener 50 opciones en una
// pared: QUÉ enseña, CÓMO se ve, cómo SE COMPORTA y lo técnico.
//
// ⚠️ Solo se pinta un control si el motor lo honra con el método elegido:
// la integración nativa no entiende la forma ni la densidad, el enlace no
// entiende ningún filtro. Un control que no hace nada es peor que no tenerlo.

export type PestanaAjustes = 'contenido' | 'diseno' | 'comportamiento' | 'avanzado';

const PESTANAS: readonly { id: PestanaAjustes; nombre: string }[] = [
  { id: 'contenido', nombre: 'Contenido' },
  { id: 'diseno', nombre: 'Diseño' },
  { id: 'comportamiento', nombre: 'Comportamiento' },
  { id: 'avanzado', nombre: 'Avanzado' },
];

export interface DatosPanel {
  tiposClase: readonly { id: string; nombre: string }[];
  instructoras: readonly { id: string; nombre: string }[];
  salas: readonly { id: string; nombre: string }[];
  proximasClases: readonly { id: string; etiqueta: string }[];
  /** Cuántos planes contratables hay de cada tipo. */
  planesPorTipo: Readonly<Record<TipoPlan, number>>;
  colorEstudio: string;
  /** Las reglas de reserva del estudio, ya en frases (lib/reservar/promesas.ts). */
  reglas: readonly string[];
}

export function PanelAjustes({ widget: w, config: c, metodo, cambiar, datos, dominios }: {
  widget: WidgetDisponible;
  config: ConfigConstructor;
  metodo: MetodoIntegracion;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  datos: DatosPanel;
  /** El gestor de dominios autorizados (solo integración nativa). */
  dominios: ReactNode;
}) {
  const [pestana, setPestana] = useState<PestanaAjustes>('contenido');
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Flechas entre pestañas (patrón ARIA de tabs: una sola en el orden de tabulación).
  function teclas(e: KeyboardEvent<HTMLButtonElement>) {
    const i = PESTANAS.findIndex(p => p.id === pestana);
    const siguiente = e.key === 'ArrowRight' ? (i + 1) % PESTANAS.length
      : e.key === 'ArrowLeft' ? (i - 1 + PESTANAS.length) % PESTANAS.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? PESTANAS.length - 1 : -1;
    if (siguiente < 0) return;
    e.preventDefault();
    const id = PESTANAS[siguiente].id;
    setPestana(id);
    refs.current[id]?.focus();
  }

  return (
    <section aria-label="Ajustes del widget" className="min-w-0 rounded-2xl border border-border bg-card shadow-xs">
      <div role="tablist" aria-label="Ajustes" className="flex gap-0.5 overflow-x-auto border-b border-border px-1.5 pt-2 [scrollbar-width:none]">
        {PESTANAS.map(p => {
          const on = pestana === p.id;
          return (
            <button
              key={p.id}
              ref={el => { refs.current[p.id] = el; }}
              id={`${base}-tab-${p.id}`}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={`${base}-panel-${p.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setPestana(p.id)}
              onKeyDown={teclas}
              className={cn(
                'relative shrink-0 rounded-t-lg px-2 pb-2.5 pt-2 text-[12px] font-medium transition-colors min-h-10',
                'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                on ? 'text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.nombre}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel-${pestana}`}
        aria-labelledby={`${base}-tab-${pestana}`}
        tabIndex={0}
        className="space-y-7 p-4 @md/config:p-5 focus-visible:outline-none"
      >
        {pestana === 'contenido' && <Contenido w={w} c={c} metodo={metodo} cambiar={cambiar} datos={datos} />}
        {pestana === 'diseno' && <Diseno w={w} c={c} metodo={metodo} cambiar={cambiar} datos={datos} />}
        {pestana === 'comportamiento' && <Comportamiento w={w} c={c} metodo={metodo} cambiar={cambiar} datos={datos} />}
        {pestana === 'avanzado' && <Avanzado w={w} c={c} metodo={metodo} cambiar={cambiar} dominios={dominios} />}
      </div>
    </section>
  );
}

interface PropsPestana {
  w: WidgetDisponible;
  c: ConfigConstructor;
  metodo: MetodoIntegracion;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  datos: DatosPanel;
}

const aPaginaCompleta = (m: MetodoIntegracion) => m === 'enlace' || m === 'boton';

function AvisoPaginaCompleta() {
  return (
    <p className="rounded-xl bg-muted/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
      El enlace y el botón abren tu página de reservas completa, con todo tu horario. Estos
      ajustes se aplican al widget incrustado y al popup.
    </p>
  );
}

function EnlaceA({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-2 hover:no-underline">
      {children}<ArrowUpRight size={12} aria-hidden />
    </Link>
  );
}

// ── Contenido ────────────────────────────────────────────────────────────────

function Contenido({ w, c, metodo, cambiar, datos }: PropsPestana) {
  const nativa = metodo === 'nativa';
  const disenoDefecto = nativa ? 'ligero' : 'completo';
  const bloques: ReactNode[] = [];

  if (w.contenido.includes('sesion')) {
    bloques.push(
      <Grupo key="sesion" titulo="La clase">
        <Ajuste etiqueta="Qué clase" descripcion="El enlace lleva directo a ella: sin buscarla en el horario.">
          <select
            aria-label="Qué clase"
            value={c.sesion ?? ''}
            onChange={e => cambiar({ sesion: e.target.value || null })}
            className={inputCls}
          >
            <option value="">Elige una clase próxima…</option>
            {datos.proximasClases.map(s => <option key={s.id} value={s.id}>{s.etiqueta}</option>)}
          </select>
          {datos.proximasClases.length === 0 && (
            <p className="mt-2 text-[12px] text-muted-foreground">No hay clases próximas. Crea alguna en el <EnlaceA href="/calendario">calendario</EnlaceA>.</p>
          )}
        </Ajuste>
      </Grupo>,
    );
  }

  if (w.contenido.includes('horario')) {
    bloques.push(
      <Grupo key="vista" titulo="Cómo se ve el horario">
        {aPaginaCompleta(metodo) && <AvisoPaginaCompleta />}
        <Ajuste etiqueta="Vista" descripcion="Por días: una tira con el día abierto. Semana: toda la semana en una rejilla.">
          <Segmentado
            etiqueta="Vista del horario"
            valor={c.diseno ?? disenoDefecto}
            onChange={v => cambiar({ diseno: v === disenoDefecto ? null : v })}
            opciones={[{ valor: 'completo', nombre: 'Por días' }, { valor: 'ligero', nombre: 'Semana' }] as const}
          />
        </Ajuste>
        <Ajuste etiqueta="Al abrir" descripcion="Qué días enseña nada más cargar.">
          <Segmentado
            etiqueta="Qué días enseña al abrir"
            valor={c.vista}
            onChange={v => cambiar({ vista: v })}
            opciones={[{ valor: 'todo', nombre: 'Todos los próximos' }, { valor: 'hoy', nombre: 'Solo hoy' }] as const}
          />
        </Ajuste>
      </Grupo>,
      <Grupo key="filtros" titulo="Qué clases">
        <Chips
          etiqueta="Tipos de clase"
          descripcion="Sin nada marcado, todas."
          opciones={datos.tiposClase}
          seleccion={c.tipos}
          onChange={ids => cambiar({ tipos: ids })}
          vacio="Todavía no hay tipos de clase."
        />
        <Chips
          etiqueta="Instructoras"
          descripcion="Solo las clases de las que marques. Sin nada marcado, todas."
          opciones={datos.instructoras}
          seleccion={c.instructoras}
          onChange={ids => cambiar({ instructoras: ids })}
          vacio="Todavía no hay instructoras activas."
        />
        {datos.salas.length > 1 && (
          <Chips
            etiqueta="Salas"
            descripcion="Sin nada marcado, todas."
            opciones={datos.salas}
            seleccion={c.salas}
            onChange={ids => cambiar({ salas: ids })}
            vacio="Todavía no hay salas."
          />
        )}
      </Grupo>,
      <Grupo key="datos" titulo="Qué se ve de cada clase">
        <AjusteInterruptor etiqueta="Precio" descripcion="Sin él, se reserva igual: solo deja de verse." on={c.mostrarPrecio} onChange={v => cambiar({ mostrarPrecio: v })} />
        <AjusteInterruptor etiqueta="Nivel" descripcion="Principiante, medio, avanzado…" on={c.mostrarNivel} onChange={v => cambiar({ mostrarNivel: v })} />
        <AjusteInterruptor etiqueta="Aviso de sustituta" descripcion="«Hoy la da…» cuando otra instructora cubre la clase." on={c.mostrarSustituta} onChange={v => cambiar({ mostrarSustituta: v })} />
      </Grupo>,
    );
  }

  if (w.contenido.includes('cuentaInicio')) {
    bloques.push(
      <Grupo key="cuenta" titulo="Mi cuenta">
        <Ajuste etiqueta="Abre en" descripcion="Tus alumnas pasan de una a otra con un toque.">
          <Segmentado
            etiqueta="Con qué abre Mi cuenta"
            valor={c.cuentaInicio}
            onChange={v => cambiar({ cuentaInicio: v })}
            opciones={[{ valor: 'reservas', nombre: 'Mis reservas' }, { valor: 'bonos', nombre: 'Bonos y perfil' }] as const}
          />
        </Ajuste>
      </Grupo>,
    );
  }

  if (w.contenido.includes('tiposPlan')) {
    const opciones = ([['MENSUAL', 'Cuotas'], ['BONO', 'Bonos'], ['PUNTUAL', 'Clase suelta']] as const)
      .filter(([t]) => datos.planesPorTipo[t] > 0)
      .map(([id, nombre]) => ({ id, nombre: `${nombre} · ${datos.planesPorTipo[id]}` }));
    bloques.push(
      <Grupo key="planes" titulo="Qué se vende">
        {aPaginaCompleta(metodo) && <AvisoPaginaCompleta />}
        <Chips
          etiqueta="Tipos de plan"
          descripcion="Sin nada marcado, todos los que tienes a la venta."
          opciones={opciones}
          seleccion={c.tiposPlan}
          onChange={ids => cambiar({ tiposPlan: ids as TipoPlan[] })}
          vacio="No tienes planes a la venta online."
        />
        <p className="text-[12px] text-muted-foreground">Precios, nombres y el «más elegido» salen de <EnlaceA href="/productos">Paquetes</EnlaceA>.</p>
      </Grupo>,
    );
  }

  if (bloques.length === 0) {
    const donde: Record<string, ReactNode> = {
      citas: <>Los servicios que se pueden pedir salen de <EnlaceA href="/configuracion?tab=clases">Mis clases y citas</EnlaceA>.</>,
      estudio: <>La descripción, la dirección y el horario salen de <EnlaceA href="/configuracion?tab=estudio">Tu estudio</EnlaceA>.</>,
      equipo: <>Salen las instructoras que dan clase, con su foto. Se editan en <EnlaceA href="/equipo">Equipo</EnlaceA>.</>,
      bonos: <>Sale cada bono activo con precio. Se editan en <EnlaceA href="/productos">Paquetes</EnlaceA>.</>,
    };
    bloques.push(
      <Grupo key="nada" titulo="Qué enseña">
        <p className="text-[13px] leading-relaxed text-muted-foreground">{donde[w.id] ?? 'Enseña tus datos de Tentare tal cual.'} Cualquier cambio allí se ve aquí al momento, sin volver a copiar el código.</p>
      </Grupo>,
    );
  }
  return <>{bloques}</>;
}

// ── Diseño ───────────────────────────────────────────────────────────────────

function Diseno({ w, c, metodo, cambiar, datos }: PropsPestana) {
  const nativa = metodo === 'nativa';
  const conBoton = metodo === 'boton' || metodo === 'popup';
  const soloBoton = metodo === 'boton';
  const soloEnlace = metodo === 'enlace';
  const propia = c.identidad === 'propia';

  if (soloEnlace) {
    return (
      <Grupo titulo="Diseño">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          El enlace abre tu página de reservas con la apariencia de tu portal. Se cambia en <EnlaceA href="/configuracion?tab=marca">Marca y colores</EnlaceA>.
        </p>
      </Grupo>
    );
  }

  return (
    <>
      <Grupo titulo="Identidad">
        <div role="radiogroup" aria-label="Identidad del widget" className="grid gap-2 @sm/config:grid-cols-2">
          <OpcionIdentidad
            on={!propia}
            onElegir={() => cambiar({ identidad: 'estudio' })}
            icono={<Building2 size={16} aria-hidden />}
            titulo="La de tu estudio"
            texto={nativa
              ? 'Tu color de marca y la letra de tu web. Parece hecho a medida.'
              : soloBoton
                ? 'El color de tu marca.'
                : 'Tus colores y tu tipografía de Apariencia. Si los cambias, el widget cambia solo.'}
          />
          <OpcionIdentidad
            on={propia}
            onElegir={() => cambiar({ identidad: 'propia' })}
            icono={<Palette size={16} aria-hidden />}
            titulo="Personalizar este widget"
            texto="Colores y letra solo para este widget, distintos de los de tu portal."
          />
        </div>
      </Grupo>

      {propia && (
        <Grupo titulo="Color">
          <ColorOpcional etiqueta="Color principal" descripcion="Botones y acentos." valor={c.marca} muestra={datos.colorEstudio} onChange={v => cambiar({ marca: v })} />
          {!soloBoton && (
            <>
              {!nativa && (
                <Ajuste etiqueta="Tema" descripcion="Oscuro, para una web de fondo oscuro: letra clara.">
                  <Segmentado
                    etiqueta="Tema del widget"
                    valor={c.tema}
                    onChange={v => cambiar({ tema: v })}
                    opciones={[{ valor: 'auto', nombre: 'Automático' }, { valor: 'claro', nombre: 'Claro' }, { valor: 'oscuro', nombre: 'Oscuro' }] as const}
                  />
                </Ajuste>
              )}
              <Ajuste etiqueta="Fondo" descripcion={nativa ? 'Sin tocar, se ve el fondo de tu web.' : '«El de tu web» lo deja transparente: se funde con la página.'}>
                <Segmentado
                  etiqueta="Fondo del widget"
                  valor={c.fondo === null ? 'defecto' : c.fondo === 'transparente' ? 'transparente' : 'color'}
                  onChange={v => cambiar({ fondo: v === 'defecto' ? null : v === 'transparente' ? 'transparente' : (c.fondo && c.fondo !== 'transparente' ? c.fondo : '#F6F3EC') })}
                  opciones={(nativa
                    ? [{ valor: 'defecto', nombre: 'El de tu web' }, { valor: 'color', nombre: 'Un color' }]
                    : [{ valor: 'defecto', nombre: 'El del portal' }, { valor: 'transparente', nombre: 'El de tu web' }, { valor: 'color', nombre: 'Un color' }]) as { valor: 'defecto' | 'transparente' | 'color'; nombre: string }[]}
                />
                {c.fondo && c.fondo !== 'transparente' && (
                  <div className="mt-2"><ColorOpcional etiqueta="Color de fondo" valor={c.fondo} muestra="#F6F3EC" onChange={v => cambiar({ fondo: v })} /></div>
                )}
              </Ajuste>
              <ColorOpcional etiqueta="Texto" descripcion="El color de la letra principal." valor={c.tinta} muestra={MODO_TOKENS.dia.ink} onChange={v => cambiar({ tinta: v })} />
              {!nativa && (
                <>
                  <ColorOpcional etiqueta="Tarjetas" descripcion="El fondo de cada clase y de los campos." valor={c.superficie} muestra="#FFFFFF" onChange={v => cambiar({ superficie: v })} />
                  <ColorOpcional etiqueta="Bordes" descripcion="Líneas y separadores." valor={c.linea} muestra="#E4E1D8" onChange={v => cambiar({ linea: v })} />
                </>
              )}
            </>
          )}
        </Grupo>
      )}

      {propia && !soloBoton && (
        <Grupo titulo="Tipografía">
          <SelectorFuente
            etiqueta="Tipografía"
            ayuda={nativa ? 'Sin tocar, la de tu web.' : 'Sin tocar, la de tu portal.'}
            valor={c.fuente}
            onChange={v => cambiar({ fuente: v })}
            etiquetaPorDefecto={nativa ? 'La de tu web' : 'La de tu portal'}
          />
          <SelectorFuente
            etiqueta="Tipografía de titulares"
            ayuda="Nombres de clase, horas y precios."
            valor={c.fuenteDisplay}
            onChange={v => cambiar({ fuenteDisplay: v })}
            etiquetaPorDefecto="Igual que la de arriba"
          />
        </Grupo>
      )}

      {((propia && !nativa) || conBoton) && (
        <Grupo titulo="Forma">
          {propia && !nativa && (
            <Ajuste etiqueta="Esquinas" descripcion={soloBoton ? 'Las del botón.' : 'Tarjetas, botones y campos a la vez.'}>
              <Segmentado
                etiqueta="Esquinas"
                valor={c.forma ?? 'pill'}
                onChange={v => cambiar({ forma: v })}
                opciones={[{ valor: 'pill', nombre: 'Redondas' }, { valor: 'redondeado', nombre: 'Suaves' }, { valor: 'recto', nombre: 'Rectas' }] as const}
              />
            </Ajuste>
          )}
          {propia && !nativa && !soloBoton && (
            <Ajuste etiqueta="Densidad" descripcion="Compacta aprieta los huecos para que quepan más clases.">
              <Segmentado
                etiqueta="Densidad"
                valor={c.densidad ?? 'comoda'}
                onChange={v => cambiar({ densidad: v === 'comoda' ? null : v })}
                opciones={[{ valor: 'comoda', nombre: 'Cómoda' }, { valor: 'compacta', nombre: 'Compacta' }] as const}
              />
            </Ajuste>
          )}
          {conBoton && (
            <Ajuste etiqueta="Estilo del botón">
              <Segmentado
                etiqueta="Estilo del botón"
                valor={c.estiloBoton}
                onChange={v => cambiar({ estiloBoton: v })}
                opciones={[{ valor: 'relleno', nombre: 'Relleno' }, { valor: 'contorno', nombre: 'Contorno' }] as const}
              />
            </Ajuste>
          )}
        </Grupo>
      )}

      {metodo === 'iframe' && (
        <Grupo titulo="Tamaño">
          <Ajuste etiqueta="Ancho" descripcion="Compacto se queda en una columna; a todo el ancho ocupa el hueco de tu página.">
            <Segmentado
              etiqueta="Ancho del widget"
              valor={c.ancho ?? anchoPorDefecto(w)}
              onChange={v => cambiar({ ancho: v === anchoPorDefecto(w) ? null : v })}
              opciones={[{ valor: 'compacto', nombre: 'Compacto' }, { valor: 'completo', nombre: 'Todo el ancho' }] as const}
            />
          </Ajuste>
        </Grupo>
      )}
    </>
  );
}

function OpcionIdentidad({ on, onElegir, icono, titulo, texto }: {
  on: boolean; onElegir: () => void; icono: ReactNode; titulo: string; texto: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onElegir}
      className={cn(
        'flex h-full flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        on ? 'border-brand/60 bg-brand/5' : 'border-border hover:bg-muted/50',
      )}
    >
      <span className={cn('flex size-7 items-center justify-center rounded-lg', on ? 'bg-brand text-brand-foreground' : 'bg-muted text-foreground')}>{icono}</span>
      <span className="text-[13px] font-semibold text-foreground">{titulo}</span>
      <span className="text-[11.5px] leading-snug text-muted-foreground">{texto}</span>
    </button>
  );
}

// ── Comportamiento ───────────────────────────────────────────────────────────

function Comportamiento({ w, c, metodo, cambiar, datos }: PropsPestana) {
  const conBoton = metodo === 'boton' || metodo === 'popup';
  const reservas = w.categoria === 'reservas' && w.id !== 'cuenta';
  return (
    <>
      {conBoton && (
        <Grupo titulo="El botón">
          <Ajuste etiqueta="Texto" descripcion="Corto y con verbo: «Reservar clase», «Ver precios».">
            <input
              aria-label="Texto del botón"
              value={c.textoBoton ?? ''}
              placeholder={w.textoBoton}
              maxLength={40}
              onChange={e => cambiar({ textoBoton: e.target.value || null })}
              className={inputCls}
            />
          </Ajuste>
          {metodo === 'boton' && (
            <Ajuste etiqueta="Al pulsarlo" descripcion="En una pestaña nueva, tu web sigue abierta detrás.">
              <Segmentado
                etiqueta="Dónde se abre"
                valor={c.abrirEn}
                onChange={v => cambiar({ abrirEn: v })}
                opciones={[{ valor: 'nueva', nombre: 'Pestaña nueva' }, { valor: 'misma', nombre: 'Misma pestaña' }] as const}
              />
            </Ajuste>
          )}
          {metodo === 'popup' && (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Se abre encima de tu web, sin salir de ella. En el móvil ocupa la pantalla; Esc o la ✕ la cierran.
            </p>
          )}
        </Grupo>
      )}

      {(metodo === 'iframe' || metodo === 'popup') && (
        <Grupo titulo="Pie">
          <AjusteInterruptor
            etiqueta="Dirección y legales al pie"
            descripcion="Tu web ya suele tenerlos. La privacidad y las condiciones se siguen enseñando al reservar."
            on={c.mostrarPie}
            onChange={v => cambiar({ mostrarPie: v })}
          />
        </Grupo>
      )}

      {reservas && (
        <Grupo titulo="Cómo reservan" accion={<EnlaceA href="/configuracion?tab=reservas">Cambiar</EnlaceA>}>
          <ul className="space-y-2 rounded-xl bg-muted/50 p-3.5">
            {datos.reglas.map(r => (
              <li key={r} className="flex gap-2 text-[12.5px] leading-relaxed text-foreground">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                {r}
              </li>
            ))}
          </ul>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Son las reglas de tu estudio: el widget las cumple igual que la app. Reservar,
            cancelar, la lista de espera y el pago funcionan dentro de tu web, sin salir de ella.
          </p>
        </Grupo>
      )}

      {!conBoton && !reservas && metodo !== 'iframe' && (
        <Grupo titulo="Comportamiento">
          <p className="text-[13px] text-muted-foreground">Este método no tiene nada más que ajustar.</p>
        </Grupo>
      )}
    </>
  );
}

// ── Avanzado ─────────────────────────────────────────────────────────────────

function Avanzado({ w, c, metodo, cambiar, dominios }: {
  w: WidgetDisponible;
  c: ConfigConstructor;
  metodo: MetodoIntegracion;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  dominios: ReactNode;
}) {
  const porDefecto = `web-${w.id}`;
  const valor = c.etiqueta ?? porDefecto;
  const invalida = c.etiqueta !== null && c.etiqueta !== '' && !ETIQUETA_VALIDA.test(c.etiqueta);
  return (
    <>
      {metodo === 'nativa' && (
        <Grupo titulo="Dominios autorizados">{dominios}</Grupo>
      )}
      <Grupo titulo="Seguimiento">
        <AjusteInterruptor
          etiqueta="Etiqueta de seguimiento"
          descripcion="Separa las visitas y reservas de este widget en «Cómo le va a tu página», y la ficha de cada alumna nueva dice por dónde llegó."
          on={c.etiqueta !== ''}
          onChange={v => cambiar({ etiqueta: v ? null : '' })}
        />
        {c.etiqueta !== '' && (
          <Ajuste etiqueta="Nombre de la etiqueta" descripcion="Letras, números y guiones. Cámbiala si pegas el mismo widget en dos sitios, p. ej. «insta-bio».">
            <input
              aria-label="Nombre de la etiqueta"
              aria-invalid={invalida || undefined}
              value={valor}
              maxLength={40}
              onChange={e => cambiar({ etiqueta: e.target.value === porDefecto ? null : e.target.value })}
              className={cn(inputCls, 'font-mono', invalida && 'border-destructive')}
            />
            {invalida && <p role="alert" className="mt-1.5 text-[12px] text-destructive">Solo letras, números, «-» y «_». Mientras tanto no se usa.</p>}
          </Ajuste>
        )}
      </Grupo>
      {(metodo === 'iframe') && (
        <Grupo titulo="Carga">
          <AjusteInterruptor
            etiqueta="Carga diferida"
            descripcion="No carga hasta que tu visitante baja hasta él. Tu web abre más rápido; déjala encendida salvo que el widget esté arriba del todo."
            on={c.cargaDiferida}
            onChange={v => cambiar({ cargaDiferida: v })}
          />
        </Grupo>
      )}
    </>
  );
}

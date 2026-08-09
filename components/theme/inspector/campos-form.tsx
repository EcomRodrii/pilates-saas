'use client';

import { useRef, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import {
  agruparCampos, validarCampo,
  type CampoSchema, type CampoSchemaSinLista,
} from '@/lib/theme/campos';
import { alternarMarca, insertarEnlace } from '@/lib/theme/texto-rico';

// El Inspector: pinta CUALQUIER schema de campos, sin saber de qué bloque es.
//
// Sustituye a los siete formularios escritos a mano de portal-bloques-editor
// (`ConfigBanner`…`ConfigTestimonios`) y al `EstiloForm`. Añadir un campo a un
// bloque pasa a ser una entrada en un array — cero JSX.
//
// Los controles NO son nuevos: son exactamente los mismos que ya usaba el
// editor (mismas clases, mismos tamaños, mismo `type="color"` al lado del hex,
// misma fila de botones para los enums). Lo único que cambia es quién decide
// cuál pintar: antes el programador escribiendo JSX, ahora el schema.
//
// Los tres repetidores que estaban duplicados a mano —preguntas de FAQ,
// imágenes de galería, testimonios— colapsan en un solo `ListaCampo`. Eran el
// mismo componente escrito tres veces con otro nombre de campo.

const inputCls = 'w-full text-[13px] px-3 py-2 rounded-xl border border-border bg-background';
const labelCls = 'text-[11.5px] font-semibold text-muted-foreground block mb-1';

type Valores = Record<string, unknown>;

/** Un color que puede estar vacío = "hereda del tema". */
function ColorHeredado({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void }) {
  const hexValido = !!value && /^#([0-9a-fA-F]{6})$/.test(value);
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="Del tema"
          className="w-24 text-[12px] font-mono px-2 py-1.5 rounded-lg border border-border bg-background"
          aria-label={label}
        />
        <input
          type="color"
          value={hexValido ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded-lg border border-border cursor-pointer bg-transparent"
          aria-label={`Selector de ${label}`}
        />
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-[11px] text-muted-foreground hover:text-destructive" aria-label={`Quitar ${label}`}>
            <Trash2 size={13} />
          </button>
        )}
      </span>
    </label>
  );
}


/**
 * Un número que puede estar vacío = "hereda". Hermano de `ColorHeredado`.
 *
 * ⚠️ La casilla vacía tiene que poder EXISTIR: un `<input type="number">` al
 * que se le borra el contenido da `''`, y convertirlo a 0 —o al valor por
 * defecto— destruiría la herencia sin que nadie lo pidiera. Por eso `''` se
 * traduce a `null` explícitamente, y el marcador dice qué se hereda.
 */
function NumeroHeredado({
  label, value, min, max, paso, marcador, onChange,
}: {
  label: string; value: number | null | undefined;
  min?: number; max?: number; paso?: number; marcador?: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] font-medium text-foreground">{label}</span>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={paso}
        placeholder={marcador ?? 'Del tema'}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-24 text-[12px] px-2 py-1.5 rounded-lg border border-border bg-background"
        aria-label={label}
      />
    </label>
  );
}

/**
 * Texto con negrita, cursiva y enlace.
 *
 * Es un `textarea` con tres botones, no un editor WYSIWYG con
 * `contentEditable`. Dos motivos, y el primero pesa más:
 *
 * 1. Lo que se guarda NO es HTML (ver `lib/theme/texto-rico.ts`), así que no
 *    hay nada que un editor visual pueda producir que este control no pueda.
 *    Un `contentEditable` obligaría a convertir DOM → modelo en cada tecla, y
 *    ahí es donde viven los bugs de los editores de texto.
 * 2. `document.execCommand`, que es lo que usan casi todos los WYSIWYG
 *    pequeños, está obsoleto.
 *
 * La propietaria ve las marcas mientras escribe (`**negrita**`). Es asumible
 * porque la vista previa del editor enseña el resultado real al lado, en el
 * móvil: no hay que imaginárselo.
 */
function CampoTextoRico({
  campo, valor, onChange,
}: { campo: Extract<CampoSchema, { tipo: 'textoRico' }>; valor: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function aplicar(fn: (t: string, d: number, h: number) => { texto: string; desde: number; hasta: number }) {
    const el = ref.current;
    if (!el) return;
    const r = fn(valor, el.selectionStart, el.selectionEnd);
    onChange(r.texto);
    // La selección se restaura DESPUÉS de que React repinte el valor: hacerlo
    // ahora la pisaría el propio render. Sin esto el cursor salta al final y
    // se pierde el sitio a la segunda palabra que se marca.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.desde, r.hasta);
    });
  }

  const btn = 'px-2 py-1 rounded-md border border-border text-[12px] text-foreground hover:bg-muted';
  return (
    <div>
      <div className="flex gap-1.5 mb-1.5">
        <button type="button" className={`${btn} font-bold`} onClick={() => aplicar((t, d, h) => alternarMarca(t, d, h, '**'))} title="Negrita">B</button>
        <button type="button" className={`${btn} italic`} onClick={() => aplicar((t, d, h) => alternarMarca(t, d, h, '*'))} title="Cursiva">i</button>
        <button type="button" className={btn} onClick={() => aplicar(insertarEnlace)} title="Enlace">Enlace</button>
      </div>
      <textarea
        ref={ref}
        className={`${inputCls} ${campo.filas === 2 ? 'min-h-14' : 'min-h-20'}`}
        value={valor}
        placeholder={campo.marcador}
        onChange={(e) => onChange(e.target.value)}
        aria-label={campo.etiqueta}
      />
    </div>
  );
}

/**
 * Fila de botones para los campos de enum.
 *
 * Exportada porque el panel de "Logo y favicon" —escrito a mano, no derivado
 * de un schema— necesita exactamente este control para el encuadre de la foto.
 * Copiarlo habría sido la cuarta versión del mismo grupo de botones.
 */
export function FilaOpciones({
  etiqueta, opciones, activa, onElegir,
}: { etiqueta: string; opciones: readonly { id: string; label: string }[]; activa: string; onElegir: (id: string) => void }) {
  return (
    <div>
      <span className="text-[12.5px] font-medium text-foreground block mb-1.5">{etiqueta}</span>
      <div className="flex gap-2 flex-wrap">
        {opciones.map((op) => (
          <button
            key={op.id}
            type="button"
            onClick={() => onElegir(op.id)}
            // Sin `aria-pressed`, cuál está elegida se transmite SOLO por
            // color: un lector de pantalla lee tres botones idénticos y quien
            // no distinga el contraste tampoco lo ve.
            aria-pressed={activa === op.id}
            className={`flex-1 text-[12px] font-semibold py-1.5 px-2 rounded-lg border transition-colors ${
              activa === op.id ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-foreground'
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Un repetidor. Los elementos se pintan con los mismos controles que un campo
 * suelto, pero **sin etiqueta**: dentro de una lista el marcador ya dice qué
 * es cada casilla, y repetir "Pregunta" encima de cada input llenaría el panel
 * de ruido. Es exactamente lo que hacían los tres formularios de antes.
 */
function ListaCampo({
  campo, valor, onChange,
}: { campo: Extract<CampoSchema, { tipo: 'lista' }>; valor: Valores[]; onChange: (v: Valores[]) => void }) {
  function setElemento(i: number, id: string, v: unknown) {
    onChange(valor.map((el, idx) => (idx === i ? { ...el, [id]: v } : el)));
  }
  function nuevoElemento(): Valores {
    return Object.fromEntries(campo.campos.map((c) => [c.id, c.porDefecto]));
  }
  return (
    <div className="space-y-2">
      {valor.map((el, i) => (
        <div key={i} className="space-y-1 border-l-2 border-border pl-2.5">
          {campo.campos.map((sub) => (
            <CampoControl
              key={sub.id}
              campo={sub}
              valor={el[sub.id]}
              sinEtiqueta
              onChange={(v) => setElemento(i, sub.id, v)}
            />
          ))}
          <button
            onClick={() => onChange(valor.filter((_, idx) => idx !== i))}
            className="text-[11.5px] font-semibold text-destructive"
          >
            Quitar {campo.etiquetaElemento}
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...valor, nuevoElemento()])}
        className="text-[12px] font-semibold text-brand-medio"
      >
        + Añadir {campo.etiquetaElemento}
      </button>
    </div>
  );
}

/** UN campo. El único `switch` por tipo de todo el editor. */
function CampoControl({
  campo, valor, onChange, sinEtiqueta,
}: { campo: CampoSchema | CampoSchemaSinLista; valor: unknown; onChange: (v: unknown) => void; sinEtiqueta?: boolean }) {
  const error = validarCampo(campo as CampoSchema, valor);
  const etiqueta = sinEtiqueta ? null : <span className={labelCls}>{campo.etiqueta}</span>;
  const ayuda = campo.ayuda ? <span className="text-[11px] text-muted-foreground block mt-1">{campo.ayuda}</span> : null;
  // El aviso es informativo, nunca bloquea el guardado: a medio teclear casi
  // nada valida, y perder lo escrito por eso sería peor que el error.
  const aviso = error ? <span className="text-[11px] text-destructive block mt-1">{error}</span> : null;

  function envoltorio(control: React.ReactNode) {
    return <div>{etiqueta}{control}{ayuda}{aviso}</div>;
  }

  switch (campo.tipo) {
    case 'textoRico':
      return envoltorio(<CampoTextoRico campo={campo} valor={(valor as string) ?? ''} onChange={onChange} />);

    case 'textoLargo':
      return envoltorio(
        <textarea
          // Las clases de Tailwind NO pueden construirse por interpolación:
          // el JIT escanea el fuente y `min-h-${x}` no existe como literal, así
          // que no genera la regla. Van las dos escritas enteras.
          className={`${inputCls} ${campo.filas === 2 ? 'min-h-14' : 'min-h-20'}`}
          value={(valor as string) ?? ''}
          placeholder={campo.marcador}
          onChange={(e) => onChange(e.target.value)}
          aria-label={campo.etiqueta}
        />,
      );
    case 'texto':
    case 'url':
    case 'imagen':
      return envoltorio(
        <input
          className={inputCls}
          value={(valor as string) ?? ''}
          placeholder={campo.marcador}
          onChange={(e) => onChange(e.target.value)}
          aria-label={campo.etiqueta}
        />,
      );
    case 'color':
      return envoltorio(
        <input
          type="color"
          className="w-10 h-9 rounded-lg border border-border cursor-pointer bg-transparent"
          value={(valor as string) ?? '#000000'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={campo.etiqueta}
        />,
      );
    case 'colorHeredado':
      // Lleva su etiqueta dentro (va en la misma fila que el control), así que
      // no pasa por `envoltorio`.
      return <ColorHeredado label={campo.etiqueta} value={valor as string | null} onChange={onChange} />;
    case 'numeroHeredado':
      return (
        <NumeroHeredado
          label={campo.etiqueta}
          value={valor as number | null}
          min={campo.min}
          max={campo.max}
          paso={campo.paso}
          marcador={campo.marcadorHeredado}
          onChange={onChange}
        />
      );
    case 'opciones':
      return <FilaOpciones etiqueta={campo.etiqueta} opciones={campo.opciones} activa={(valor as string) ?? campo.porDefecto} onElegir={onChange} />;
    case 'select':
      return envoltorio(
        <select className={inputCls} value={(valor as string) ?? campo.porDefecto} onChange={(e) => onChange(e.target.value)} aria-label={campo.etiqueta}>
          {campo.opciones.map((op) => <option key={op.id} value={op.id}>{op.label}</option>)}
        </select>,
      );
    case 'booleano':
      return (
        <label className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] font-medium text-foreground">{campo.etiqueta}</span>
          <input type="checkbox" checked={valor === true} onChange={(e) => onChange(e.target.checked)} aria-label={campo.etiqueta} />
        </label>
      );
    case 'numero':
      return envoltorio(
        <input
          type="number"
          className={inputCls}
          value={typeof valor === 'number' ? valor : campo.porDefecto}
          min={campo.min}
          max={campo.max}
          step={campo.paso}
          onChange={(e) => onChange(e.target.value === '' ? campo.porDefecto : Number(e.target.value))}
          aria-label={campo.etiqueta}
        />,
      );
    case 'lista':
      return (
        <div>
          {etiqueta}
          <ListaCampo campo={campo} valor={Array.isArray(valor) ? (valor as Valores[]) : []} onChange={onChange} />
        </div>
      );
  }
}

/**
 * El panel entero de un schema. `agruparCampos` aplica los `visibleSi` y
 * esconde los `obsoleto`, así que un campo retirado deja de pintarse **sin
 * que su valor guardado desaparezca**.
 */
export function CamposForm({
  campos, valores, valoresCondicion, onChange, etiquetaListaSinTitulo,
}: {
  campos: readonly CampoSchema[];
  valores: Valores;
  /**
   * Contra qué se evalúan los `visibleSi`. Ausente = contra `valores`, que es
   * lo normal. Se pasa aparte cuando el panel EDITA una cosa y la condición
   * depende de OTRA: el estilo de un banner se guarda en `estilo`, pero que su
   * color de fondo sirva o no depende de si hay foto, que vive en `config`.
   * Sin esta separación, esa condición sería inexpresable.
   */
  valoresCondicion?: Valores;
  /**
   * `campoId` dice QUÉ campo se tocó. El historial lo usa para fundir
   * pulsaciones seguidas sobre el mismo campo en un solo paso — sin él,
   * escribir un título serían doce pasos de deshacer.
   */
  onChange: (v: Valores, campoId: string) => void;
  /** Oculta la etiqueta de un campo `lista` que ya se explica por su bloque. */
  etiquetaListaSinTitulo?: boolean;
}) {
  const { sueltos, grupos } = agruparCampos(campos, valoresCondicion ?? valores);
  const control = (campo: CampoSchema) => (
    <CampoControl
      key={campo.id}
      campo={campo}
      valor={valores[campo.id]}
      sinEtiqueta={etiquetaListaSinTitulo && campo.tipo === 'lista'}
      onChange={(v) => onChange({ ...valores, [campo.id]: v }, campo.id)}
    />
  );
  return (
    <div className="space-y-2">
      {sueltos.map(control)}
      {grupos.map((g, i) => (
        // La primera abierta y el resto plegadas: la sección de arriba es lo
        // que la propietaria viene a tocar, y las de abajo son estados que
        // solo se dan de uno en uno (sin clases / con próxima clase / bono
        // acabándose…). Abrirlas todas devolvería el muro que esto arregla.
        <Seccion key={g.titulo} titulo={g.titulo} abiertaAlEmpezar={i === 0}>
          {g.campos.map(control)}
        </Seccion>
      ))}
    </div>
  );
}

function Seccion({ titulo, abiertaAlEmpezar, children }: {
  titulo: string; abiertaAlEmpezar: boolean; children: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(abiertaAlEmpezar);
  return (
    <section className="border-t border-border pt-2 mt-1 first:border-t-0 first:mt-0">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="w-full flex items-center justify-between gap-2 py-1.5 text-left"
      >
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</span>
        <ChevronDown size={14} className={`text-muted-foreground transition-transform ${abierta ? 'rotate-180' : ''}`} />
      </button>
      {abierta && <div className="space-y-2 pb-1">{children}</div>}
    </section>
  );
}

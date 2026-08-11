'use client';

import { useRef, useState } from 'react';
import { Check, Eye, Send, Loader2, X, ChevronDown } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { cn } from '@/lib/utils';
import { FUENTES_EMAIL, type FuenteEmail, type PlantillaEmail, type TipoPlantillaEmail } from '@/lib/types';
import { inputCls, btnPrimary, btnSecondary, cardCls, Field, Toggle } from '@/app/(dashboard)/configuracion/page';
import { previsualizarPlantilla, enviarPruebaPlantilla } from '@/lib/api-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ─── Plantillas de email transaccional ───────────────────────────────────────
//
// Dos niveles a propósito. Arriba, lo que casi siempre se quiere cambiar:
// el asunto y la frase de apertura, con el diseño del producto intacto. Debajo,
// plegado, el modo en el que la propietaria escribe el correo entero y le pone
// su marca. Enseñar las dos cosas a la vez convertiría un cambio de una frase
// en un formulario de doce campos.

const PLANTILLAS_META: {
  tipo: TipoPlantillaEmail; label: string; descripcion: string;
  asuntoDefault: string; introDefault: string; variables: string[];
  // Qué pinta {datos} en esta plantilla y si tiene botón — así el token no es
  // una incógnita antes de darle a la vista previa.
  queSonLosDatos: string; tieneBoton?: string;
}[] = [
  {
    tipo: 'bienvenida', label: 'Bienvenida', descripcion: 'Al dar de alta a una clienta.',
    asuntoDefault: '¡Bienvenida a {estudio}!',
    introDefault: 'Hola {nombre}, estamos encantadas de tenerte en {estudio}.',
    variables: ['{nombre}', '{estudio}'],
    queSonLosDatos: 'su plan contratado',
    tieneBoton: 'el acceso directo a su portal',
  },
  {
    tipo: 'reserva', label: 'Reserva confirmada', descripcion: 'Cuando una clienta reserva una clase.',
    asuntoDefault: 'Reserva confirmada — {clase}',
    introDefault: 'Hola {nombre}, tu plaza está reservada.',
    variables: ['{nombre}', '{clase}'],
    queSonLosDatos: 'fecha, hora, sala e instructora',
  },
  {
    tipo: 'recordatorio', label: 'Recordatorio de clase', descripcion: 'Aviso antes de la clase.',
    asuntoDefault: 'Recordatorio — {clase}',
    introDefault: 'Hola {nombre}, te esperamos en tu próxima clase. Aquí tienes los detalles.',
    variables: ['{nombre}', '{clase}'],
    queSonLosDatos: 'fecha, hora, sala e instructora',
  },
  {
    tipo: 'cancelacion', label: 'Clase cancelada', descripcion: 'Cuando el estudio cancela una clase.',
    asuntoDefault: 'Clase cancelada — {clase}',
    introDefault: 'Hola {nombre}, lamentamos avisarte de que esta clase ha sido cancelada. No hace falta que te presentes.',
    variables: ['{nombre}', '{clase}'],
    queSonLosDatos: 'fecha, hora, sala e instructora',
  },
  {
    tipo: 'promocion', label: 'Plaza liberada (lista de espera)', descripcion: 'Al ascender a una clienta de la lista de espera.',
    asuntoDefault: 'Se ha liberado tu plaza — {clase}',
    introDefault: 'Hola {nombre}, estabas en lista de espera y ha quedado una plaza libre.',
    variables: ['{nombre}', '{clase}'],
    queSonLosDatos: 'fecha, hora, sala e instructora',
  },
  {
    tipo: 'impago', label: 'Pago fallido', descripcion: 'Cuando un cobro automático no se completa. De las que más importan: la lee alguien a quien le acaban de fallar un cobro.',
    asuntoDefault: 'Problema con tu pago — {estudio}',
    introDefault: 'Hola {nombre}, hemos intentado cobrar tu cuota y el pago no se ha completado.',
    variables: ['{nombre}', '{estudio}'],
    queSonLosDatos: 'el concepto y el importe',
  },
];

// Punto de partida del modo "escribir el correo entero": la estructura que ya
// tenía el email, pero escrita. Empezar con un cuadro en blanco delante hace
// que casi nadie lo use; empezar con esto se edita en veinte segundos.
function cuerpoDePartida(meta: (typeof PLANTILLAS_META)[number], intro: string): string {
  const apertura = intro.trim() || meta.introDefault;
  const partes = [`# ${meta.label}`, '', apertura, '', '{datos}'];
  if (meta.tieneBoton) partes.push('', '{boton}');
  return partes.join('\n');
}

type Borrador = {
  asunto: string; intro: string; cuerpo: string; botonTexto: string;
  colorCabecera: string; colorBoton: string; logoUrl: string; pie: string; fuente: string;
};

function borradorDe(p: PlantillaEmail | undefined): Borrador {
  return {
    asunto: p?.asunto ?? '', intro: p?.intro ?? '', cuerpo: p?.cuerpo ?? '',
    botonTexto: p?.botonTexto ?? '', colorCabecera: p?.colorCabecera ?? '',
    colorBoton: p?.colorBoton ?? '', logoUrl: p?.logoUrl ?? '',
    pie: p?.pie ?? '', fuente: p?.fuente ?? '',
  };
}

function PlantillaCard({
  meta, plantilla, onSave, showToast,
}: {
  meta: (typeof PLANTILLAS_META)[number];
  plantilla: PlantillaEmail | undefined;
  onSave: (changes: Partial<PlantillaEmail>) => void;
  showToast: (m: string) => void;
}) {
  const [b, setB] = useState<Borrador>(() => borradorDe(plantilla));
  const activa = plantilla?.activa ?? true;
  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB(prev => ({ ...prev, [k]: v }));

  // Re-sincroniza si cambian los datos cargados (p. ej. tras la carga diferida).
  //
  // Ajuste en render, no efecto: con efecto el formulario se pintaba una vez
  // con los valores viejos (o vacíos) y se corregía en un segundo render, que
  // es exactamente el parpadeo que se veía al entrar en Plantillas antes de que
  // terminara la carga diferida.
  const claveCargada = JSON.stringify(borradorDe(plantilla));
  const [clavePrevia, setClavePrevia] = useState(claveCargada);
  if (claveCargada !== clavePrevia) {
    setClavePrevia(claveCargada);
    setB(borradorDe(plantilla));
  }

  const cuerpoLibre = b.cuerpo.trim() !== '';
  const [marcaAbierta, setMarcaAbierta] = useState(false);
  const areaCuerpo = useRef<HTMLTextAreaElement>(null);

  const [preview, setPreview] = useState<{ html: string; subject: string } | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [enviandoPrueba, setEnviandoPrueba] = useState(false);

  // Lo que se manda a previsualizar/probar/guardar: cadena vacía → null, que es
  // como se dice "esta casilla no la toco, usa lo de siempre".
  const oNulo = (v: string) => (v.trim() ? v.trim() : null);
  // El <select> devuelve string; la columna solo admite la lista cerrada (hay
  // un CHECK en la BD). Se valida aquí en vez de castear: si algún día se
  // quita una fuente de la lista, un valor viejo cae a null en vez de que el
  // guardado reviente contra el CHECK.
  const fuenteValida = (v: string): FuenteEmail | null =>
    (FUENTES_EMAIL as readonly string[]).includes(v.trim()) ? (v.trim() as FuenteEmail) : null;
  const comoBorrador = () => ({
    tipo: meta.tipo,
    asunto: oNulo(b.asunto), intro: oNulo(b.intro), cuerpo: oNulo(b.cuerpo),
    botonTexto: oNulo(b.botonTexto), colorCabecera: oNulo(b.colorCabecera),
    colorBoton: oNulo(b.colorBoton), logoUrl: oNulo(b.logoUrl),
    pie: oNulo(b.pie), fuente: fuenteValida(b.fuente),
  });

  // Inserta un token donde esté el cursor, no al final: si no, colocar {datos}
  // en medio del texto obliga a cortar y pegar a mano.
  function insertarToken(token: string) {
    const area = areaCuerpo.current;
    if (!area) { set('cuerpo', `${b.cuerpo}\n\n${token}`); return; }
    const { selectionStart: ini, selectionEnd: fin } = area;
    const nuevo = `${b.cuerpo.slice(0, ini)}${token}${b.cuerpo.slice(fin)}`;
    set('cuerpo', nuevo);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(ini + token.length, ini + token.length);
    });
  }

  async function abrirPreview() {
    setCargandoPreview(true);
    const r = await previsualizarPlantilla(comoBorrador());
    setCargandoPreview(false);
    if ('error' in r) { showToast(r.error); return; }
    setPreview(r);
  }

  async function enviarPrueba() {
    setEnviandoPrueba(true);
    const r = await enviarPruebaPlantilla(comoBorrador());
    setEnviandoPrueba(false);
    showToast('error' in r ? r.error : `Prueba enviada a ${r.enviadoA}`);
  }

  return (
    <div className={cn(cardCls, 'p-6')}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground">{meta.label}</h3>
          <p className="text-[12px] text-muted-foreground">{meta.descripcion}</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer shrink-0" title="Personalización activa">
          <span className="text-[11px] text-muted-foreground">{activa ? 'Personalizado' : 'Por defecto'}</span>
          <Toggle on={activa} onChange={v => onSave({ activa: v })} />
        </label>
      </div>

      <div className="space-y-4">
        <Field label="Asunto" description="Lo primero que ve la clienta en su bandeja. Directo y sin mayúsculas sostenidas.">
          <input className={inputCls} placeholder={meta.asuntoDefault}
            value={b.asunto} onChange={e => set('asunto', e.target.value)} />
        </Field>

        {!cuerpoLibre ? (
          <>
            <Field label="Texto de introducción" description="Abre el email, antes de los datos concretos. Los detalles se añaden solos debajo.">
              <textarea className={cn(inputCls, 'resize-none')} rows={3} placeholder={meta.introDefault}
                value={b.intro} onChange={e => set('intro', e.target.value)} />
            </Field>
            <button
              type="button"
              onClick={() => set('cuerpo', cuerpoDePartida(meta, b.intro))}
              className="text-[12px] font-medium text-foreground underline underline-offset-2"
            >
              Escribir el correo entero →
            </button>
          </>
        ) : (
          <>
            <Field
              label="Cuerpo del correo"
              description="Escribes tú el correo completo. Admite **negrita**, _cursiva_, listas con guiones, ## títulos y [enlaces](https://…)."
            >
              <textarea
                ref={areaCuerpo}
                className={cn(inputCls, 'font-mono text-[12px] leading-relaxed')}
                rows={12}
                value={b.cuerpo}
                onChange={e => set('cuerpo', e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Insertar:</span>
              <button type="button" onClick={() => insertarToken('{datos}')}
                className="text-[11px] rounded-full border border-border px-2.5 py-1 hover:border-foreground">
                {'{datos}'} — {meta.queSonLosDatos}
              </button>
              {meta.tieneBoton && (
                <button type="button" onClick={() => insertarToken('{boton}')}
                  className="text-[11px] rounded-full border border-border px-2.5 py-1 hover:border-foreground">
                  {'{boton}'} — {meta.tieneBoton}
                </button>
              )}
              {meta.variables.map(v => (
                <button key={v} type="button" onClick={() => insertarToken(v)}
                  className="text-[11px] rounded-full border border-border px-2.5 py-1 hover:border-foreground">
                  {v}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Si quitas <code className="bg-muted rounded px-1">{'{datos}'}</code>, el correo sale sin {meta.queSonLosDatos}.
              Borra todo el cuerpo para volver al diseño de siempre.
            </p>
          </>
        )}

        <button
          type="button"
          onClick={() => setMarcaAbierta(v => !v)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-foreground"
        >
          <ChevronDown size={14} className={cn('transition-transform', marcaAbierta && 'rotate-180')} />
          Marca de este correo
        </button>

        {marcaAbierta && (
          <div className="space-y-4 rounded-xl border border-border p-4">
            <p className="text-[11px] text-muted-foreground">
              Vacío = se usa la marca del estudio. El color del texto del botón se calcula solo
              para que se lea sobre el fondo que elijas.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Color de la banda" description="La franja de arriba del correo.">
                <input type="color" className={cn(inputCls, 'h-10 p-1')}
                  value={b.colorCabecera || '#343825'}
                  onChange={e => set('colorCabecera', e.target.value)} />
              </Field>
              <Field
                label="Color del botón"
                description={b.colorBoton
                  ? 'Solo si el correo lleva botón.'
                  : 'Sigue al color de la banda. Cámbialo aquí solo si lo quieres distinto.'}
              >
                {/* El valor que se enseña es el que va a salir de verdad: si no
                    lo ha fijado, hereda de la banda. Enseñar aquí el oliva del
                    estudio mientras el correo pinta el botón marrón sería
                    mentirle al control. */}
                <input type="color" className={cn(inputCls, 'h-10 p-1')}
                  value={b.colorBoton || b.colorCabecera || '#343825'}
                  onChange={e => set('colorBoton', e.target.value)} />
              </Field>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { set('colorCabecera', ''); set('colorBoton', ''); }}
                className="text-[11px] text-muted-foreground underline underline-offset-2">
                Volver a los colores del estudio
              </button>
            </div>
            <Field label="Texto del botón" description="Solo si el correo lleva botón.">
              <input className={inputCls} placeholder="El de siempre"
                value={b.botonTexto} onChange={e => set('botonTexto', e.target.value)} />
            </Field>
            <Field label="Logo para este correo" description="URL de una imagen PNG o JPG. Vacío = el logo del estudio.">
              <input className={inputCls} placeholder="https://…"
                value={b.logoUrl} onChange={e => set('logoUrl', e.target.value)} />
            </Field>
            <Field label="Tipografía" description="Solo fuentes que los clientes de correo saben pintar.">
              <select className={inputCls} value={b.fuente} onChange={e => set('fuente', e.target.value)}>
                <option value="">Plus Jakarta Sans (la del estudio)</option>
                {FUENTES_EMAIL.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Pie del correo" description="Vacío = «Enviado por tu estudio · Powered by Tentare · año».">
              <input className={inputCls} placeholder="Enviado por {estudio} · Powered by Tentare"
                value={b.pie} onChange={e => set('pie', e.target.value)} />
            </Field>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Variables: {meta.variables.map(v => <code key={v} className="bg-muted rounded px-1 py-0.5 mx-0.5">{v}</code>)}
          . Deja un campo vacío para usar el texto por defecto.
        </p>

        <div className="flex items-center justify-end gap-2">
          <button onClick={abrirPreview} disabled={cargandoPreview} className={cn(btnSecondary, 'disabled:opacity-50')}>
            {cargandoPreview ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Vista previa
          </button>
          <button onClick={enviarPrueba} disabled={enviandoPrueba} className={cn(btnSecondary, 'disabled:opacity-50')}>
            {enviandoPrueba ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviarme una prueba
          </button>
          <button onClick={() => { const { tipo: _t, ...campos } = comoBorrador(); onSave(campos); }} className={btnPrimary}>
            <Check size={14} /> Guardar
          </button>
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vista previa — {meta.label}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                Asunto: <span className="font-medium text-foreground">{preview.subject}</span>
              </p>
              <div className="rounded-xl border border-border overflow-hidden bg-white">
                {/* sandbox="" a propósito: el cuerpo lo escribe la propietaria y
                    aunque se sanea al renderizar, esta caja nunca ejecuta nada. */}
                <iframe
                  title={`Vista previa de ${meta.label}`}
                  srcDoc={preview.html}
                  sandbox=""
                  className="w-full h-[420px]"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Con datos de muestra (Ana García, Reformer Iniciación) — así se ve sin esperar a una clienta real.
              </p>
              <button onClick={() => setPreview(null)} className={cn(btnSecondary, 'w-full justify-center')}>
                <X size={14} /> Cerrar
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function TabPlantillasEmail({ showToast }: { showToast: (m: string) => void }) {
  const { plantillasEmail, upsertPlantillaEmail } = useStudio();
  return (
    <div className="space-y-5 max-w-2xl">
      <p className="text-[12px] text-muted-foreground">
        Personaliza los emails automáticos a tus clientas: el asunto y la apertura, o el correo entero
        con tu propia marca. Los emails de recibo/factura no se editan por su contenido fiscal.
      </p>
      {PLANTILLAS_META.map(meta => (
        <PlantillaCard
          key={meta.tipo}
          meta={meta}
          plantilla={plantillasEmail.find(p => p.tipo === meta.tipo)}
          onSave={async changes => {
            const res = await upsertPlantillaEmail(meta.tipo, changes);
            showToast(res.ok ? 'Plantilla guardada' : res.error);
          }}
          showToast={showToast}
        />
      ))}
    </div>
  );
}

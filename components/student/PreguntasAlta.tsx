'use client';

import { useId, useState } from 'react';
import { useEstudio } from '@/components/student/contexto';
import { StudioHeader } from '@/components/student/shell/StudioHeader';
import { Opcion } from '@/components/student/valoracion/Opcion';
import { Button } from '@/components/student/ui/Button';
import { useOnline } from '@/lib/student/useOnline';
import { guardarPreguntasAlta, type EstadoPreguntasAltaRemoto } from '@/lib/student/preguntas-alta';
import { MAX_TEXTO, validarRespuestas, type PreguntaAlta, type ValorRespuesta } from '@/lib/preguntas-alta';

/**
 * Las preguntas del estudio, antes de dejarla usar la app.
 *
 * Una sola pantalla con todas, no un asistente de una en una: son las
 * «Datos extra» del estudio —dos o tres, cortas— y verlas todas de golpe le
 * dice cuánto le falta. Las opciones son tarjetas que se tocan, igual que en la
 * valoración inicial (un `<select>` en el móvil abre la rueda nativa y tapa la
 * pregunta).
 *
 * Se valida aquí con la MISMA función que el servidor (`validarRespuestas`),
 * para marcar lo que falta sin ir y volver; pero quien decide es el servidor, y
 * su respuesta es lo que manda.
 */
export function PreguntasAlta({ estado, onCompletada }: {
  estado: EstadoPreguntasAltaRemoto;
  onCompletada: (nuevo: EstadoPreguntasAltaRemoto) => void;
}) {
  const { estudio } = useEstudio();
  const { online } = useOnline();
  // Solo las que le faltan: las que ya contestó (p. ej. si el estudio añadió
  // una después) no se le vuelven a poner delante.
  const preguntas = estado.preguntas.filter(p => estado.pendientes.includes(p.id));
  const [valores, setValores] = useState<Record<string, ValorRespuesta>>(() => {
    const inicial: Record<string, ValorRespuesta> = {};
    for (const p of preguntas) inicial[p.id] = estado.respuestas[p.id] ?? null;
    return inicial;
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const poner = (id: string, v: ValorRespuesta) => {
    setValores(x => ({ ...x, [id]: v }));
    setErrores(({ [id]: _, ...resto }) => resto);
    setError('');
  };

  const enviar = async () => {
    if (guardando) return;
    const local = validarRespuestas(preguntas, valores);
    if (!local.ok) {
      setErrores(local.errores);
      setError('Revisa las preguntas marcadas.');
      return;
    }
    setGuardando(true);
    const r = await guardarPreguntasAlta(estudio.id, valores);
    setGuardando(false);
    if (!r.ok) {
      // El estudio las ha apagado mientras contestaba: nada que pedirle ya.
      if (r.apagada) { onCompletada({ ...estado, activa: false, pendientes: [] }); return; }
      setErrores(r.errores ?? {});
      setError(r.error);
      return;
    }
    onCompletada(r.estado);
  };

  return (
    <div className="shell">
      <StudioHeader />
      <main className="page" style={{ paddingBottom: 'calc(var(--s-6) + var(--safe-bottom))' }}>
        <form
          className="px stack a-up"
          data-testid="preguntas-alta"
          style={{ ['--gap' as string]: 'var(--s-5)', marginTop: 18, maxWidth: 520 }}
          onSubmit={(e) => { e.preventDefault(); void enviar(); }}
          noValidate
        >
          <div>
            <h1 className="t-h1">Antes de empezar</h1>
            <p className="t-body t-dim" style={{ marginTop: 8 }}>
              {estudio.nombre} necesita saber un poco más de ti. Solo te lo preguntamos una vez.
            </p>
          </div>

          {preguntas.map(p => (
            <Pregunta key={p.id} p={p} valor={valores[p.id] ?? null} error={errores[p.id]} onCambiar={v => poner(p.id, v)} />
          ))}

          {error && <p role="alert" className="note note--danger">{error}</p>}
          {!online && <p className="note note--warn">Necesitas conexión para guardar tus respuestas.</p>}
          <Button type="submit" full loading={guardando} disabled={!online}>Guardar y continuar</Button>
        </form>
      </main>
      <div id="student-portal-host" />
    </div>
  );
}

/** El enunciado, igual para todos los tipos. «(opcional)» solo donde lo es: lo normal es contestar. */
function Enunciado({ p }: { p: PreguntaAlta }) {
  return (
    <span style={{ display: 'block', fontSize: 'var(--t-body)', fontWeight: 800, lineHeight: 1.35, margin: '0 0 var(--s-2) 2px' }}>
      {p.etiqueta}
      {!p.requerido && <span className="t-meta" style={{ fontWeight: 600, marginLeft: 6 }}>(opcional)</span>}
    </span>
  );
}

function Pregunta({ p, valor, error, onCambiar }: {
  p: PreguntaAlta; valor: ValorRespuesta; error?: string; onCambiar: (v: ValorRespuesta) => void;
}) {
  const uid = useId();
  const idError = `${uid}-e`;

  if (p.tipo === 'seleccion' || p.tipo === 'booleano') {
    const opciones: { etiqueta: string; valor: ValorRespuesta }[] = p.tipo === 'booleano'
      ? [{ etiqueta: 'Sí', valor: true }, { etiqueta: 'No', valor: false }]
      : p.opciones.map(o => ({ etiqueta: o, valor: o }));
    return (
      <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} aria-describedby={error ? idError : undefined}>
        <legend style={{ padding: 0 }}><Enunciado p={p} /></legend>
        <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
          {opciones.map(o => (
            <Opcion
              key={String(o.valor)}
              seleccionada={valor === o.valor}
              // Tocar la elegida en una opcional la desmarca; en una obligatoria no
              // hay «ninguna» que elegir.
              onClick={() => onCambiar(valor === o.valor && !p.requerido ? null : o.valor)}
            >
              {o.etiqueta}
            </Opcion>
          ))}
        </div>
        {error && <p id={idError} role="alert" className="field-error">{error}</p>}
      </fieldset>
    );
  }

  return (
    <div>
      <label htmlFor={uid}><Enunciado p={p} /></label>
      <input
        id={uid}
        className="input"
        value={valor == null ? '' : String(valor)}
        type={p.tipo === 'fecha' ? 'date' : 'text'}
        inputMode={p.tipo === 'numero' ? 'decimal' : undefined}
        maxLength={p.tipo === 'texto' ? MAX_TEXTO : undefined}
        aria-required={p.requerido || undefined}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? idError : undefined}
        enterKeyHint="next"
        // El número se guarda como texto mientras escribe («1,» a medias) y lo
        // normaliza el servidor; convertirlo en cada tecla borraría la coma.
        onChange={(e) => onCambiar(e.target.value === '' ? null : e.target.value)}
      />
      {error && <p id={idError} role="alert" className="field-error">{error}</p>}
    </div>
  );
}

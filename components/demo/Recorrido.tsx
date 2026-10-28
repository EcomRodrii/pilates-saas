'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { capturarEvento } from '@/lib/posthog-cliente';
import type { DemoGenerada } from '@/lib/demo/modelo';
import { BloqueView } from './Bloques';

interface Props {
  demo: DemoGenerada;
  resumen: string | null;
  aclaracion: string | null;
  ejecutando: boolean;
  onTerminar: () => void;
  onReejecutar: () => void;
  onOtra: () => void;
}

// El recorrido paso a paso. Todo lo que se ve sale de la `DemoGenerada` que el
// servidor construyó y validó: aquí no se calcula ninguna regla.
export function Recorrido({ demo, resumen, aclaracion, ejecutando, onTerminar, onReejecutar, onOtra }: Props) {
  const [i, setI] = useState(0);
  const [config, setConfig] = useState(false);
  const [porQue, setPorQue] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const primera = useRef(true);
  const paso = demo.pasos[i];
  const ultimo = i === demo.pasos.length - 1;

  function ir(n: number) {
    setI(n);
    setConfig(false);
    setPorQue(false);
  }

  useEffect(() => {
    capturarEvento('demo_paso', { escenario: demo.escenario, n: i + 1 });
    // El foco va al título del paso: el cambio se anuncia y el teclado sigue donde toca.
    if (primera.current) { primera.current = false; return; }
    titulo.current?.focus();
  }, [i, demo.escenario]);

  return (
    <section aria-labelledby="dm-paso-titulo" style={{ display: 'grid', gap: 18 }} className="dm-entra" key={`${demo.escenario}-${i}`}>
      {i === 0 && (resumen || aclaracion) && (
        <div className="dm-aviso" role="note">
          {resumen && <p style={{ margin: 0 }}><strong>Esto es lo que he entendido: </strong>{resumen}</p>}
          {aclaracion && <p style={{ margin: resumen ? '8px 0 0' : 0 }}>{aclaracion}</p>}
        </div>
      )}
      <span className="dm-etiqueta-demo">Demostración con datos de ejemplo</span>
      <ol className="dm-puntos" aria-label="Pasos de la demo">
        {demo.pasos.map((p, n) => (
          <li key={p.id} data-hecho={n < i} aria-current={n === i ? 'step' : undefined}><span className="dm-solo-lectores">{p.titulo}</span></li>
        ))}
      </ol>
      <div>
        <p className="dm-paso-n">Paso {i + 1} de {demo.pasos.length}</p>
        <h2 id="dm-paso-titulo" ref={titulo} tabIndex={-1} className="dm-h1" style={{ fontSize: 'clamp(1.3rem, 1.1rem + 1vw, 1.7rem)' }}>{paso.titulo}</h2>
        <p className="dm-lead" style={{ marginTop: 6 }}>{paso.proposito}</p>
      </div>
      <div className="dm-escena" aria-label="Escena de ejemplo">
        {paso.bloques.map((b, n) => <BloqueView key={n} bloque={b} />)}
      </div>

      <div className="dm-acciones" role="group" aria-label="Más sobre este paso">
        {paso.configura && (
          <button type="button" className="dm-boton dm-boton-contorno" aria-expanded={config} onClick={() => setConfig((v) => !v)}>
            Ver cómo se configura
          </button>
        )}
        <button type="button" className="dm-boton dm-boton-contorno" aria-expanded={porQue} onClick={() => setPorQue((v) => !v)}>
          ¿Por qué ocurre esto?
        </button>
      </div>
      {config && paso.configura && (
        <div className="dm-extra dm-entra">
          <h3>Dónde se cambia en Tentare</h3>
          <ul>
            {paso.configura.map((c, n) => (
              <li key={n}><strong>{c.ajuste}</strong>: {c.valor}<span className="dm-fuente">{c.donde}</span></li>
            ))}
          </ul>
        </div>
      )}
      {porQue && (
        <div className="dm-extra dm-entra">
          <h3>La regla que lo decide</h3>
          <ul>
            {paso.porQue.map((r, n) => <li key={n}>{r.texto}<span className="dm-fuente">{r.fuente}</span></li>)}
          </ul>
        </div>
      )}

      {ultimo && (
        <div className="dm-extra dm-entra">
          <h3>Comprobaciones de esta demo</h3>
          <ul className="dm-comprobaciones">
            {demo.comprobaciones.map((c) => (
              <li key={c.id}>
                {c.ok ? <CheckCircle2 size={18} aria-hidden="true" color="var(--w-exito)" /> : <XCircle size={18} aria-hidden="true" color="var(--w-error)" />}
                <span><span className="dm-solo-lectores">{c.ok ? 'Correcta: ' : 'Falla: '}</span>{c.descripcion}</span>
              </li>
            ))}
          </ul>
          {demo.excepciones.length > 0 && (<><h3>Excepciones que conviene saber</h3><ul>{demo.excepciones.map((e, n) => <li key={n}>{e}</li>)}</ul></>)}
        </div>
      )}

      <div className="dm-acciones" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="dm-boton dm-boton-contorno" onClick={() => ir(Math.max(0, i - 1))} disabled={i === 0}>
          <ArrowLeft size={18} aria-hidden="true" /> Paso anterior
        </button>
        {ultimo ? (
          <button type="button" className="dm-boton dm-boton-primario" onClick={onTerminar}>Terminar la demo <ArrowRight size={18} aria-hidden="true" /></button>
        ) : (
          <button type="button" className="dm-boton dm-boton-primario" onClick={() => ir(i + 1)}>Siguiente paso <ArrowRight size={18} aria-hidden="true" /></button>
        )}
      </div>
      <div className="dm-acciones">
        <button type="button" className="dm-boton dm-boton-contorno" disabled={ejecutando} onClick={() => { ir(0); onReejecutar(); }}>
          <RotateCcw size={16} aria-hidden="true" /> Volver a ejecutar
        </button>
        <button type="button" className="dm-boton dm-boton-contorno" onClick={onOtra}>Empezar otra demo</button>
      </div>
    </section>
  );
}

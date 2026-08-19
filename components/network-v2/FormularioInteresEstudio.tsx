'use client';

import { useState, type FormEvent } from 'react';
import { CAMPO_TRAMPA } from '@/lib/auth/trampa-bots';
import { NW_TINTA, NW_MUTED, NW_BORDE, NW_PRODUCTO } from './tokens';

// Captación de demanda de estudio cuando la oferta de instructoras todavía
// es pequeña (brief puntos 16/17/19) — llama a /api/network/interes, que
// reusa `plataforma_lead` (ver el comentario de esa ruta). Un único
// componente para las dos variantes: `completo` (nombre de estudio + qué
// busca, para la sección dedicada de la landing) y compacto (solo email +
// ciudad, para el empty state de una búsqueda sin resultados) — la
// diferencia de origen la decide el servidor según qué campos llegaron, no
// esta prop.
export function FormularioInteresEstudio({
  variante = 'completo',
  ciudadSugerida,
}: {
  variante?: 'completo' | 'compacto';
  ciudadSugerida?: string;
}) {
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'ok' | 'error'>('idle');

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEstado('enviando');
    const datos = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/network/interes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(datos.entries())),
      });
      setEstado(res.ok ? 'ok' : 'error');
    } catch {
      setEstado('error');
    }
  }

  if (estado === 'ok') {
    return (
      <p className="text-[14.5px] font-semibold" style={{ color: NW_PRODUCTO }}>
        Recibido. Te avisaremos en cuanto haya perfiles que puedan encajar.
      </p>
    );
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl text-[14px] bg-white outline-none';
  const inputStyle = { border: `1px solid ${NW_BORDE}`, color: NW_TINTA };

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      {/* Honeypot: fuera de pantalla y sin tabulación, ver lib/auth/trampa-bots.ts */}
      <input
        type="text" name={CAMPO_TRAMPA} tabIndex={-1} autoComplete="off" aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />
      {variante === 'completo' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <input name="nombre" placeholder="Tu nombre" className={inputCls} style={inputStyle} />
          <input name="estudio" placeholder="Nombre del estudio" className={inputCls} style={inputStyle} />
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <input name="email" type="email" required placeholder="Tu email" className={inputCls} style={inputStyle} />
        <input name="ciudad" placeholder="Ciudad" defaultValue={ciudadSugerida} className={inputCls} style={inputStyle} />
      </div>
      {variante === 'completo' && (
        <textarea
          name="mensaje" rows={2} placeholder="¿Qué tipo de instructora necesitas? (especialidad, horario, sustitución puntual…)"
          className={inputCls} style={inputStyle}
        />
      )}
      <button
        type="submit"
        disabled={estado === 'enviando'}
        className="self-start px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white disabled:opacity-60"
        style={{ background: NW_TINTA }}
      >
        {estado === 'enviando' ? 'Enviando…' : 'Avisadme'}
      </button>
      {estado === 'error' && (
        <p className="text-[13px]" style={{ color: NW_MUTED }}>
          No se ha podido enviar. Escríbenos a hola@tentare.app.
        </p>
      )}
    </form>
  );
}

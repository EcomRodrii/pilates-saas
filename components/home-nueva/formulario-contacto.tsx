'use client';

import { useState } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { LEGAL } from '@/lib/legal-info';
import { CONTACTO } from './contenido';

// El formulario del diseño. No hay servidor detrás: al enviarlo se abre el correo de quien lo rellena con el mensaje ya escrito, dirigido
// al equipo (`mailto:`), y no se guarda nada en ningún sitio. Conectarlo a un endpoint propio (con su captcha y su trampa de bots, como el
// resto de formularios) es un paso aparte.
export function FormularioContacto() {
  const f = CONTACTO.formulario;
  const [enviado, setEnviado] = useState(false);
  return (
    <form
      className="lf-form"
      onSubmit={e => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        const v = (k: string) => String(d.get(k) ?? '').trim();
        const cuerpo = [`Nombre: ${v('nombre')}`, `Estudio: ${v('estudio')}`, `Correo: ${v('email')}`, `Tamaño del estudio: ${v('tamano')}`, '', v('mensaje')].join('\n');
        window.location.href = `mailto:${LEGAL.email}?subject=${encodeURIComponent('Quiero una demo de Tentare')}&body=${encodeURIComponent(cuerpo)}`;
        setEnviado(true);
      }}
      aria-labelledby="lf-form-t"
    >
      <h3 id="lf-form-t">{f.titulo}</h3>
      <div className="lf-form-fila">
        <label><span>{f.nombre.etiqueta}</span><input name="nombre" type="text" placeholder={f.nombre.marcador} autoComplete="name" /></label>
        <label><span>{f.estudio.etiqueta}</span><input name="estudio" type="text" placeholder={f.estudio.marcador} autoComplete="organization" /></label>
      </div>
      <div className="lf-form-fila">
        <label><span>{f.email.etiqueta}</span><input name="email" type="email" placeholder={f.email.marcador} autoComplete="email" /></label>
        <label className="lf-select">
          <span>{f.tamano.etiqueta}</span>
          <select name="tamano" defaultValue="">
            <option value="" disabled>{f.tamano.marcador}</option>
            {f.tamano.opciones.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
      </div>
      <label><span>{f.mensaje.etiqueta}</span><textarea name="mensaje" rows={4} placeholder={f.mensaje.marcador} /></label>
      <button type="submit" className="lf-boton lf-boton--claro">
        <span>{f.enviar}</span>
        <span className="lf-boton-flecha" aria-hidden="true"><ArrowUpRight size={18} strokeWidth={1.8} /></span>
      </button>
      <p className="lf-form-nota" role="status">{enviado ? f.aviso : f.nota}</p>
    </form>
  );
}

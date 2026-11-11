'use client';

import { useState } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { CONTACTO } from './contenido';

// El formulario del diseño. ⚠️ En la maqueta NO envía nada: enseña cómo queda y avisa. Conectarlo (a /api/public/… o al
// correo del equipo) es un paso aparte cuando se apruebe, con su captcha y su trampa de bots como el resto de formularios.
export function FormularioContacto() {
  const f = CONTACTO.formulario;
  const [enviado, setEnviado] = useState(false);
  return (
    <form
      className="lf-form"
      onSubmit={e => { e.preventDefault(); setEnviado(true); }}
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

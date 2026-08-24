'use client';

// Paso 02 del wizard: verificación de identidad (documento + dirección
// privada). Extraído tal cual de app/network/crear-perfil/page.tsx (paso
// === 1) — F0 del roadmap de Tentare Network 2.0, sin cambios de
// comportamiento. DropzoneDocumento/EstadoDocumento vienen de
// ../componentes (compartidos con PasoFormacion, que verifica otro
// documento distinto con el mismo patrón).
import { useId } from 'react';
import { Lock } from 'lucide-react';
import { NW_TINTA, NW_SAGE, NW_BORDE } from '@/components/network-v2/tokens';
import type { VerificacionIdentidadNetwork } from '@/lib/network/tipos';
import type { IdentidadForm } from '../form-state';
import { inputCls, inputStyle, labelCls } from '../estilos';
import { DropzoneDocumento, EstadoDocumento } from '../componentes';

export function PasoIdentidad({
  identidad, setIdentidad,
  verificacion,
  docAnverso, docReverso,
  subiendoAnverso, errorDocAnverso, fileInputDocAnverso,
  subiendoReverso, errorDocReverso, fileInputDocReverso,
  subirDocIdentidad,
  intentarEnviarVerificacion,
}: {
  identidad: IdentidadForm; setIdentidad: (fn: (v: IdentidadForm) => IdentidadForm) => void;
  verificacion: VerificacionIdentidadNetwork | null;
  docAnverso: string | null; docReverso: string | null;
  subiendoAnverso: boolean; errorDocAnverso: string; fileInputDocAnverso: React.RefObject<HTMLInputElement | null>;
  subiendoReverso: boolean; errorDocReverso: string; fileInputDocReverso: React.RefObject<HTMLInputElement | null>;
  subirDocIdentidad: (cara: 'anverso' | 'reverso', file: File) => void;
  intentarEnviarVerificacion: (anverso: string | null, reverso: string | null) => void;
}) {
  const uid = useId();

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 p-4 rounded-xl" style={{ background: NW_SAGE }}>
        <Lock size={16} className="mt-0.5 shrink-0" style={{ color: NW_TINTA }} />
        <p className="text-[13px]" style={{ color: NW_TINTA }}>
          <strong>Esta información es privada.</strong> La usamos únicamente para verificar tu identidad. No aparecerá en tu perfil público.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-apellido1`}>Primer apellido</label>
          <input id={`${uid}-apellido1`} value={identidad.apellido1} onChange={e => setIdentidad(v => ({ ...v, apellido1: e.target.value }))} className={inputCls} style={inputStyle} /></div>
        <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-apellido2`}>Segundo apellido (opcional)</label>
          <input id={`${uid}-apellido2`} value={identidad.apellido2} onChange={e => setIdentidad(v => ({ ...v, apellido2: e.target.value }))} className={inputCls} style={inputStyle} /></div>
        <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-nacimiento`}>Fecha de nacimiento</label>
          <input id={`${uid}-nacimiento`} type="date" value={identidad.fechaNacimiento} onChange={e => setIdentidad(v => ({ ...v, fechaNacimiento: e.target.value }))} className={inputCls} style={inputStyle} /></div>
        <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-pais`}>País de residencia</label>
          <input id={`${uid}-pais`} value={identidad.paisResidencia} onChange={e => setIdentidad(v => ({ ...v, paisResidencia: e.target.value }))} className={inputCls} style={inputStyle} placeholder="España" /></div>
      </div>
      <div>
        <label className={labelCls} style={{ color: NW_TINTA }}>Documento</label>
        <div className="flex gap-2 mb-2">
          {(['DNI', 'NIE', 'Pasaporte'] as const).map(t => (
            <button key={t} type="button" onClick={() => {
              setIdentidad(v => ({ ...v, tipoDocumento: t }));
              // Cambiar a Pasaporte (sin reverso) tras ya haber subido
              // el anverso no debe dejar el envío colgado esperando un
              // reverso que con este tipo ya no hace falta.
              if (t === 'Pasaporte' && docAnverso) void intentarEnviarVerificacion(docAnverso, docReverso);
            }}
              className="px-4 py-2 rounded-full text-[13px] font-semibold"
              style={{ background: identidad.tipoDocumento === t ? NW_TINTA : '#fff', color: identidad.tipoDocumento === t ? '#fff' : NW_TINTA, border: `1px solid ${NW_BORDE}` }}>
              {t}
            </button>
          ))}
        </div>
        <input value={identidad.numeroDocumento} onChange={e => setIdentidad(v => ({ ...v, numeroDocumento: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Número de documento" />
      </div>
      {/* Sin verificación viva (o la última fue rechazada): se puede
          subir. Con una pendiente/en_revision/verificada, ocultar los
          dropzones — reintentar aquí solo devolvía un 400 sin mensaje
          claro ("Ya tienes una verificación en curso."). */}
      {(!verificacion || verificacion.estado === 'rechazado') && (
        <>
          <DropzoneDocumento
            etiqueta="Anverso · PDF o foto"
            subiendo={subiendoAnverso} error={errorDocAnverso} inputRef={fileInputDocAnverso}
            onArchivo={f => subirDocIdentidad('anverso', f)}
          />
          {identidad.tipoDocumento !== 'Pasaporte' && (
            <DropzoneDocumento
              etiqueta="Reverso · PDF o foto"
              subiendo={subiendoReverso} error={errorDocReverso} inputRef={fileInputDocReverso}
              onArchivo={f => subirDocIdentidad('reverso', f)}
            />
          )}
        </>
      )}
      {verificacion && <EstadoDocumento estado={verificacion.estado} motivo={verificacion.motivoRechazo} />}
      <div>
        <p className={labelCls} style={{ color: NW_TINTA }} id={`${uid}-direccion`}>Dirección — privada, nunca se muestra</p>
        <div className="grid sm:grid-cols-3 gap-3" role="group" aria-labelledby={`${uid}-direccion`}>
          <input aria-label="Código postal" value={identidad.direccionCp} onChange={e => setIdentidad(v => ({ ...v, direccionCp: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Código postal" />
          <input aria-label="Ciudad" value={identidad.direccionCiudad} onChange={e => setIdentidad(v => ({ ...v, direccionCiudad: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Ciudad" />
          <input aria-label="Provincia" value={identidad.direccionProvincia} onChange={e => setIdentidad(v => ({ ...v, direccionProvincia: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Provincia" />
        </div>
      </div>
    </div>
  );
}

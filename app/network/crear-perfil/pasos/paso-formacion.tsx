'use client';

// Paso 06 del wizard: formación (certificaciones + documento). Extraído tal
// cual de app/network/crear-perfil/page.tsx (paso === 5) — F0 del roadmap
// de Tentare Network 2.0, sin cambios de comportamiento. Llama a la API
// directamente (crearCertificacionNetwork/eliminarCertificacionNetwork), no
// a través del padre — mismo patrón que ya usaba este componente antes de
// partir el fichero.
import { useRef, useState } from 'react';
import { crearCertificacionNetwork, eliminarCertificacionNetwork } from '@/lib/api-client';
import { subirDocumentoIdentidad, validarDocumentoIdentidad } from '@/lib/network/documentos-identidad';
import { NW_MUTED, NW_MUTED_2, NW_TINTA, NW_BORDE, NW_PRODUCTO } from '@/components/network-v2/tokens';
import type { CertificacionNetwork } from '@/lib/network/tipos';
import { inputCls, inputStyle } from '../estilos';
import { DropzoneDocumento, EstadoDocumento } from '../componentes';

export function PasoFormacion({
  certificaciones, setCertificaciones, userId,
}: {
  certificaciones: CertificacionNetwork[]; setCertificaciones: (c: CertificacionNetwork[]) => void; userId: string;
}) {
  const [abierto, setAbierto] = useState(certificaciones.length === 0);
  const [nombre, setNombre] = useState('');
  const [institucion, setInstitucion] = useState('');
  const [anio, setAnio] = useState('');
  const [duracion, setDuracion] = useState('');
  const [errorLocal, setErrorLocal] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function subir(file: File) {
    if (!nombre.trim() || !institucion.trim()) { setErrorLocal('Indica nombre e institución antes de subir el documento.'); return; }
    const invalido = validarDocumentoIdentidad(file);
    if (invalido) { setErrorLocal(invalido); return; }
    setErrorLocal(''); setSubiendo(true);
    const subida = await subirDocumentoIdentidad(userId, `certificacion-${Date.now()}`, file);
    if ('error' in subida) { setErrorLocal(subida.error); setSubiendo(false); return; }
    const res = await crearCertificacionNetwork({ nombre: nombre.trim(), institucion: institucion.trim(), anio: anio ? Number(anio) : null, duracion: duracion || null, documentoPath: subida.path });
    setSubiendo(false);
    if (!res.ok) { setErrorLocal(res.error); return; }
    setCertificaciones([res.certificacion, ...certificaciones]);
    setNombre(''); setInstitucion(''); setAnio(''); setDuracion(''); setAbierto(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px]" style={{ color: NW_MUTED }}>
        Publica tu formación con el certificado — una certificación no se marca verificada solo por subirla.
      </p>

      {certificaciones.map(c => (
        <div key={c.id} className="p-4 rounded-xl" style={{ border: `1px solid ${NW_BORDE}` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[14px] font-bold" style={{ color: NW_TINTA }}>{c.nombre}</p>
              <p className="text-[12.5px]" style={{ color: NW_MUTED_2 }}>{c.institucion}{c.anio ? ` · ${c.anio}` : ''}</p>
            </div>
            <EstadoDocumento estado={c.estado} motivo={c.motivoRechazo} />
          </div>
          {c.estado === 'rechazado' && (
            <button type="button" onClick={async () => { await eliminarCertificacionNetwork(c.id); setCertificaciones(certificaciones.filter(x => x.id !== c.id)); setAbierto(true); }} className="mt-2 text-[12.5px] font-semibold underline" style={{ color: NW_TINTA }}>
              Volver a subir
            </button>
          )}
        </div>
      ))}

      {abierto ? (
        <div className="p-4 rounded-xl space-y-3" style={{ border: `1.5px dashed ${NW_BORDE}` }}>
          <div className="grid sm:grid-cols-2 gap-3">
            <input value={nombre} onChange={e => setNombre(e.target.value)} className={inputCls} style={inputStyle} placeholder="Nombre de la certificación" />
            <input value={institucion} onChange={e => setInstitucion(e.target.value)} className={inputCls} style={inputStyle} placeholder="Institución" />
            <input value={anio} onChange={e => setAnio(e.target.value)} className={inputCls} style={inputStyle} placeholder="Año" />
            <input value={duracion} onChange={e => setDuracion(e.target.value)} className={inputCls} style={inputStyle} placeholder="Duración (opcional)" />
          </div>
          {errorLocal && <p className="text-[12.5px] text-destructive">{errorLocal}</p>}
          <DropzoneDocumento etiqueta="Subir certificado" subiendo={subiendo} error="" inputRef={fileRef} onArchivo={subir} />
        </div>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} className="text-[13.5px] font-semibold" style={{ color: NW_PRODUCTO }}>+ Añadir otra formación</button>
      )}
    </div>
  );
}

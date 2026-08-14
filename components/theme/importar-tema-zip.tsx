'use client';

// Importar un tema desde un ZIP (Claude Design u otra herramienta) —
// primera versión.
//
// ⚠️ Modo ESTÁTICO solo: HTML/CSS/assets/fuentes, servidos TAL CUAL dentro de
// un iframe en sandbox — nunca "reconstruidos" como componentes de Tentare.
// Un ZIP con .tsx/.jsx sin compilar, o que dependa de Next/Vite, se marca
// INCOMPATIBLE con el motivo exacto — nunca una aproximación silenciosa.
//
// Esto NO instala el tema importado como el tema activo del estudio (eso es
// la siguiente pieza: portar el Theme Schema para que sepa apuntar a un
// `theme_imports.id` en vez de a un tema del kit). Por ahora, sube, analiza y
// enseña el resultado fielmente — que es lo que había que demostrar primero.

import { useRef, useState } from 'react';
import { Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { authHeader } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import type { ImportedThemeManifest } from '@/lib/theme-import/manifest';

interface ResultadoImport {
  id: string;
  manifest: ImportedThemeManifest;
  estado: 'listo' | 'incompatible';
}

export function ImportarTemaZip() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function subir(fichero: File) {
    setSubiendo(true);
    setError(null);
    setResultado(null);
    setPreviewUrl(null);
    try {
      const form = new FormData();
      form.append('zip', fichero);
      const res = await fetch('/api/theme/importar-zip', {
        method: 'POST', headers: await authHeader(), body: form,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? 'No se ha podido importar el ZIP.');
        return;
      }
      setResultado(body as ResultadoImport);
      if (body.estado === 'listo') await prepararPreview(body.id);
    } catch (e) {
      setError(mensajeSeguro(e, ERROR_RED));
    } finally {
      setSubiendo(false);
    }
  }

  async function prepararPreview(id: string) {
    // Mismo token que ya usa `/portal-preview`: firmado, corta duración,
    // acotado al estudio — no depende de cookies (ver el comentario de
    // seguridad en la ruta de servido).
    const res = await fetch('/api/theme/home-preview-token', { method: 'POST', headers: await authHeader() });
    if (!res.ok) return;
    const { token } = (await res.json()) as { token: string };
    setPreviewUrl(`/api/theme/importado/${id}?t=${encodeURIComponent(token)}`);
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <p className="text-[15px] font-bold text-foreground">Importar tema desde ZIP</p>
        <p className="text-[13px] text-muted-foreground mt-1">
          Sube el .zip exportado de Claude Design. Se importa tal cual — HTML, CSS, imágenes y
          tipografías originales, sin recrearlo con los componentes de Tentare.
        </p>
      </div>

      <input
        ref={inputRef} type="file" accept=".zip" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ''; }}
      />
      <Button variant="outline" disabled={subiendo} onClick={() => inputRef.current?.click()}>
        <Upload className="size-4" />
        {subiendo ? 'Subiendo…' : 'Elegir fichero .zip'}
      </Button>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {resultado?.estado === 'incompatible' ? (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" />
            Importación parcial — no se pudo servir tal cual
          </div>
          <ul className="list-disc pl-5 space-y-1">
            {resultado.manifest.incompatibilidades.map((motivo) => <li key={motivo}>{motivo}</li>)}
          </ul>
        </div>
      ) : null}

      {resultado?.estado === 'listo' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[13px] text-emerald-700 font-medium">
            <CheckCircle2 className="size-4" />
            Importado — {resultado.manifest.ficheros.length} ficheros,
            {' '}{resultado.manifest.stylesheets.length} hoja(s) de estilos,
            {' '}{resultado.manifest.assets.length} imagen(es),
            {' '}{resultado.manifest.fonts.length} fuente(s)
          </div>
          {previewUrl ? (
            <div className="rounded-xl border border-border overflow-hidden" style={{ height: 480 }}>
              {/* ⚠️ SIN `allow-same-origin`: el origen queda opaco, así que el
                  código del ZIP no puede leer cookies de este dominio ni hacer
                  fetch autenticado contra el resto de la API — ver el
                  comentario de seguridad en la ruta que sirve esto. */}
              <iframe
                src={previewUrl} sandbox="allow-scripts" title="Vista previa del tema importado"
                style={{ width: '100%', height: '100%', border: 0 }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

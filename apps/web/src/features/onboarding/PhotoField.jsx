import { useRef, useState } from 'react';
import { Loader2, Trash2, Upload, User } from 'lucide-react';
import { api, uploadFile, errorMessage } from '@/shared/api/client';
import { useApiQuery } from '@/shared/api/useApiQuery';
import { Alert, Button, cx } from '@/shared/ui';

/**
 * Foto de perfil.
 *
 * La imagen se sube al almacenamiento y lo que guarda la base es su referencia,
 * nunca el archivo: una foto dentro de una columna sería un disco duro
 * disfrazado de base de datos.
 *
 * Si el entorno no tiene almacenamiento configurado, el campo se retira con un
 * aviso en lugar de romperse: la foto es opcional y nada más del onboarding
 * depende de ella.
 */
export default function PhotoField({ value, onChange }) {
  const inputRef = useRef(null);
  const config = useApiQuery('/me/photo/config');

  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const uploads = config.data?.uploads;
  const shown = preview ?? value;

  async function handleFile(event) {
    const file = event.target.files?.[0];
    // Permite reintentar con el mismo archivo después de un error.
    event.target.value = '';
    if (!file) return;

    if (uploads && !uploads.acceptedMimeTypes.includes(file.type)) {
      setError('Formatos admitidos: PNG, JPG y WebP.');
      return;
    }
    if (uploads && file.size > uploads.maxBytes) {
      setError(`La imagen supera el máximo de ${Math.round(uploads.maxBytes / 1024 / 1024)} MB.`);
      return;
    }

    // Se ve al instante, antes de que termine la subida.
    setPreview(URL.createObjectURL(file));
    setError(null);
    setProgress(0);
    setUploading(true);

    try {
      const { data } = await uploadFile('/me/photo', file, { onProgress: setProgress });
      onChange(data.photoUrl);
      setPreview(null);
    } catch (requestError) {
      setPreview(null);
      setError(errorMessage(requestError, 'No pudimos subir la foto.'));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    try {
      await api.delete('/me/photo');
      onChange(null);
      setPreview(null);
    } catch (requestError) {
      setError(errorMessage(requestError, 'No pudimos quitar la foto.'));
    }
  }

  if (config.data && !uploads?.enabled) {
    return (
      <Alert tone="info">
        Ahora mismo no podemos recibir fotos. Puedes continuar y añadirla más adelante.
      </Alert>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <span
        className={cx(
          'flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border',
          shown ? 'border-border bg-surface-sunken' : 'border-dashed border-border-strong',
        )}
      >
        {shown ? (
          /* La `key` hace que la foto entre al cambiar. Subir una imagen tarda
             lo suyo y termina sin aviso: sin esto, la única señal de que acabó
             es que el círculo cambia de contenido mientras miras el botón. */
          <img
            key={shown}
            src={shown}
            alt="Tu foto de perfil"
            className="anim-pop size-full object-cover"
          />
        ) : (
          <User className="size-8 text-text-subtle" aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <input
          ref={inputRef}
          type="file"
          accept={(uploads?.acceptedMimeTypes ?? ['image/png', 'image/jpeg']).join(',')}
          onChange={handleFile}
          className="hidden"
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            {uploading ? `Subiendo… ${progress}%` : value ? 'Cambiar foto' : 'Subir foto'}
          </Button>

          {value && !uploading ? (
            <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
              <Trash2 className="size-4" aria-hidden="true" />
              Quitar
            </Button>
          ) : null}
        </div>

        <p className="mt-2 text-xs text-text-subtle">
          PNG, JPG o WebP
          {uploads ? `, hasta ${Math.round(uploads.maxBytes / 1024 / 1024)} MB` : ''}.
        </p>

        {error ? (
          <div className="mt-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}
      </div>
    </div>
  );
}

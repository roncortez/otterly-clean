import { useRef, useState } from 'react';
import { ImageOff, Loader2, Trash2, Upload } from 'lucide-react';
import { uploadFile, errorMessage } from '@/shared/api/client';
import { Alert, Button, Field, Input, cx } from '@/shared/ui';
import { useUploadConfig } from './UploadConfigContext';

/**
 * Campo de imagen con subida.
 *
 * El archivo va al almacenamiento y lo que se guarda en la configuración es la
 * URL resultante, así que para el resto del sistema no cambia nada: sigue
 * siendo un campo de texto con una URL.
 *
 * Si no hay almacenamiento configurado el campo se degrada a un input de URL en
 * lugar de desaparecer: un entorno sin credenciales sigue pudiendo apuntar a
 * una imagen alojada en otro sitio.
 *
 * La validación de tamaño y formato se repite aquí solo para dar respuesta
 * inmediata. La que cuenta es la del backend, que además comprueba la firma
 * binaria del archivo.
 */
export default function ImageField({
  slot,
  label,
  hint,
  value,
  onChange,
  previewClassName = 'size-24',
}) {
  const { enabled, maxBytes, acceptedMimeTypes } = useUploadConfig();
  const inputRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const maxMb = Math.round(maxBytes / 1024 / 1024);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    // Permite volver a elegir el mismo archivo después de un error.
    event.target.value = '';
    if (!file) return;

    if (!acceptedMimeTypes.includes(file.type)) {
      setError('Formatos admitidos: PNG, JPG y WebP.');
      return;
    }
    if (file.size > maxBytes) {
      setError(`La imagen supera el máximo de ${maxMb} MB.`);
      return;
    }

    setError(null);
    setProgress(0);
    setUploading(true);

    try {
      const { data } = await uploadFile(`/operations/uploads/${slot}`, file, {
        onProgress: setProgress,
      });
      onChange(data.image.url);
    } catch (requestError) {
      setError(errorMessage(requestError, 'No pudimos subir la imagen.'));
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    if (!window.confirm('¿Quitar esta imagen? Dejará de mostrarse a los clientes.')) return;
    onChange('');
    setError(null);
  }

  if (!enabled) {
    return (
      <Field label={label} hint={hint ?? 'Pega la dirección de una imagen alojada en internet.'}>
        <Input
          type="url"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://…"
        />
      </Field>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-text">{label}</p>

      <div className="flex flex-wrap items-start gap-4">
        <span
          className={cx(
            previewClassName,
            'flex shrink-0 items-center justify-center overflow-hidden rounded-xl border',
            value ? 'border-border bg-surface-sunken' : 'border-dashed border-border-strong',
          )}
        >
          {value ? (
            /* Igual que en la foto de perfil: la `key` hace que la imagen entre al
               cambiar, para que subir una nueva termine con una señal y no con
               un cambio silencioso en la miniatura. */
            <img key={value} src={value} alt="" className="anim-pop size-full object-contain" />
          ) : (
            <ImageOff className="size-5 text-text-subtle" aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            type="file"
            accept={acceptedMimeTypes.join(',')}
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
              {uploading ? `Subiendo… ${progress}%` : value ? 'Reemplazar' : 'Subir imagen'}
            </Button>

            {value && !uploading ? (
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
                <Trash2 className="size-4" aria-hidden="true" />
                Quitar
              </Button>
            ) : null}
          </div>

          <p className="mt-2 text-xs text-text-subtle">
            {hint ? `${hint} ` : ''}PNG, JPG o WebP, hasta {maxMb} MB.
          </p>

          {error ? (
            <div className="mt-2">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

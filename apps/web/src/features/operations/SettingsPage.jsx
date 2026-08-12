import { useMemo, useState } from 'react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useEditableForm } from '@/shared/hooks/useEditableForm';
import { Alert, Card, CardHeader, Checkbox, Field, Input, Spinner, Textarea } from '@/shared/ui';
import SaveBar from './configuration/SaveBar';

/**
 * Avisos al cliente: el banner que aparece al entrar a la portada.
 *
 * Vive dentro de Configuración porque es lo mismo que el resto de esta sección
 * —contenido comercial que Operaciones cambia sin desplegar—, solo que
 * temporal.
 */
const EMPTY = { enabled: false, imageUrl: '', message: '' };

export default function SettingsPage() {
  const bannerQuery = useApiQuery('/operations/settings/banner');
  const { busy: saving, error: saveError, execute } = useApiAction();

  const [saved, setSaved] = useState(false);

  // Un banner que nunca se configuró llega vacío: se completa con los valores
  // por defecto para que el formulario tenga siempre la misma forma.
  const loaded = useMemo(() => {
    if (!bannerQuery.data) return null;
    return { ...EMPTY, ...(bannerQuery.data.banner ?? {}) };
  }, [bannerQuery.data]);

  const { form, dirty, setValue, reset } = useEditableForm(loaded);

  if (bannerQuery.error) return <Alert tone="danger">{bannerQuery.error}</Alert>;
  if (!form) return <Spinner label="Cargando avisos" />;

  const setField = (patch) => {
    for (const [key, value] of Object.entries(patch)) setValue(key, value);
    setSaved(false);
  };

  async function handleSubmit(event) {
    event.preventDefault();

    // El endpoint del banner reemplaza el objeto entero, así que se envía
    // completo y no solo lo que cambió.
    await execute(() => api.post('/operations/settings/banner', form), {
      onSuccess: () => {
        setSaved(true);
        reset();
        bannerQuery.reload();
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl">
      <Card>
        <CardHeader
          title="Banner promocional"
          description="Se muestra como aviso flotante la primera vez que alguien entra a la portada."
        />

        <div className="space-y-4 p-5">
          {saveError ? <Alert tone="danger">{saveError}</Alert> : null}

          <Checkbox
            label="Mostrar el banner"
            description="Al desactivarlo el aviso deja de aparecer, pero el contenido se conserva."
            checked={form.enabled}
            onChange={(event) => setField({ enabled: event.target.checked })}
          />

          <Field label="Imagen (URL)" hint="Opcional. Se muestra sobre el mensaje.">
            <Input
              type="url"
              value={form.imageUrl}
              onChange={(event) => setField({ imageUrl: event.target.value })}
              placeholder="https://ejemplo.com/promocion.jpg"
            />
          </Field>

          <Field label="Mensaje">
            <Textarea
              rows={3}
              maxLength={300}
              value={form.message}
              onChange={(event) => setField({ message: event.target.value })}
              placeholder="20% de descuento en tu primera limpieza profunda."
            />
          </Field>

          <SaveBar
            dirty={dirty}
            saving={saving}
            saved={saved}
            onReset={() => {
              reset();
              setSaved(false);
            }}
          />
        </div>
      </Card>
    </form>
  );
}

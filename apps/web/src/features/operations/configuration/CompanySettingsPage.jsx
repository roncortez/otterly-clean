import { useState } from 'react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useEditableForm } from '@/shared/hooks/useEditableForm';
import { Alert, Card, CardHeader, Field, Input, Spinner, Textarea } from '@/shared/ui';
import SaveBar from './SaveBar';

/**
 * Datos públicos de la empresa.
 *
 * Es la fuente única de lo que antes estaba escrito a mano en la portada, la
 * cabecera, el pie y el botón de WhatsApp. Aquí NO se gestionan secretos:
 * claves, tokens y credenciales viven en variables de entorno y no deben poder
 * editarse desde una pantalla.
 */

const SECTIONS = [
  {
    title: 'Identidad',
    description: 'Cómo se presenta la empresa en la web y en los correos.',
    fields: [
      { key: 'name', label: 'Nombre comercial', required: true },
      { key: 'tagline', label: 'Lema', hint: 'Frase corta que acompaña al nombre en la portada.' },
      {
        key: 'logoUrl',
        label: 'Logo (URL)',
        type: 'url',
        hint: 'Se muestra en la cabecera. Si se deja vacío usamos el icono de la marca.',
      },
      { key: 'iconUrl', label: 'Icono (URL)', type: 'url', hint: 'Versión cuadrada para usos pequeños.' },
    ],
  },
  {
    title: 'Contacto',
    description: 'Los canales que ve el cliente. Deja vacío el que no quieras ofrecer.',
    fields: [
      { key: 'phone', label: 'Teléfono', hint: 'Formato internacional: +593991234567' },
      { key: 'whatsapp', label: 'WhatsApp', hint: 'Formato internacional: +593991234567' },
      {
        key: 'whatsappMessage',
        label: 'Mensaje inicial de WhatsApp',
        type: 'textarea',
        hint: 'Texto con el que se abre el chat cuando alguien pulsa el botón.',
      },
      { key: 'telegram', label: 'Telegram', hint: 'Usuario (@empresa) o enlace completo.' },
      { key: 'email', label: 'Correo de contacto', type: 'email' },
      { key: 'address', label: 'Dirección o ubicación', hint: 'Texto libre que se muestra en el pie.' },
      { key: 'supportHours', label: 'Horario de atención' },
    ],
  },
  {
    title: 'Enlaces públicos',
    description: 'Opcionales. Se muestran solo si tienen valor.',
    fields: [
      { key: 'website', label: 'Sitio web', type: 'url' },
      { key: 'instagram', label: 'Instagram', type: 'url' },
      { key: 'facebook', label: 'Facebook', type: 'url' },
    ],
  },
];

export default function CompanySettingsPage() {
  const companyQuery = useApiQuery('/operations/settings/company');
  const { busy: saving, error: saveError, execute } = useApiAction();

  const [saved, setSaved] = useState(false);
  const { form, dirty, changes, setValue, reset } = useEditableForm(companyQuery.data?.company);

  if (companyQuery.error) return <Alert tone="danger">{companyQuery.error}</Alert>;
  if (!form) return <Spinner label="Cargando configuración" />;

  const update = (key) => (event) => {
    setValue(key, event.target.value);
    setSaved(false);
  };

  async function handleSubmit(event) {
    event.preventDefault();

    // Solo se envía lo que cambió: así un campo que no se tocó nunca se
    // sobrescribe con un valor obsoleto de la pantalla.
    await execute(() => api.patch('/operations/settings/company', changes), {
      onSuccess: () => {
        setSaved(true);
        reset();
        companyQuery.reload();
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
      {saveError ? <Alert tone="danger">{saveError}</Alert> : null}

      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader title={section.title} description={section.description} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {section.fields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                hint={field.hint}
                required={field.required}
                className={field.type === 'textarea' ? 'sm:col-span-2' : undefined}
              >
                {field.type === 'textarea' ? (
                  <Textarea
                    rows={2}
                    value={form[field.key] ?? ''}
                    onChange={update(field.key)}
                    maxLength={300}
                  />
                ) : (
                  <Input
                    type={field.type ?? 'text'}
                    required={field.required}
                    value={form[field.key] ?? ''}
                    onChange={update(field.key)}
                  />
                )}
              </Field>
            ))}
          </div>
        </Card>
      ))}

      <Card className="p-5">
        <SaveBar
          dirty={dirty}
          saving={saving}
          saved={saved}
          onReset={() => {
            reset();
            setSaved(false);
          }}
        />
      </Card>
    </form>
  );
}

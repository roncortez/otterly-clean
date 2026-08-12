import { Check, Save } from 'lucide-react';
import { Button } from '@/shared/ui';

/**
 * Barra de guardado común a las pantallas de configuración.
 *
 * El botón se deshabilita cuando no hay cambios: evita guardados accidentales y
 * hace visible, sin leer nada, si queda algo pendiente por confirmar.
 */
export default function SaveBar({ dirty, saving, saved, onReset, label = 'Guardar cambios' }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
      {saved && !dirty ? (
        <span className="mr-auto flex items-center gap-1.5 text-sm text-success">
          <Check className="size-4" aria-hidden="true" />
          Cambios guardados
        </span>
      ) : null}

      {dirty && onReset ? (
        <Button type="button" variant="ghost" onClick={onReset} disabled={saving}>
          Descartar
        </Button>
      ) : null}

      <Button type="submit" loading={saving} disabled={!dirty}>
        <Save className="size-4" aria-hidden="true" />
        {label}
      </Button>
    </div>
  );
}

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
      {/*
        La confirmación entra en movimiento. Guardar es una acción sin resultado
        visible —la pantalla se queda exactamente igual—, así que este texto es
        la única respuesta que recibe quien pulsó. Apareciendo de golpe pasa
        desapercibido justo en el momento en que se está buscando; llegando desde
        abajo, el ojo lo encuentra solo.
      */}
      {saved && !dirty ? (
        <span className="anim-rise mr-auto flex items-center gap-1.5 text-sm text-success">
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

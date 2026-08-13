import { useNavigate } from 'react-router-dom';
import { Modal, cx } from '@/shared/ui';
import { useBookableChoices } from '@/shared/services';

/**
 * «¿Qué necesitas?» — el selector de servicio.
 *
 * Es el único punto de entrada a pedir algo, y por eso es un componente y no
 * tres copias: lo abren la portada (visitante sin sesión), la cabecera del
 * cliente y el asistente de reserva cuando llega sin servicio. Antes cada uno
 * llevaba su propia lista de botones, y por eso «Kits» navegaba a un sitio
 * distinto según desde dónde se pulsara.
 *
 * El modal no exige sesión. Elegir un servicio y empezar a rellenar la reserva
 * son cosas que un visitante puede hacer; la sesión se pide justo antes de
 * confirmar (ver `BookingWizard`), que es cuando de verdad hace falta saber
 * quién eres.
 *
 * Las opciones salen de `shared/services` ya cruzadas con lo que el backend dice
 * que está disponible: si Operaciones apaga Lavandería, deja de aparecer aquí
 * sin tocar este archivo.
 */
export default function ServicePicker({ open, onClose }) {
  const navigate = useNavigate();
  const choices = useBookableChoices();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="¿Qué necesitas?"
      description="Elige por dónde quieres empezar."
      size="lg"
    >
      <div
        className={cx(
          'grid gap-4 py-2',
          choices.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
        {choices.map((choice) => {
          const Icon = choice.icon;
          return (
            <button
              key={choice.code}
              type="button"
              data-service={choice.serviceType ?? undefined}
              onClick={() => {
                onClose?.();
                navigate(choice.path);
              }}
              className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-border bg-surface p-6 text-center transition-all hover:border-forest-400 hover:bg-surface-sunken"
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-bold text-text">{choice.label}</span>
                <span className="mt-1 block text-xs text-text-muted">{choice.short}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

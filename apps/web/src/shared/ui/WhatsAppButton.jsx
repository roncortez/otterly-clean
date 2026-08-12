import { MessageCircle } from 'lucide-react';
import { useConfig } from '@/shared/config/ConfigContext';
import { ButtonLink } from '@/shared/ui';

/**
 * Enlace de contacto por WhatsApp.
 *
 * El número y el mensaje por defecto vienen de la configuración de la empresa:
 * antes estaban escritos en el componente, así que cambiar el número de
 * contacto obligaba a desplegar. Si no hay número configurado el botón no se
 * pinta, en lugar de abrir un chat con un número inexistente.
 *
 * Hereda la forma de los demás botones: sobre fondo claro va en `outline` y
 * sobre el verde profundo del hero en `inverse`.
 */
export default function WhatsAppButton({
  phone,
  message,
  className = '',
  label = 'WhatsApp',
  variant = 'outline',
  size = 'md',
}) {
  const { company } = useConfig();

  const number = phone ?? company.whatsapp;
  if (!number) return null;

  const text = message ?? company.whatsappMessage ?? '';
  const href = `https://wa.me/${number.replace(/\D/g, '')}${
    text ? `?text=${encodeURIComponent(text)}` : ''
  }`;

  return (
    <ButtonLink
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      variant={variant}
      size={size}
      className={className}
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      <span>{label}</span>
    </ButtonLink>
  );
}

import { MessageCircle } from 'lucide-react';
import { useConfig } from '@/shared/config/ConfigContext';

/**
 * Enlace de contacto por WhatsApp.
 *
 * El número y el mensaje por defecto vienen de la configuración de la empresa:
 * antes estaban escritos en el componente, así que cambiar el número de
 * contacto obligaba a desplegar. Si no hay número configurado el botón no se
 * pinta, en lugar de abrir un chat con un número inexistente.
 */
export default function WhatsAppButton({ phone, message, className = '', label = 'WhatsApp' }) {
  const { company } = useConfig();

  const number = phone ?? company.whatsapp;
  if (!number) return null;

  const text = message ?? company.whatsappMessage ?? '';
  const href = `https://wa.me/${number.replace(/\D/g, '')}${
    text ? `?text=${encodeURIComponent(text)}` : ''
  }`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex h-11 items-center gap-2 rounded-xl border border-border-strong bg-surface-raised px-4 text-sm font-medium text-text transition-colors hover:bg-surface-sunken ${className}`}
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      <span>{label}</span>
    </a>
  );
}

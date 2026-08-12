import React from 'react';
import { MessageCircle } from 'lucide-react';

export default function WhatsAppButton({
  phone = '+593991234567',
  message = 'Hola, me gustaría solicitar información sobre los servicios de Otterly Clean.',
  className = '',
  label = 'WhatsApp',
}) {
  const encoded = encodeURIComponent(message);
  const href = `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encoded}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-all ${className}`}
    >
      <MessageCircle className="h-4 w-4" />
      <span>{label}</span>
    </a>
  );
}

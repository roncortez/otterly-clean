import React from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '@/shared/ui/BrandMark';
import { ButtonLink } from '@/shared/ui';
import { useTranslation, LanguageSelector } from '@/shared/i18n/I18nContext';

/**
 * Cabecera flotante de la portada.
 *
 * Cristal verde profundo sobre la imagen del hero: es el mismo verde de la
 * marca en su versión más oscura, no un gris azulado prestado de Tailwind.
 */
export default function Header() {
  const { t } = useTranslation();

  const LINKS = [
    { href: '#how-it-works', label: t('header.howItWorks') },
    { href: '#services', label: t('header.services') },
    { href: '#about', label: t('header.about') },
    { href: '#faqs', label: t('header.faqs') },
  ];

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4 sm:px-6">
      <nav className="mx-auto flex w-[90%] items-center justify-between rounded-2xl border border-white/15 bg-forest-950/80 px-6 py-3.5 text-white shadow-[var(--shadow-raised)] backdrop-blur-xl">
        {/* Logotipo administrable, igual que en el resto de la aplicación */}
        <a href="#hero" className="transition-transform hover:scale-105">
          <BrandMark size="md" tone="inverse" />
        </a>

        {/* Enlaces de navegación */}
        <ul className="hidden items-center gap-8 text-sm font-medium text-forest-100 lg:flex">
          {LINKS.map(({ href, label }) => (
            <li key={href}>
              <a href={href} className="transition-colors hover:text-white">
                {label}
              </a>
            </li>
          ))}
        </ul>

        {/* Acciones */}
        <ul className="flex items-center gap-4 sm:gap-6">
          <li>
            <LanguageSelector tone="inverse" />
          </li>
          <li>
            <Link
              to="/entrar"
              className="text-sm font-semibold text-white transition-colors hover:text-accent-300"
            >
              {t('header.login')}
            </Link>
          </li>
          <li>
            <ButtonLink as={Link} to="/reservar" variant="accent" size="sm">
              {t('header.quote')}
            </ButtonLink>
          </li>
        </ul>
      </nav>
    </header>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import { Droplets } from 'lucide-react';
import { useTranslation, LanguageSelector } from '@/shared/i18n/I18nContext';

export default function Header() {
    const { t } = useTranslation();

    return (
        <header className="fixed top-4 inset-x-0 z-50 px-4 sm:px-6">
            <nav className="mx-auto flex w-full w-[90%] items-center justify-between rounded-2xl border border-white/20 bg-slate-950/80 px-6 py-3.5 text-white shadow-2xl backdrop-blur-xl transition-all">
                {/* Logo / Brand */}
                <a href="#hero" className="flex items-center gap-2.5 transition-transform hover:scale-105">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-600 text-white shadow-md">
                        <Droplets className="h-4.5 w-4.5" />
                    </span>
                    <span className="text-base font-bold tracking-tight text-white">
                        Otterly <span className="text-accent-400">Clean</span>
                    </span>
                </a>

                {/* Enlaces de Navegación */}
                <ul className="hidden items-center gap-8 text-sm font-medium text-slate-300 lg:flex">
                    <li>
                        <a href="#how-it-works" className="transition-colors hover:text-white">
                            {t('header.howItWorks')}
                        </a>
                    </li>
                    <li>
                        <a href="#services" className="transition-colors hover:text-white">
                            {t('header.services')}
                        </a>
                    </li>
                    <li>
                        <a href="#about" className="transition-colors hover:text-white">
                            {t('header.about')}
                        </a>
                    </li>
                    <li>
                        <a href="#faqs" className="transition-colors hover:text-white">
                            {t('header.faqs')}
                        </a>
                    </li>
                </ul>

                {/* Acciones Derecha */}
                <ul className="flex items-center gap-4 sm:gap-6">
                    <li>
                        <LanguageSelector />
                    </li>
                    <li>
                        <Link
                            to="/entrar"
                            className="text-sm font-semibold text-white transition-colors hover:text-accent-400"
                        >
                            {t('header.login')}
                        </Link>
                    </li>
                    <li>
                        <Link
                            to="/reservar"
                            className="rounded-full bg-accent-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-accent-500 hover:shadow-lg active:scale-95"
                        >
                            {t('header.quote')}
                        </Link>
                    </li>
                </ul>
            </nav>
        </header>
    );
}
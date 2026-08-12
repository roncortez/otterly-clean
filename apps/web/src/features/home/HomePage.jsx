import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Shirt, Scissors, CalendarCheck, CheckCircle2, ShieldCheck, Clock } from 'lucide-react';
import WhatsAppButton from '../../shared/ui/WhatsAppButton';
import Overlay from '../../shared/ui/Overlay';
import api from '../../shared/api/client';

const CATEGORIES = [
  {
    key: 'cleaning',
    label: 'Limpieza Residencial',
    icon: Sparkles,
    description: 'Hogares y oficinas impecables, adaptados a tu horario y necesidades.',
    link: '/customer/booking?service=CLEANING',
  },
  {
    key: 'laundry',
    label: 'Lavandería a Domicilio',
    icon: Shirt,
    description: 'Lavado, secado, doblado y cuidado profesional de prendas con trazabilidad por bolsa.',
    link: '/customer/booking?service=LAUNDRY',
  },
  {
    key: 'repair',
    label: 'Arreglo de Prendas',
    icon: Scissors,
    description: 'Ajustes de bastas, cierres y costuras con altos estándares de calidad.',
    link: '/customer/booking?service=ALTERATION',
  },
];

export default function HomePage() {
  const [banner, setBanner] = useState(null);
  const [showOverlay, setShowOverlay] = useState(true);

  useEffect(() => {
    async function fetchBanner() {
      try {
        const res = await api.get('/catalog/banner');
        setBanner(res.data);
      } catch {
        // Ignorar si falla
      }
    }
    fetchBanner();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Overlay
        isOpen={showOverlay && banner?.enabled !== false}
        imageUrl={banner?.imageUrl}
        message={banner?.message}
        onClose={() => setShowOverlay(false)}
      />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white px-6 py-20 lg:py-28">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Servicios a Domicilio Verificados</span>
          </div>

          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Tu espacio, <span className="text-emerald-600">impecable</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Limpieza residencial, lavandería y cuidado de prendas con personal calificado.
            Agenda a tu conveniencia y sigue cada etapa en tiempo real.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/customer/booking"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-7 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 transition-all hover:shadow-lg"
            >
              <CalendarCheck className="h-4 w-4" />
              Solicitar Servicio
            </Link>
            <WhatsAppButton
              label="Contactar por WhatsApp"
              message="Hola, quisiera solicitar información sobre los servicios de Otterly Clean."
            />
          </div>

          {/* Badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 border-t border-slate-100 pt-8 text-xs font-medium text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Personal 100% Verificado</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-600" />
              <span>Monitoreo en Tiempo Real</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Garantía de Satisfacción</span>
            </div>
          </div>
        </div>
      </section>

      {/* Grid de Categorías */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Nuestros Servicios
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Selecciona la categoría que necesitas y reserva en menos de 2 minutos
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <div
                key={cat.key}
                className="flex flex-col justify-between rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200/80 transition-all hover:shadow-md hover:ring-emerald-500/40"
              >
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 text-xl font-bold text-slate-900">{cat.label}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    {cat.description}
                  </p>
                </div>
                <div className="mt-8 pt-4 border-t border-slate-100">
                  <Link
                    to={cat.link}
                    className="inline-flex items-center text-sm font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    Reservar {cat.label.split(' ')[0]} &rarr;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Loading from "shared/ui/Loading";
import Overlay from "shared/ui/Overlay";
import WhatsAppButton from "shared/ui/WhatsAppButton";
import {
  FaBroom,
  FaTshirt,
  FaTools,
  FaCalendarCheck,
} from "react-icons/fa";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

const CATEGORIES = [
  {
    key: "cleaning",
    label: "Cleaning",
    icon: FaBroom,
    description: "Spotless homes and offices, tailored to your schedule.",
  },
  {
    key: "laundry",
    label: "Laundry",
    icon: FaTshirt,
    description: "Professional wash, fold, and garment care.",
  },
  {
    key: "repair",
    label: "Repair",
    icon: FaTools,
    description: "Quality fixes for zippers, seams, and more.",
  },
];

function HomePage() {
  const [loading, setLoading] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const bannerRes = await axios
          .get(`${API_BASE}/api/settings/banner`)
          .catch(() => ({ data: null }));
        setBanner(bannerRes.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen">
      <Overlay
        isOpen={showOverlay && banner?.enabled !== false}
        imageUrl={banner?.imageUrl}
        onClose={() => setShowOverlay(false)}
      />

      {/* Hero */}
      <section className="relative bg-white px-5 pt-20 pb-24 sm:pt-28 sm:pb-32 lg:pt-36 lg:pb-40">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-sage-100 opacity-60" />
          <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-sage-100 opacity-40" />
        </div>
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-sage-100 px-4 py-1.5 text-xs font-semibold text-forest-700">
            <span className="h-1.5 w-1.5 rounded-full bg-forest-500" />
            Professional Cleaning Services
          </div>
          <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight text-forest-800 sm:text-5xl lg:text-6xl">
            Your space,{" "}
            <span className="text-forest-600">immaculate</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-forest-500">
            Cleaning, laundry, and repair with excellence standards.
            We schedule at your convenience and handle the rest.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/services"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-7 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-700 hover:shadow-md"
            >
              <FaCalendarCheck className="text-xs" />
              Request Service
            </Link>
            <WhatsAppButton message="Hi, I would like to request a cleaning service." />
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="border-t border-sage-200 bg-sage-50 px-5 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-forest-600">Services</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-forest-800 sm:text-4xl">
              What We Offer
            </h2>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {CATEGORIES.map(({ key, label, icon: Icon, description }) => (
              <div
                key={key}
                className="flex flex-col items-center gap-4 rounded-2xl border border-sage-200 bg-white p-8 text-center"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sage-100 text-forest-600">
                  <Icon className="text-xl" />
                </div>
                <h3 className="font-display text-lg font-bold text-forest-800">{label}</h3>
                <p className="text-sm leading-relaxed text-forest-500">{description}</p>
                <Link
                  to="/services"
                  className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                >
                  Request
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white px-5 py-20 sm:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-forest-600">Process</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-forest-800 sm:text-4xl">
            How It Works
          </h2>
          <div className="relative mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3">
            {[
              { step: "1", title: "Choose Your Service", text: "Browse our categories and select what you need." },
              { step: "2", title: "Book Your Appointment", text: "Pick a date and time that fits your schedule." },
              { step: "3", title: "Enjoy", text: "Our team handles the rest with the highest quality." },
            ].map(({ step, title, text }) => (
              <div key={step} className="flex flex-col items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-600 text-sm font-bold text-white">
                  {step}
                </div>
                <h3 className="mt-5 font-display text-base font-bold text-forest-800">{title}</h3>
                <p className="mt-2 max-w-[240px] text-sm leading-relaxed text-forest-500">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default HomePage;

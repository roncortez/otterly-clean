import React, { useState, useRef, useEffect } from "react";
import { FaWhatsapp, FaPhone, FaChevronDown } from "react-icons/fa";

const DEFAULT_WHATSAPP_NUMBER = "12034558417";

const WhatsAppButton = ({ message = "", className = "" }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const number = (process.env.REACT_APP_WHATSAPP_NUMBER || DEFAULT_WHATSAPP_NUMBER).replace(/\D/g, "");
  const waUrl = `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
  const telUrl = `tel:+${number}`;

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
      >
        <FaWhatsapp className="text-base" />
        Contact Us
        <FaChevronDown className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg">
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            onClick={() => setOpen(false)}
          >
            <FaWhatsapp className="text-lg text-green-500" />
            Send Message
          </a>
          <div className="border-t border-gray-100" />
          <a
            href={telUrl}
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            onClick={() => setOpen(false)}
          >
            <FaPhone className="text-sm text-primary-600" />
            Call Now
          </a>
        </div>
      )}
    </div>
  );
};

export default WhatsAppButton;

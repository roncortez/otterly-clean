import WhatsAppButton from "shared/ui/WhatsAppButton";
import { FaHome, FaBroom, FaTshirt, FaTools } from "react-icons/fa";

export default function Footer() {
  return (
    <footer className="bg-forest-700">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                <FaHome className="text-base text-white" />
              </div>
              <h3 className="font-display text-lg font-bold text-white">Otterly Clean</h3>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-sage-300">
              Professional cleaning, laundry, and repair services for homes and offices.
            </p>
            <div className="mt-5 flex items-center gap-3 text-sage-400">
              <FaBroom className="text-sm" />
              <FaTshirt className="text-sm" />
              <FaTools className="text-sm" />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-sage-400">Quick Links</h4>
            <ul className="mt-4 flex flex-col gap-3 text-sm text-sage-200">
              <li><a href="/" className="transition-colors hover:text-white">Home</a></li>
              <li><a href="/services" className="transition-colors hover:text-white">Request Service</a></li>
              <li><a href="/profile" className="transition-colors hover:text-white">My Account</a></li>
              <li><a href="/login" className="transition-colors hover:text-white">Sign In</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-sage-400">Contact</h4>
            <div className="mt-4">
              <p className="text-sm text-sage-300">Ready to get started?</p>
              <div className="mt-3">
                <WhatsAppButton />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-sage-400">
          &copy; {new Date().getFullYear()} Otterly Clean. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

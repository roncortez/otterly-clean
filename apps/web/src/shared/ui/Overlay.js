import React from "react";
import promo from "../../assets/promo1.png";

const Overlay = ({ isOpen, onClose, imageUrl }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-fadeIn items-center justify-center bg-black/70">
      <div className="relative inline-block animate-zoomIn overflow-hidden rounded-2xl p-0 shadow-2xl">
        <img
          src={imageUrl || promo}
          alt="Promo"
          className="block h-auto max-h-[92vh] w-auto max-w-[92vw] rounded-2xl"
        />
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-xl font-bold text-white backdrop-blur-sm transition-colors hover:bg-black/60 md:right-5 md:h-11 md:w-11 md:text-2xl"
        >
          x
        </button>
      </div>
    </div>
  );
};

export default Overlay;

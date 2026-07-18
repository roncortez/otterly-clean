import React from "react";
import promo from "../../assets/promo1.png";

const Overlay = ({ isOpen, onClose, imageUrl }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-fadeIn items-center justify-center bg-black/70">
      <div className="relative inline-block animate-zoomIn overflow-hidden p-0 shadow-xl">
        <img
          src={imageUrl || promo}
          alt="Promo"
          className="block h-auto max-h-[92vh] w-auto max-w-[92vw]"
        />
        <button
          onClick={onClose}
          className="absolute right-2 top-2 text-3xl font-bold text-white md:right-5 md:text-6xl"
        >
          x
        </button>
      </div>
    </div>
  );
};

export default Overlay;
import React from "react";
import logo2 from "../../assets/logo2.png";

const Loading = () => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white bg-opacity-70 font-comfortaa">
      <div className="flex flex-col items-center font-semibold">
        <img src={logo2} className="h-15 sm:h-30 w-20 animate-bounce sm:w-40" />
        <p>Cargando...</p>
      </div>
    </div>
  );
};

export default Loading;

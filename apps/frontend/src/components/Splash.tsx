import { useEffect } from "react";

// ✅ Import de la imagen con la forma 100% compatible con Vite
// (asegurate que el archivo existe en: src/assets/logo.png)
const logo = new URL("../assets/logo.png", import.meta.url).href;

type SplashProps = {
  /** ms visibles antes de cerrar */
  duration?: number;
  /** callback al terminar */
  onDone?: () => void;
};

export default function Splash({ duration = 1200, onDone }: SplashProps) {
  useEffect(() => {
    if (!onDone) return;
    const id = setTimeout(onDone, duration);
    return () => clearTimeout(id);
  }, [duration, onDone]);

  console.log("Splash montado, logo url =>", logo);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#004d5d] to-[#1498a3] flex items-center justify-center">
      <div className="flex flex-col items-center gap-10">
        {/* Logo */}
        <img
          src={logo}
          alt="Solucity"
          className="w-44 h-44 select-none drop-shadow-xl"
          draggable={false}
        />

        {/* Spinner simple */}
        <div className="flex gap-2">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-white/90 animate-pulse"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

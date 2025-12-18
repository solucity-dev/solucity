// src/App.tsx
import Splash from "./components/Splash";

export default function App() {
  // NOTA: al no pasar onDone, el Splash NO se cierra solo
  return <Splash duration={1200} />;
}


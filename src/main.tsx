import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/globals.css";

// Audio-context unlock: iOS Safari requires a user gesture before audio plays.
// We listen once, globally, and let the audio manager (Step 4) hook in.
function installAudioUnlock() {
  const unlock = () => {
    window.dispatchEvent(new CustomEvent("diceborn:audio-unlock"));
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown",     unlock, { once: true });
}
installAudioUnlock();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

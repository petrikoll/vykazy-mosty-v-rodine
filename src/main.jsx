import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

function PortalRoot() {
  const [splashState, setSplashState] = useState("visible");

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setSplashState("leaving"), 3150);
    const hideTimer = window.setTimeout(() => setSplashState("hidden"), 3650);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  return (
    <>
      <App />
      {splashState !== "hidden" && (
        <div
          className={`splash-screen${splashState === "leaving" ? " splash-screen--leaving" : ""}`}
          role="status"
          aria-label="Načítání personálního portálu"
        >
          <img
            className="splash-screen__image"
            src="/splash-screen.webp"
            alt="Personální portál Mosty v rodině"
          />
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PortalRoot />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => console.error("Service worker registration failed:", error));
  });
}

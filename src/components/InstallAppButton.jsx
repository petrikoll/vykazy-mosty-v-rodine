import React, { useEffect, useState } from "react";
import { Download, MonitorDown, Smartphone, X } from "lucide-react";
import { Button } from "./Common.jsx";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  getInstallPlatform,
  isInstallHidden,
  rememberInstalled,
  subscribeToInstallState,
} from "../pwaInstall.mjs";

function InstallInstructions({ platform, onClose }) {
  const firefoxDesktop = platform === "firefox-desktop";
  const firefoxAndroid = platform === "firefox-android";
  const ios = platform === "ios";

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="install-app-title" onMouseDown={onClose}>
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-blue-100 p-2 text-blue-800">{firefoxAndroid || ios ? <Smartphone size={22}/> : <MonitorDown size={22}/>}</span>
          <div><h2 id="install-app-title" className="text-lg font-bold">Nainstalovat aplikaci</h2><p className="text-xs text-slate-500">Mosty v rodině · Personální portál</p></div>
        </div>
        <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Zavřít"><X size={20}/></button>
      </div>

      {firefoxDesktop && <div className="mt-5 space-y-3 text-sm leading-6">
        <p>Ve Firefoxu klikněte na ikonu <strong>webové aplikace</strong> vpravo v adresním řádku. Firefox portál nainstaluje a přidá jej do nabídky Start a na hlavní panel.</p>
        <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">Funkce je dostupná ve Firefoxu pro Windows od verze 143. Pokud ikonu nevidíte, aktualizujte Firefox. U instalace z Microsoft Store je podpora dostupná až od verze 150.</p>
      </div>}

      {firefoxAndroid && <p className="mt-5 text-sm leading-6">Otevřete nabídku Firefoxu <strong>⋮</strong> a zvolte <strong>Nainstalovat</strong> nebo <strong>Přidat na plochu</strong>.</p>}

      {ios && <p className="mt-5 text-sm leading-6">V nabídce Sdílet zvolte <strong>Přidat na plochu</strong> a potvrďte přidání aplikace.</p>}

      {platform === "generic" && <p className="mt-5 text-sm leading-6">Použijte instalační ikonu v adresním řádku nebo v nabídce prohlížeče zvolte <strong>Nainstalovat aplikaci</strong> či <strong>Přidat na plochu</strong>.</p>}

      <p className="mt-4 text-xs text-slate-500">Po spuštění nainstalované aplikace se toto tlačítko již nezobrazuje.</p>
      <div className="mt-5 flex justify-end"><Button type="button" onClick={onClose}>Rozumím</Button></div>
    </div>
  </div>;
}

export default function InstallAppButton({ variant = "header", className = "" }) {
  const [, setRevision] = useState(0);
  const [showInstructions, setShowInstructions] = useState(false);
  const hidden = isInstallHidden();

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const media = window.matchMedia?.("(display-mode: standalone)");
    const unsubscribe = subscribeToInstallState(refresh);
    media?.addEventListener?.("change", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      unsubscribe();
      media?.removeEventListener?.("change", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);

  if (hidden) return null;

  const install = async () => {
    const prompt = getDeferredInstallPrompt();
    if (!prompt) {
      setShowInstructions(true);
      return;
    }

    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") rememberInstalled();
    else clearDeferredInstallPrompt();
  };

  return <>
    <Button type="button" variant={variant} compact className={`pwa-install-control inline-flex items-center ${className}`} onClick={install} aria-label="Nainstalovat aplikaci" title="Nainstalovat aplikaci">
      <Download size={15}/><span className="ml-1.5">Nainstalovat</span>
    </Button>
    {showInstructions && <InstallInstructions platform={getInstallPlatform()} onClose={() => setShowInstructions(false)}/>}
  </>;
}

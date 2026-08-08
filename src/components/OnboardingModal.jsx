import React, { useEffect, useState } from 'react';
import { Network, Download, Share, Check, X } from 'lucide-react';

const STORAGE_KEY = 'ugene_welcome_v1';

export const hasSeenOnboarding = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'accepted';
  } catch {
    return true; // storage non disponibile: non insistere ad ogni caricamento
  }
};

const isIosSafari = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/**
 * Popup dei primi accessi: presenta l'app, propone l'installazione come PWA
 * e raccoglie l'accettazione di privacy e termini.
 */
export default function OnboardingModal({ onClose, onOpenLegal }) {
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'accepted');
    } catch {
      // Modalità privata senza storage: si prosegue comunque.
    }
    onClose();
  };

  const install = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);
    if (outcome === 'accepted') setInstalled(true);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container onboarding-modal glass">
        <div className="modal-header">
          <h3 className="flex-align gap-6">
            <Network size={18} /> Benvenuto in Genealogia di Famiglia
          </h3>
          <button className="btn-icon" onClick={accept} aria-label="Chiudi">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body onboarding-body">
          <p>
            Ricostruisci l’albero della tua famiglia: schede delle persone, relazioni,
            compleanni e rami collegati con gli alberi di altri parenti.
          </p>

          {!isStandalone() && (
            <div className="onboarding-install">
              {installed ? (
                <p className="flex-align gap-6"><Check size={16} /> App installata: aprila dalla schermata principale.</p>
              ) : installEvent ? (
                <>
                  <p>Installala sul dispositivo per aprirla come una vera app, anche offline.</p>
                  <button className="btn btn-primary" onClick={install}>
                    <Download size={16} /> Installa l’app
                  </button>
                </>
              ) : isIosSafari() ? (
                <p className="flex-align gap-6">
                  <Share size={16} />
                  Per installarla su iPhone o iPad: tocca <strong>Condividi</strong>, poi <strong>Aggiungi a Home</strong>.
                </p>
              ) : (
                <p>Puoi installarla dal menu del browser con “Installa app” / “Aggiungi a schermata Home”.</p>
              )}
            </div>
          )}

          <p className="onboarding-legal">
            Proseguendo accetti i{' '}
            <button className="link-button" onClick={() => onOpenLegal('terms')}>Termini di servizio</button>
            {' '}e dichiari di aver letto l’{' '}
            <button className="link-button" onClick={() => onOpenLegal('privacy')}>Informativa sulla privacy</button>.
            Le informazioni sulla salute sono facoltative e visibili solo a chi ha il permesso dedicato.
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={accept}>Accetto e inizio</button>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { X, Shield, FileText } from 'lucide-react';

// Testi legali dell'app. Sono volutamente statici: nessuna dipendenza, nessun routing.
// I riferimenti del titolare vanno completati prima della messa online.
const TITOLARE = 'il titolare del trattamento (contatto: umasterinfo@gmail.com)';

const PRIVACY = [
  ['Titolare del trattamento', [
    `I dati inseriti in questa applicazione sono trattati da ${TITOLARE}, a cui puoi rivolgerti per qualsiasi richiesta relativa ai tuoi dati.`
  ]],
  ['Quali dati trattiamo', [
    'Dati dell’account: nome, cognome, indirizzo email e stato di approvazione, necessari per accedere e per gestire i permessi sugli alberi.',
    'Dati genealogici: nomi, date e luoghi di nascita o decesso, relazioni familiari, note biografiche inserite da te o da chi gestisce l’albero.',
    'Dati relativi alla salute: le patologie eventualmente annotate sulle schede sono dati particolari (art. 9 GDPR). Sono visibili solo a chi ha il permesso "salute" sull’albero e solo dopo aver attivato esplicitamente la Modalità clinica.',
    'Dati tecnici: preferenze locali salvate sul dispositivo (visualizzazione dell’albero, accettazione di queste informative), conservate nel browser e mai inviate a terzi.'
  ]],
  ['Perché li trattiamo', [
    'Per erogare il servizio: creare, consultare e condividere alberi genealogici e gestire i permessi di modifica.',
    'Per la sicurezza: autenticazione, approvazione degli account e moderazione delle proposte di modifica.',
    'Per le notifiche facoltative su compleanni e proposte di modifica, inviate all’indirizzo email dell’account.'
  ]],
  ['Base giuridica', [
    'Il trattamento dei dati dell’account e genealogici si fonda sull’esecuzione del servizio richiesto e sul legittimo interesse alla ricostruzione della storia familiare.',
    'I dati relativi alla salute sono trattati esclusivamente sulla base del consenso esplicito di chi li inserisce: inserendo una patologia dichiari di avere titolo per farlo. Il consenso è revocabile in qualsiasi momento cancellando il dato.'
  ]],
  ['Con chi sono condivisi', [
    'Supabase (hosting del database e autenticazione) e il servizio di invio email agiscono come responsabili del trattamento per nostro conto.',
    'Gli altri utenti vedono i dati secondo la visibilità dell’albero (pubblico, riservato, privato) e secondo i permessi impostati dal proprietario. Nessun dato viene venduto o ceduto a fini pubblicitari.'
  ]],
  ['Conservazione', [
    'I dati restano finché l’albero o l’account esistono. L’eliminazione di un albero rimuove le persone e le relazioni collegate; la cancellazione dell’account può essere richiesta al titolare.'
  ]],
  ['I tuoi diritti', [
    'Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opposizione al trattamento, e proporre reclamo al Garante per la protezione dei dati personali.',
    'Per le persone defunte i diritti possono essere esercitati da chi ha un interesse proprio o agisce a tutela dell’interessato.'
  ]],
  ['Cookie e archiviazione locale', [
    'Non usiamo cookie di profilazione. Utilizziamo solo l’archiviazione locale del browser per la sessione di accesso e per le preferenze di visualizzazione: sono tecnicamente necessari al funzionamento.'
  ]]
];

const TERMS = [
  ['Oggetto', [
    'Questi termini regolano l’uso dell’applicazione “Genealogia di Famiglia”, che consente di creare, consultare e condividere alberi genealogici.'
  ]],
  ['Account', [
    'La registrazione richiede dati veritieri. L’accesso alle funzioni di modifica è subordinato all’approvazione da parte di un amministratore.',
    'Sei responsabile della custodia delle tue credenziali e delle attività svolte con il tuo account.'
  ]],
  ['Contenuti inseriti', [
    'Rimani responsabile dei dati che inserisci sulle persone: devi avere titolo per trattarli e devi rispettare la riservatezza dei viventi.',
    'È vietato inserire contenuti offensivi, diffamatori, illeciti o dati altrui raccolti senza legittimazione.',
    'Il proprietario dell’albero può approvare, rifiutare o rimuovere qualsiasi contenuto proposto.'
  ]],
  ['Dati sanitari', [
    'Le informazioni sulla salute sono una funzione riservata: non costituiscono diagnosi e la stima del rischio ereditario è puramente indicativa, di natura statistica, e non sostituisce in alcun caso una consulenza medica o genetica.'
  ]],
  ['Condivisione', [
    'I link di condivisione rendono l’albero accessibile secondo la visibilità impostata. Condividere un link di un albero riservato è una tua scelta e una tua responsabilità.'
  ]],
  ['Disponibilità e limitazione di responsabilità', [
    'Il servizio è fornito “così com’è”, senza garanzie di continuità o di assenza di errori. Ti invitiamo a mantenere una copia dei tuoi dati tramite la funzione di esportazione.',
    'Nei limiti consentiti dalla legge, il titolare non risponde di perdite di dati o danni indiretti derivanti dall’uso del servizio.'
  ]],
  ['Sospensione', [
    'Gli account che violano questi termini possono essere sospesi o rimossi, con eliminazione dei contenuti illeciti.'
  ]],
  ['Modifiche e legge applicabile', [
    'I termini possono essere aggiornati: l’uso continuato dell’app dopo la pubblicazione vale come accettazione. Si applica la legge italiana.'
  ]]
];

export default function LegalModal({ doc = 'privacy', onClose }) {
  const isPrivacy = doc === 'privacy';
  const sections = isPrivacy ? PRIVACY : TERMS;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container large legal-modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="flex-align gap-6">
            {isPrivacy ? <Shield size={18} /> : <FileText size={18} />}
            {isPrivacy ? 'Informativa sulla privacy' : 'Termini di servizio'}
          </h3>
          <button className="btn-icon" onClick={onClose} aria-label="Chiudi">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body legal-body">
          {sections.map(([title, paragraphs]) => (
            <section key={title}>
              <h4>{title}</h4>
              {paragraphs.map(text => <p key={text}>{text}</p>)}
            </section>
          ))}
          <p className="legal-updated">Ultimo aggiornamento: agosto 2026.</p>
        </div>
      </div>
    </div>
  );
}

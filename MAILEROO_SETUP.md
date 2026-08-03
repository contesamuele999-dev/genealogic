# Configurazione Maileroo

Mittente applicativo: `noreply@ugene.maileroo.app`.

## Invii dall'app

1. In Maileroo crea una Sending Key per `ugene.maileroo.app`.
2. Installa Supabase CLI e collega il progetto: `supabase link --project-ref PROJECT_REF`.
3. Salva la chiave senza inserirla nel repository: `supabase secrets set MAILEROO_API_KEY=CHIAVE`.
4. Pubblica la funzione: `supabase functions deploy send-email`.

La funzione accetta richieste solo da utenti Supabase autenticati e approvati.

## Email di autenticazione Supabase

In Supabase apri **Authentication → Email → SMTP Settings**, abilita SMTP personalizzato e inserisci le credenziali SMTP Relay mostrate da Maileroo per il dominio:

- Sender email: `noreply@ugene.maileroo.app`
- Sender name: `uGene`
- Host, porta, username e password: quelli forniti nella sezione SMTP Relay di Maileroo

In questo modo conferme account, recupero password e altre email di Supabase Auth passano anch'esse da Maileroo.

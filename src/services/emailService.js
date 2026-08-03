import { supabase, isSupabaseConfigured } from './supabaseClient';

export async function sendEmail({ to, subject, plain, html }) {
  if (!isSupabaseConfigured) throw new Error('L’invio email richiede Supabase configurato.');
  const recipients = (Array.isArray(to) ? to : String(to).split(','))
    .map(address => address.trim()).filter(Boolean);
  if (recipients.length === 0) throw new Error('Inserisci almeno un destinatario.');

  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { to: recipients, subject, plain, html }
  });
  if (error) throw new Error(error.message || 'Invio email non riuscito.');
  if (!data?.success) throw new Error(data?.message || 'Maileroo ha rifiutato il messaggio.');
  return data;
}


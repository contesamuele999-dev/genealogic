const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ success: false, message: 'Metodo non consentito.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authorization = request.headers.get('Authorization') ?? '';
    const mailerooKey = Deno.env.get('MAILEROO_API_KEY') ?? '';
    if (!mailerooKey) return json({ success: false, message: 'MAILEROO_API_KEY non configurata.' }, 500);

    // Impedisce che la funzione diventi un relay pubblico: solo utenti approvati.
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization },
    });
    if (!userResponse.ok) return json({ success: false, message: 'Autenticazione richiesta.' }, 401);
    const user = await userResponse.json();
    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=is_approved`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    const profiles = await profileResponse.json();
    if (!profiles?.[0]?.is_approved) return json({ success: false, message: 'Utente non approvato.' }, 403);

    const payload = await request.json();
    const recipients = (Array.isArray(payload.to) ? payload.to : []).map((address: string) => address.trim()).filter(Boolean);
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (recipients.length < 1 || recipients.length > 20 || recipients.some((address: string) => !emailPattern.test(address))) {
      return json({ success: false, message: 'Destinatari non validi (massimo 20).' }, 400);
    }
    if (!payload.subject?.trim() || payload.subject.length > 255 || (!payload.plain && !payload.html)) {
      return json({ success: false, message: 'Oggetto o contenuto non valido.' }, 400);
    }

    const mailerooResponse = await fetch('https://smtp.maileroo.com/api/v2/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': mailerooKey },
      body: JSON.stringify({
        from: { address: 'noreply@ugene.maileroo.app', display_name: 'uGene' },
        to: recipients.map((address: string) => ({ address })),
        subject: payload.subject.trim(),
        plain: payload.plain || undefined,
        html: payload.html || undefined,
        tracking: true,
        tags: { source: 'ugene-app' },
      }),
    });
    const result = await mailerooResponse.json().catch(() => ({}));
    if (!mailerooResponse.ok || result.success === false) {
      console.error('Maileroo error', mailerooResponse.status, result);
      return json({ success: false, message: result.message || 'Maileroo ha rifiutato il messaggio.' }, 502);
    }
    return json({ success: true, referenceId: result.data?.reference_id });
  } catch (error) {
    console.error(error);
    return json({ success: false, message: 'Errore interno durante l’invio.' }, 500);
  }
});


// Relais vers OpenRouter pour Samia.
//
// Seul un membre connecte de l'equipe peut l'utiliser : la session est relue
// aupres de Supabase Auth a chaque appel. Le serveur impose le modele et
// plafonne la longueur de la reponse : un appel ne peut ni choisir un modele
// plus cher, ni demander une reponse sans fin.
//
// La cle OpenRouter est un secret de la fonction (`OPENROUTER_KEY`), saisi
// dans le tableau de bord Supabase. Elle n'est jamais dans le code.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENROUTER_KEY = Deno.env.get('OPENROUTER_KEY') ?? '';

const MODELE = 'anthropic/claude-sonnet-4';
const JETONS_MAX = 4000;
const TAILLE_MAX = 15 * 1024 * 1024;   // une photo envoyee a Samia passe, pas plus

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function connectee(req: Request) {
  const jeton = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jeton || jeton === ANON_KEY) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${jeton}` },
  });
  return r.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode refusée' }, 405);

  // 401 : l'app renouvelle alors la session et reessaie une fois
  if (!(await connectee(req))) return json({ error: 'Session expirée. Reconnectez-vous.' }, 401);
  if (!OPENROUTER_KEY) return json({ error: 'Clé IA non configurée' }, 503);

  try {
    const texte = await req.text();
    if (texte.length > TAILLE_MAX) return json({ error: 'Message trop volumineux' }, 413);
    const body = JSON.parse(texte);
    if (!Array.isArray(body.messages) || !body.messages.length) {
      return json({ error: 'messages requis' }, 400);
    }

    const demande = parseInt(body.max_tokens, 10) || 2000;
    const appel: Record<string, unknown> = {
      model: MODELE,
      messages: body.messages,
      max_tokens: Math.min(Math.max(demande, 1), JETONS_MAX),
      stream: body.stream === true,
    };
    if (typeof body.temperature === 'number') {
      appel.temperature = Math.min(Math.max(body.temperature, 0), 1);
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://client.studio33.ma',
        'X-Title': 'Studio 33 Architects',
      },
      body: JSON.stringify(appel),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return json({ error: `OpenRouter error ${response.status}`, details: errText.slice(0, 200) },
        response.status === 401 ? 502 : response.status);
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    return json({ error: String((error as Error).message || error) }, 500);
  }
});

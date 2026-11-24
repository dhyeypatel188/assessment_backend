// Prints Gemini models that support the Live API (bidiGenerateContent).
// Usage: npm run models
require('dotenv').config();

(async () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return console.error('GEMINI_API_KEY is missing in backend/.env');

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${key}`);
  if (!res.ok) return console.error('API error:', res.status, (await res.text()).slice(0, 300));

  const { models = [] } = await res.json();
  const live = models.filter((m) => (m.supportedGenerationMethods || []).includes('bidiGenerateContent'));
  if (!live.length) return console.log('No Live-capable models found for this key.');

  console.log('Live-capable models (copy the part after "models/" into GEMINI_LIVE_MODEL):\n');
  for (const m of live) console.log(' ', m.name.replace('models/', ''));
})();

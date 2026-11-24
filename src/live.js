const { WebSocketServer } = require('ws');
const { GoogleGenAI, Modality } = require('@google/genai');
const { repo } = require('./db');

const MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';

const SYSTEM_INSTRUCTION =
  'You are a silent transcription assistant. The user speaks a mix of Hindi and English. ' +
  'Never reply. Do not speak.';

/**
 * WebSocket endpoint: /ws/transcribe
 *
 * Client -> server:
 *   binary frames : raw 16-bit PCM, mono, 16 kHz audio
 *   {"type":"stop"} : end the session (transcript is saved to the DB)
 *
 * Server -> client:
 *   {"type":"ready"}
 *   {"type":"transcript","text":"...","full":"..."}   (incremental text)
 *   {"type":"saved","record":{...}}
 *   {"type":"error","message":"..."}
 */
function attachLiveTranscription(server) {
  const wss = new WebSocketServer({ server, path: '/ws/transcribe' });

  if (!process.env.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY is not set - live transcription will be unavailable.');
  }
  const ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

  wss.on('connection', async (ws) => {
    const send = (obj) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(obj));

    if (!ai) {
      send({ type: 'error', message: 'Server is missing GEMINI_API_KEY' });
      return ws.close();
    }

    // Disable Nagle's algorithm so small audio/text frames are sent immediately.
    if (ws._socket) ws._socket.setNoDelay(true);

    let full = '';
    let session = null;
    let closing = false;

    async function finish() {
      if (closing) return;
      closing = true;
      try { session && session.close(); } catch (_) { /* ignore */ }
      const text = full.trim();
      if (text) {
        try {
          const record = await repo.create({ text, language: 'hi-en' });
          send({ type: 'saved', record });
        } catch (err) {
          console.error('DB save failed:', err);
          send({ type: 'error', message: 'Failed to save transcription' });
        }
      } else {
        send({ type: 'saved', record: null });
      }
      ws.close();
    }

    try {
      session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO], // native-audio models require AUDIO; we ignore it
          inputAudioTranscription: {},          // <- this is what gives us the text
          // Faster turn detection: react to speech start quickly and treat a short pause as the end.
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
              endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
              prefixPaddingMs: 20,
              silenceDurationMs: Number(process.env.VAD_SILENCE_MS) || 300,
            },
          },
          systemInstruction: SYSTEM_INSTRUCTION,
        },
        callbacks: {
          onopen: () => send({ type: 'ready' }),
          onmessage: (msg) => {
            const t = msg.serverContent && msg.serverContent.inputTranscription;
            if (t && t.text) {
              full += t.text;
              send({ type: 'transcript', text: t.text, full });
            }
          },
          onerror: (e) => {
            console.error('Gemini error:', e && e.message);
            send({ type: 'error', message: (e && e.message) || 'Gemini error' });
          },
          onclose: () => { if (!closing) finish(); },
        },
      });
    } catch (err) {
      console.error('Failed to connect to Gemini Live:', err);
      send({ type: 'error', message: 'Could not connect to Gemini Live: ' + err.message });
      return ws.close();
    }

    ws.on('message', (data, isBinary) => {
      if (closing) return;
      if (isBinary) {
        session.sendRealtimeInput({
          audio: { data: Buffer.from(data).toString('base64'), mimeType: 'audio/pcm;rate=16000' },
        });
        return;
      }
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'stop') {
          // Tell Gemini the audio stream ended so it flushes the last transcription,
          // then give it a moment before closing.
          try { session.sendRealtimeInput({ audioStreamEnd: true }); } catch (_) { /* ignore */ }
          setTimeout(finish, 800);
        }
      } catch (_) { /* ignore malformed text frames */ }
    });

    ws.on('close', () => { if (!closing) finish(); });
    ws.on('error', () => { /* handled by close */ });
  });

  return wss;
}

module.exports = { attachLiveTranscription };

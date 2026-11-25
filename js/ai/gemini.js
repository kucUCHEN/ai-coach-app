// Google Gemini（generateContent REST），瀏覽器直接呼叫
// 官方文件：https://ai.google.dev/gemini-api/docs/models
//           https://ai.google.dev/api/generate-content
//           https://ai.google.dev/gemini-api/docs/image-understanding
// 注意：Google 建議正式產品不要把 key 放在網頁；本作品只在展示手機上由老師輸入。

function aiError(kind, detail) {
  const e = new Error(String(detail || kind).slice(0, 200));
  e.kind = typeof kind === 'number' ? (kind === 401 || kind === 403 ? 'auth' : kind === 429 || kind === 402 ? 'quota' : kind >= 500 ? 'server' : 'bad') : kind;
  e.status = typeof kind === 'number' ? kind : 0;
  return e;
}
function splitDataUrl(u) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(u || '');
  return m ? { mime: m[1], data: m[2] } : { mime: 'image/jpeg', data: '' };
}

export const NAME = 'Gemini（Google）';
export const MODELS = [
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite（便宜、快，預設）' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash（比較聰明、比較貴）' },
];
export const DEFAULT_MODEL = MODELS[0].id;

function toParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  return content.map((p) => {
    if (p.type === 'image') {
      const { mime, data } = splitDataUrl(p.dataUrl);
      return { inlineData: { mimeType: mime, data } };
    }
    return { text: p.text };
  });
}

export async function call({ key, model, system, messages, schema, maxTokens = 600, signal }) {
  const m = encodeURIComponent(model || DEFAULT_MODEL);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((x) => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: toParts(x.content) })),
    generationConfig: { maxOutputTokens: maxTokens },
  };
  // JSON 模式：只要求回 JSON，欄位格式寫在提示裡（解析時再容錯）
  if (schema) body.generationConfig.responseMimeType = 'application/json';
  // 省錢：思考設最低。flash-lite 可用 minimal；3.8-flash 最低是 low
  body.generationConfig.thinkingConfig = { thinkingLevel: /lite/.test(m) ? 'minimal' : 'low' };

  let { res, data } = await send(key, m, body, signal);
  if (res.status === 400 && /think/i.test(data?.error?.message || '')) {
    delete body.generationConfig.thinkingConfig; // 不接受就拿掉再試一次
    ({ res, data } = await send(key, m, body, signal));
  }
  if (!res.ok) {
    const st = data?.error?.status;
    if (st === 'RESOURCE_EXHAUSTED') throw aiError('quota', data.error.message);
    if (st === 'PERMISSION_DENIED' || st === 'UNAUTHENTICATED' || /API key/i.test(data?.error?.message || '')) throw aiError('auth', data.error.message);
    throw aiError(res.status, data?.error?.message);
  }
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw aiError(data.promptFeedback?.blockReason ? 'refusal' : 'empty');
  return text;
}

async function send(key, m, body, signal) {
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
  } catch (e) { throw aiError(e?.name === 'AbortError' ? 'abort' : 'network', e); }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

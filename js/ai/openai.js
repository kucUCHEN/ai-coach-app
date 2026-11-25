// OpenAI（Responses API），瀏覽器直接呼叫
// 官方文件：https://developers.openai.com/api/docs/models
//           https://developers.openai.com/api/docs/guides/images-vision
//           https://developers.openai.com/api/docs/guides/structured-outputs
// 注意：OpenAI 官方建議 key 不要放在瀏覽器；本作品只在展示手機上由老師輸入，並請設花費上限。

function aiError(kind, detail) {
  const e = new Error(String(detail || kind).slice(0, 200));
  e.kind = typeof kind === 'number' ? (kind === 401 || kind === 403 ? 'auth' : kind === 429 || kind === 402 ? 'quota' : kind >= 500 ? 'server' : 'bad') : kind;
  e.status = typeof kind === 'number' ? kind : 0;
  return e;
}

export const NAME = 'ChatGPT（OpenAI）';
export const MODELS = [
  { id: 'gpt-6-luna', label: 'GPT-6 Luna（便宜、快，預設）' },
  { id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol（比較聰明、比較貴）' },
];
export const DEFAULT_MODEL = MODELS[0].id;

function toParts(role, content) {
  const textType = role === 'assistant' ? 'output_text' : 'input_text';
  if (typeof content === 'string') return [{ type: textType, text: content }];
  return content.map((p) => p.type === 'image'
    ? { type: 'input_image', image_url: p.dataUrl, detail: 'low' }
    : { type: textType, text: p.text });
}

export async function call({ key, model, system, messages, schema, maxTokens = 600, signal }) {
  const body = {
    model: model || DEFAULT_MODEL,
    instructions: system,
    input: messages.map((m) => ({ role: m.role, content: toParts(m.role, m.content) })),
    max_output_tokens: maxTokens,
    store: false,
  };
  if (schema) body.text = { format: { type: 'json_schema', name: 'food_estimate', strict: true, schema } };
  // 省錢：推理設最低。gpt-6-luna 可用 none；gpt-6.2-sol 不接受 none，用 low
  body.reasoning = { effort: /luna/.test(body.model) ? 'none' : 'low' };

  let { res, data } = await send(key, body, signal);
  if (res.status === 400 && /reasoning|effort/i.test(data?.error?.message || '')) {
    delete body.reasoning; // 這個模型不接受，拿掉再試一次
    ({ res, data } = await send(key, body, signal));
  }
  if (!res.ok) {
    const code = data?.error?.code;
    if (code === 'insufficient_quota') throw aiError('quota', data.error.message);
    throw aiError(res.status, data?.error?.message);
  }
  let text = typeof data.output_text === 'string' ? data.output_text : '';
  if (!text) {
    for (const item of data.output || []) {
      for (const c of item.content || []) {
        if (c.type === 'output_text') text += c.text;
        if (c.type === 'refusal') throw aiError('refusal');
      }
    }
  }
  if (!text) throw aiError('empty');
  return text;
}

async function send(key, body, signal) {
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
    });
  } catch (e) { throw aiError(e?.name === 'AbortError' ? 'abort' : 'network', e); }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// Anthropic Claude（Messages API），瀏覽器直接呼叫
// 官方文件：https://platform.claude.com/docs/en/api/messages/create
//           https://platform.claude.com/docs/en/build-with-claude/vision
//           https://platform.claude.com/docs/en/build-with-claude/structured-outputs

// 錯誤分類：給 index.js 判斷要顯示什麼原因（不包含 key）
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

export const NAME = 'Claude（Anthropic）';
export const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5（便宜、快，預設）' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5（比較聰明、比較貴）' },
];
export const DEFAULT_MODEL = MODELS[0].id;

function toParts(content) {
  if (typeof content === 'string') return content;
  return content.map((p) => {
    if (p.type === 'image') {
      const { mime, data } = splitDataUrl(p.dataUrl);
      return { type: 'image', source: { type: 'base64', media_type: mime, data } };
    }
    return { type: 'text', text: p.text };
  });
}

// opts: { key, model, system, messages:[{role, content}], schema?, maxTokens?, signal? }
export async function call({ key, model, system, messages, schema, maxTokens = 600, signal }) {
  const body = {
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens,
    system,
    messages: messages.map((m) => ({ role: m.role, content: toParts(m.content) })),
  };
  // 省錢：關掉 thinking、effort 設最低（官方：effort 頁 output_config.effort、thinking disabled）
  body.thinking = { type: 'disabled' };
  body.output_config = { effort: 'low' };
  if (schema) body.output_config.format = { type: 'json_schema', schema };

  let { res, data } = await send(key, body, signal);
  // 如果這個模型不接受省錢設定（400），拿掉再試一次
  if (res.status === 400 && /thinking|effort/i.test(data?.error?.message || '')) {
    delete body.thinking; delete body.output_config.effort;
    if (!body.output_config.format) delete body.output_config;
    ({ res, data } = await send(key, body, signal));
  }
  if (!res.ok) throw aiError(res.status, data?.error?.message);
  if (data.stop_reason === 'refusal') throw aiError('refusal');
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) throw aiError('empty');
  return text;
}

async function send(key, body, signal) {
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2026-10-21',
        // 允許從瀏覽器直接呼叫（CORS）。key 只存在這支手機。
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch (e) { throw aiError(e?.name === 'AbortError' ? 'abort' : 'network', e); }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

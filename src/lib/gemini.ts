import { AnalyzeResult } from './types';

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

function getSystemPrompt(): string {
  return `你是一個專門辨識菜單和餐點的AI助手。請從菜單照片或便當菜單中提取以下資訊，並以JSON格式回傳。

回傳格式：
{
  "restaurant": "餐廳/店家名稱",
  "items": [
    {
      "name": "品項名稱",
      "price": 價格數字,
      "quantity": 1
    }
  ],
  "totalAmount": 總金額
}

辨識規則：
- 餐廳名稱：從菜單標題、店名、招牌等辨識
- 品項：列出所有可辨識的餐點品項和價格
- 如果是便當菜單，列出每種便當的名稱和價格
- 如果無法辨識店名，填寫 "未知餐廳"
- 價格單位為新台幣 (NT$)
- totalAmount 為所有品項價格的合計

只回傳JSON，不要其他文字。`;
}

export async function analyzeMenu(
  imageBase64: string,
  mimeType: string = 'image/jpeg',
): Promise<AnalyzeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  let lastError: Error | null = null;

  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: getSystemPrompt() },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageBase64,
                },
              },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            topP: 0.8,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`Gemini ${model} failed:`, response.status, errBody);
        if (response.status === 429) {
          throw new Error('請求太頻繁，請等 30 秒再試');
        }
        throw new Error(`Gemini API error: ${response.status} (${model})`);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      if (!candidate) {
        throw new Error('Gemini 無回應，請重試');
      }

      if (candidate.finishReason === 'SAFETY') {
        throw new Error('圖片被安全過濾器擋住，請換一張照片');
      }

      const text = candidate.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Gemini 回傳空內容，請重試');
      }

      let result;
      try {
        result = JSON.parse(text);
      } catch {
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : text;
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('辨識失敗，請重新拍照');
        }
        result = JSON.parse(jsonMatch[0]);
      }

      return result as AnalyzeResult;
    } catch (error) {
      lastError = error as Error;
      if (lastError.message.includes('請求太頻繁')) throw lastError;
      continue;
    }
  }

  throw lastError || new Error('All Gemini models failed');
}

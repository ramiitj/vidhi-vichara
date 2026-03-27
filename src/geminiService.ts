import { GoogleGenAI, Modality } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY || (window as any).process?.env?.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API Key is not set. Please check your environment variables.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> {
  let delay = initialDelay;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const isRetryableError = 
        errorMessage.includes('429') || 
        errorMessage.includes('503') || 
        errorMessage.includes('RESOURCE_EXHAUSTED') || 
        errorMessage.includes('UNAVAILABLE') ||
        error?.status === 'RESOURCE_EXHAUSTED' || 
        error?.status === 'UNAVAILABLE' ||
        error?.code === 429 ||
        error?.code === 503;

      if (isRetryableError && i < maxRetries - 1) {
        console.warn(`API error (429/503) hit, retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  return await fn(); // Final attempt
}

export async function generateConstitutionImage(): Promise<string | null> {
  try {
    const response = await retryWithBackoff(() => getAI().models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: [
          {
            text: 'A rich, artistic representation of the Indian Constitution, elegant, historical, high quality.',
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        },
      },
    }));
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Failed to generate image", error);
    return null;
  }
}

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  if (!text || targetLanguage === 'English') return text;
  try {
    const response = await retryWithBackoff(() => getAI().models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: `Translate the following UI text to ${targetLanguage}. Provide ONLY the translated text, no explanations or quotes: "${text}"`,
    }));
    return response.text?.trim() || text;
  } catch (error) {
    console.error("Translation failed", error);
    return text;
  }
}

export async function generateTTS(text: string): Promise<string | null> {
  try {
    const response = await retryWithBackoff(() => getAI().models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    }));

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (error) {
    console.error("TTS error:", error);
    return null;
  }
}

export async function transcribeAudio(audioBytes: string, mimeType: string): Promise<string> {
  try {
    const response = await retryWithBackoff(() => getAI().models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: {
        parts: [
          { inlineData: { data: audioBytes, mimeType } },
          { text: "Transcribe this audio accurately. Output only the transcription." }
        ]
      }
    }));
    return response.text?.trim() || "";
  } catch (error) {
    console.error("Transcribe error:", error);
    return "";
  }
}

export async function ocrDocument(base64Data: string, mimeType: string): Promise<string> {
  try {
    const response = await retryWithBackoff(() => getAI().models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: 'Extract all text from this document accurately. Output only the extracted text.',
          },
        ],
      },
    }));
    return response.text?.trim() || "";
  } catch (error) {
    console.error("OCR error:", error);
    return "";
  }
}

export async function generateDocumentTitle(text: string): Promise<string> {
  if (!text) return "New Document";
  try {
    const response = await retryWithBackoff(() => getAI().models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: `Based on the following document text, generate a concise two-word title that captures its essence. Provide ONLY the two words, no punctuation or extra text: "${text.slice(0, 2000)}"`,
    }));
    return response.text?.trim() || "New Document";
  } catch (error) {
    console.error("Title generation failed", error);
    return "New Document";
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const embedResult = await retryWithBackoff(() => getAI().models.embedContent({
      model: 'gemini-embedding-2-preview',
      contents: texts
    }));
    return embedResult.embeddings?.map(e => e.values || []) || [];
  } catch (error) {
    console.error("Embedding error:", error);
    return [];
  }
}

export async function generateChatResponse(
  message: string, 
  history: any[], 
  ragContext: string, 
  systemPrompt: string, 
  language: string
): Promise<{ message: string, driftResult: any }> {
  try {
    const userContent = `${ragContext}\n\n[User Query]\n${message}`;
    const formattedHistory = (history || []).map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    let finalSystemPrompt = systemPrompt;
    if (language && language !== 'English') {
      finalSystemPrompt += `\n\nIMPORTANT: You are a native speaker of ${language}. You must think and respond naturally in ${language}, leveraging your deep understanding of its linguistic nuances, legal terminology in that language, and cultural context. Use the native script of ${language} for all responses.`;
    }
    finalSystemPrompt += "\n\nIMPORTANT: Do not use code blocks for your main narrative response. Format your narrative clearly as plain text with markdown. When performing drift analysis, embed a single JSON code block (```json ... ```) containing the complete structured analysis result with all 7 dimension scores, provision mappings, precedent citations, and all fields specified in the system prompt schema.";

    const response = await retryWithBackoff(() => getAI().models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        ...formattedHistory,
        { role: "user", parts: [{ text: userContent }] },
      ],
      config: {
        systemInstruction: finalSystemPrompt,
        temperature: 0.2,
        maxOutputTokens: 16384,
        topP: 0.95,
        tools: [{ googleSearch: {} }],
      },
    }), 4, 2000);

    let aiMessage = response.text || "I could not generate a response. Please try again.";
    let driftResult = null;
    let cleanMessage = aiMessage;

    try {
      // Try to extract JSON from markdown code block first
      const jsonMatch = aiMessage.match(/\`\`\`(?:json)?\n?([\s\S]*?)\n?\`\`\`/);
      if (jsonMatch && (jsonMatch[1].includes('"drift_score"') || jsonMatch[1].includes('"dimensions"') || jsonMatch[1].includes('"overall_score"'))) {
        try {
          driftResult = JSON.parse(jsonMatch[1]);
          cleanMessage = aiMessage.replace(jsonMatch[0], '').trim();
        } catch (e) {
          console.error("Failed to parse JSON from markdown block, falling back to regex search");
        }
      }

      // Fallback: search for raw JSON object with either new or legacy format markers
      if (!driftResult) {
        const start = aiMessage.search(/\{\s*"(?:instrument_profile|drift_score|dimensions)"/);
        if (start !== -1) {
          let end = aiMessage.lastIndexOf("}");
          while (end > start) {
            const jsonStr = aiMessage.slice(start, end + 1);
            try {
              driftResult = JSON.parse(jsonStr);
              cleanMessage = aiMessage.replace(jsonStr, '').trim();
              break;
            } catch (e) {
              end = aiMessage.lastIndexOf("}", end - 1);
            }
          }
          if (!driftResult) {
            console.error("Failed to parse JSON from response");
          }
        }
      }
    } catch (e) {
      // Not a drift response, that's fine
    }

    return { message: cleanMessage, driftResult };
  } catch (error) {
    console.error("Chat generation error:", error);
    throw error;
  }
}

export function cosineSimilarity(a: number[], b: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

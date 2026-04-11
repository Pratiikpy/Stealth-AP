import type { InvoiceExtraction } from "@/types";

const NVIDIA_NIM_URL =
  process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1";
const NVIDIA_NIM_KEY = process.env.NVIDIA_NIM_API_KEY || "";
const NVIDIA_NIM_MODEL = process.env.NVIDIA_NIM_MODEL || "moonshotai/kimi-k2.5";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-2.0-flash";

const EXTRACTION_PROMPT = `You are an expert invoice data extractor. Extract the following fields from this invoice image/PDF:

1. vendor_name — The company/person who sent the invoice
2. invoice_number — The invoice number/ID
3. amount — The subtotal amount (before tax) as a number
4. tax_amount — Tax amount as a number (0 if none)
5. due_date — Due date in YYYY-MM-DD format
6. issue_date — Invoice date in YYYY-MM-DD format
7. line_items — Array of items, each with: description, quantity, unit_price, total
8. po_number — Purchase order number if present (null if not)
9. currency — Currency code (USD, EUR, etc.)

For each field, also provide a confidence score from 0.0 to 1.0.

Respond in this exact JSON format (no markdown, no explanation):
{
  "vendor_name": "string or null",
  "invoice_number": "string or null",
  "amount": number or null,
  "tax_amount": number or null,
  "due_date": "YYYY-MM-DD or null",
  "issue_date": "YYYY-MM-DD or null",
  "line_items": [{"description": "string", "quantity": number, "unit_price_micro": number, "total_micro": number}],
  "po_number": "string or null",
  "currency": "string or null",
  "confidence": {"vendor_name": 0.95, "invoice_number": 0.98, "amount": 0.99, "tax_amount": 0.90, "due_date": 0.95, "issue_date": 0.92, "line_items": 0.85, "po_number": 0.70, "currency": 0.99}
}`;

function parseAIResponse(content: string): InvoiceExtraction {
  const jsonStr = content
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    return JSON.parse(jsonStr) as InvoiceExtraction;
  } catch {
    throw new Error("Failed to parse AI response as JSON");
  }
}

/**
 * Extract invoice data via NVIDIA NIM (primary)
 */
async function extractViaNvidia(
  fileBase64: string,
  mimeType: string
): Promise<InvoiceExtraction> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${NVIDIA_NIM_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NVIDIA_NIM_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: NVIDIA_NIM_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: EXTRACTION_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${fileBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA NIM error: ${response.status} — ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content in NVIDIA response");

    return parseAIResponse(content);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract invoice data via Gemini (fallback)
 */
async function extractViaGemini(
  fileBase64: string,
  mimeType: string
): Promise<InvoiceExtraction> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: EXTRACTION_PROMPT },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: fileBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} — ${errorText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("No content in Gemini response");

  return parseAIResponse(content);
}

/**
 * Extract invoice data with automatic fallback:
 * 1. NVIDIA NIM (primary, 15s timeout)
 * 2. Gemini (fallback)
 * 3. Error if both fail
 */
export async function extractInvoiceFromPdf(
  fileBase64: string,
  mimeType: string = "application/pdf"
): Promise<InvoiceExtraction> {
  // Try NVIDIA first (if configured)
  if (NVIDIA_NIM_KEY && !NVIDIA_NIM_KEY.includes("placeholder")) {
    try {
      return await extractViaNvidia(fileBase64, mimeType);
    } catch (nvidiaError) {
      // NVIDIA failed — fall through to Gemini
      console.log("[StealthAP] NVIDIA failed:", nvidiaError instanceof Error ? nvidiaError.message : nvidiaError);
    }
  }

  // Fallback to Gemini
  if (GEMINI_API_KEY) {
    return await extractViaGemini(fileBase64, mimeType);
  }

  throw new Error(
    "No AI provider configured. Set NVIDIA_NIM_API_KEY or GEMINI_API_KEY."
  );
}

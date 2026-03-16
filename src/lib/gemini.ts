import { type HealthMetrics } from "./healthConfig";

// Use v1beta for full multimodal + PDF inline_data support
// Use v1beta for full multimodal + PDF inline_data support
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Use a model supported by your API key (e.g. gemini-2.5-flash supports the same capabilities)
const GEMINI_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = `You are a medical lab report parser. Extract health metrics from the provided lab report document.

Return ONLY a single JSON object (no markdown, no explanation) with these exact numeric fields. Use null for any value not found:

{
  "fastingGlucose": <number in mg/dL or null>,
  "postMealGlucose": <number in mg/dL or null>,
  "systolicBP": <number in mmHg or null>,
  "diastolicBP": <number in mmHg or null>,
  "totalCholesterol": <number in mg/dL or null>,
  "hdl": <number in mg/dL or null>,
  "ldl": <number in mg/dL or null>,
  "heartRate": <number in bpm or null>,
  "hemoglobin": <number in g/dL or null>,
  "wbc": <number in cells/µL or null>,
  "rbc": <number in millions/µL or null>,
  "plateletCount": <number per µL or null>
}`;

export async function analyzeLabReportWithGemini(
    fileBase64: string,
    fileName: string,
    mimeType: string
): Promise<HealthMetrics> {
    const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        throw new Error(
            "API Key missing. Please add VITE_GEMINI_API_KEY to your .env file and restart the server."
        );
    }

    console.log(`[Gemini] Starting analysis: ${fileName} (${mimeType}, ~${Math.round(fileBase64.length * 0.75 / 1024)}KB)`);

    // Validate mime type is supported
    const supportedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!supportedTypes.includes(mimeType)) {
        throw new Error(`Unsupported file type: ${mimeType}. Please upload a PDF or image.`);
    }

    const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const requestBody = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: SYSTEM_PROMPT },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: fileBase64,
                        },
                    },
                    { text: `Extract all health metrics from this lab report file: "${fileName}". Return ONLY the JSON object.` },
                ],
            },
        ],
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
            maxOutputTokens: 1024,
        },
    };

    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });
    } catch (networkErr) {
        console.error("[Gemini] Network error:", networkErr);
        throw new Error("Network error: Could not reach Gemini API. Check your internet connection.");
    }

    if (!response.ok) {
        let errorMessage = `Gemini API error (${response.status})`;
        try {
            const errorData = await response.json();
            console.error("[Gemini] API error details:", JSON.stringify(errorData, null, 2));
            const msg = errorData?.error?.message || "";
            if (response.status === 400) {
                errorMessage = `Invalid request: ${msg || "Bad file format or the PDF may be too large. Try an image instead."}`;
            } else if (response.status === 403 || response.status === 401) {
                errorMessage = `Invalid API Key. Please check your VITE_GEMINI_API_KEY in .env`;
            } else if (response.status === 429) {
                errorMessage = "API quota exceeded. Please wait a moment and try again.";
            } else if (response.status === 500 || response.status === 503) {
                errorMessage = "Gemini API server error. Please try again in a moment.";
            } else {
                errorMessage = msg || errorMessage;
            }
        } catch {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log("[Gemini] Response received successfully.");

    let rawText: string | undefined =
        result?.candidates?.[0]?.content?.parts?.[0]?.text;

    // Check finish reason
    const finishReason = result?.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
        console.warn("[Gemini] Unexpected finishReason:", finishReason);
        if (finishReason === "SAFETY") {
            throw new Error("The file was blocked by Gemini safety filters. Please try a different file.");
        }
    }

    if (!rawText) {
        console.error("[Gemini] No content in response:", JSON.stringify(result, null, 2));
        throw new Error("Gemini returned an empty response. The file may be unreadable or unsupported.");
    }

    console.log("[Gemini] Raw text:", rawText.substring(0, 200));

    // Strip markdown code fences if present (fallback safety)
    if (rawText.includes("```json")) {
        rawText = rawText.split("```json")[1].split("```")[0].trim();
    } else if (rawText.startsWith("```")) {
        rawText = rawText.split("```")[1].split("```")[0].trim();
    }

    let metrics: Record<string, unknown>;
    try {
        metrics = JSON.parse(rawText);
    } catch (parseErr) {
        console.error("[Gemini] JSON parse failed. Raw text:", rawText);
        throw new Error(
            "Failed to parse AI response. The AI may not have found any medical data in the file."
        );
    }

    // Clean: keep only numeric values, discard nulls
    const cleaned: Record<string, number> = {};
    for (const [key, val] of Object.entries(metrics)) {
        if (val === null || val === undefined) continue;
        const num = typeof val === "number" ? val : parseFloat(String(val));
        if (!isNaN(num)) {
            cleaned[key] = num;
        }
    }

    console.log("[Gemini] Extracted metrics:", cleaned);

    if (Object.keys(cleaned).length === 0) {
        throw new Error(
            "No health metrics found in this file. Please ensure the file is a valid lab report."
        );
    }

    return cleaned as HealthMetrics;
}

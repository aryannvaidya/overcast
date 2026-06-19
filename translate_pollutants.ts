import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

const LANGUAGES = [
  { code: 'bn', name: 'Bengali' },
  { code: 'nl', name: 'Dutch' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Mandarin (Simplified Chinese)' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'es', name: 'Spanish' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ur', name: 'Urdu' },
  { code: 'vi', name: 'Vietnamese' }
];

const POLLUTANTS_TEXTS = [
  "Fine Particulates (PM2.5)",
  "Fine inhalable particles from combustion, smoke, and industrial emissions. They can go deep into lungs and bloodstreams.",
  "High risk of respiratory and cardiovascular issues upon long-term exposure.",

  "Coarse Particulates (PM10)",
  "Coarser dust, pollen, and mold particles that affect nasal and airway passageways.",
  "Can cause cough, respiratory irritation, and worsen asthma or lung infections.",

  "Carbon Monoxide (CO)",
  "Colorless, odorless gas primarily from heating and vehicle exhaust. Reduces oxygen delivery in body tissues.",
  "May trigger headaches, fatigue, dizziness, and compromised cardio-pulmonary transport.",

  "Nitrogen Dioxide (NO₂)",
  "Highly reactive gas from traffic exhaust. Strongly correlated to lower lung defenses and airway inflammation.",
  "Aggravates asthma, decreases infection vulnerability, and impairs lung function.",

  "Ground-Level Ozone (O₃)",
  "Formed through reactions of pollutants under hot sunlight. Strong gaseous irritant to eye/throat linings.",
  "Inhaling ozone triggers immediate chest tightness, throat irritation, and breathing discomfort."
];

async function translateKeysForLang(ai: GoogleGenAI, langName: string): Promise<Record<string, string>> {
  const prompt = `Translate each of the following pollutant details strings (air quality names, descriptions, and health effect hazard texts) into ${langName}.
Produce highly accurate, professional, medically and scientifically sound localized terms fitting a premium mobile weather app.
You must output a single, raw, parseable JSON object where the keys are EXACTLY the source English sentences below, and the values are the localized translations.
Absolutely no preamble, no markdown formatting (no \`\`\`json wrappers), no greetings.

Source Strings JSON:
${JSON.stringify(POLLUTANTS_TEXTS, null, 2)}`;

  let attempts = 0;
  while (attempts < 5) {
    try {
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      const cleanText = (res.text || '').trim().replace(/^```json/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleanText);
      return parsed;
    } catch (err: any) {
      attempts++;
      console.warn(`[Retry ${attempts}/5] Failed pollutant translation for ${langName}: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, attempts * 1000));
    }
  }
  return {};
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY is not set.");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  const outPath = path.join(process.cwd(), 'src/lib/pollutantTranslations.ts');
  let results: Record<string, Record<string, string>> = {};

  if (fs.existsSync(outPath)) {
    try {
      const existingContent = fs.readFileSync(outPath, 'utf-8');
      const jsonStart = existingContent.indexOf('{');
      const jsonEnd = existingContent.lastIndexOf('}') + 1;
      if (jsonStart !== -1 && jsonEnd !== -1) {
        results = JSON.parse(existingContent.slice(jsonStart, jsonEnd));
        console.log(`[Cache] Loaded ${Object.keys(results).length} existing languages.`);
      }
    } catch (e) {
      console.warn("Could not parse existing translations file.");
    }
  }

  const saveState = () => {
    const fileOutput = `// Zero-latency translations table for air pollutants descriptions and hazards in 20 languages.
export const pollutantTranslations: Record<string, Record<string, string>> = ${JSON.stringify(results, null, 2)};
`;
    fs.writeFileSync(outPath, fileOutput, 'utf-8');
    console.log(`[Progress] Saved state to ${outPath}`);
  };

  let translatedCount = 0;
  const MAX_NEW_TRANSLATIONS = 4;

  for (const lang of LANGUAGES) {
    if (results[lang.code] && Object.keys(results[lang.code]).length >= POLLUTANTS_TEXTS.length) {
      console.log(`[Cache HIT] Pollutant translations already completed for ${lang.name} (${lang.code}). Skipping.`);
      continue;
    }

    if (translatedCount >= MAX_NEW_TRANSLATIONS) {
      console.log(`\nReached maximum of ${MAX_NEW_TRANSLATIONS} translations per run. Exiting to allow incremental flow and avoid platform timeouts.`);
      process.exit(0);
    }

    console.log(`Translating ${lang.name} (${lang.code})...`);
    const trans = await translateKeysForLang(ai, lang.name);
    if (trans && Object.keys(trans).length > 0) {
      results[lang.code] = {
        ...(results[lang.code] || {}),
        ...trans
      };
      console.log(`  [Done] Localized ${lang.name}`);
      translatedCount++;
      saveState();
    }

    console.log("Waiting 1 second to respect Gemini API rate limits...");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`[Success] Written fully integrated pollutant translations to ${outPath}`);
}

main().catch(err => {
  console.error("Global script failure:", err);
  process.exit(1);
});

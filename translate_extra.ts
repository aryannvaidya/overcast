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

const KEYS_TO_TRANSLATE = [
  // Section Headers
  "Push alerts & summaries",
  "Threshold triggers",
  "General",
  "About",
  "Units",
  "Icons & Atmosphere",
  "Active Weather Cards",
  "Detailed Card Elements",
  
  // Toggle Row Titles
  "Enable push alerts",
  "Morning weather summary",
  "Night weather summary",
  "Rain threshold",
  "Snow threshold",
  "Thunderstorm alerts",
  "Severe weather alerts",
  "App Language",
  "Haptic feedback",
  "Tiles Customisation",
  "App version",
  "Data sources",
  "Terms of Service",
  "Privacy",
  
  // Toggle Row Descriptions
  "Get native reports on your device",
  "Get today's dynamic weather report delivered in the morning",
  "Get tomorrow's weather outlook delivered in the evening",
  "Requesting permission...",
  "Active & Synced with Cloud",
  "Permission Denied",
  "Subtle vibrations for buttons and scrolling",
  "Weather, alerts and environmental data sources",
  "Terms and conditions",
  "Privacy policy & data practices",
  "Threshold set to",
  "Currently disabled",
  "Type directly or use +/- for quick adjustment"
];

async function translateKeysForLang(ai: GoogleGenAI, langName: string): Promise<Record<string, string>> {
  const prompt = `Translate each of the following short application settings UI strings into ${langName}.
Produce accurate, natural localization matches that fit premium, high-contrast mobile applications.
You must output a single, raw, parseable JSON object where the keys are EXACTLY the source English sentences below, and the values are the localized translations.
Absolutely no preamble, no markdown formatting (no \`\`\`json wrappers), no greetings.

Source Strings JSON:
${JSON.stringify(KEYS_TO_TRANSLATE, null, 2)}`;

  let attempts = 0;
  while (attempts < 5) {
    try {
      const res = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt
      });
      const cleanText = (res.text || '').trim().replace(/^```json/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleanText);
      return parsed;
    } catch (err: any) {
      attempts++;
      console.warn(`[Retry ${attempts}/5] Failed extra translation for ${langName}: ${err.message}`);
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

  const extraPath = path.join(process.cwd(), 'src/lib/extraTranslations.ts');
  let currentExtra: any = {};

  if (fs.existsSync(extraPath)) {
    try {
      const existingFileContent = fs.readFileSync(extraPath, 'utf-8');
      const jsonStart = existingFileContent.indexOf('{');
      const jsonEnd = existingFileContent.lastIndexOf('}') + 1;
      if (jsonStart !== -1 && jsonEnd !== -1) {
        currentExtra = JSON.parse(existingFileContent.slice(jsonStart, jsonEnd));
        console.log(`[Cache] Loaded ${Object.keys(currentExtra).length} existing extra languages.`);
      }
    } catch (e) {
      console.warn("Could not parse existing extra translations file.");
    }
  }

  const saveState = () => {
    const fileOutput = `// Zero-latency translations table for Cities, Moon Phases, UV trend cards, and Settings across 20 languages.
export const extraTranslations: Record<string, Record<string, string>> = ${JSON.stringify(currentExtra, null, 2)};
`;
    fs.writeFileSync(extraPath, fileOutput, 'utf-8');
    console.log(`[Incremental Save] Synced latest progress to ${extraPath}`);
  };

  const chunkSize = 4;
  for (let i = 0; i < LANGUAGES.length; i += chunkSize) {
    const chunk = LANGUAGES.slice(i, i + chunkSize);
    
    // Check if we already have ALL of these translated
    const allChunkCached = chunk.every(lang => currentExtra[lang.code] && currentExtra[lang.code]["Push alerts & summaries"]);
    if (allChunkCached) {
      console.log(`Chunk containing ${chunk.map(l => l.name).join(', ')} already cached. Skipping.`);
      continue;
    }

    console.log(`\nProcessing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(LANGUAGES.length / chunkSize)}: ${chunk.map(l => l.name).join(', ')}...`);

    const chunkPromises = chunk.map(async (lang) => {
      if (currentExtra[lang.code] && currentExtra[lang.code]["Push alerts & summaries"]) {
        return { code: lang.code, trans: null };
      }
      console.log(` Translating ${lang.name} (${lang.code})...`);
      const trans = await translateKeysForLang(ai, lang.name);
      return { code: lang.code, trans };
    });

    const chunkResults = await Promise.all(chunkPromises);

    for (const res of chunkResults) {
      if (res.trans) {
        currentExtra[res.code] = {
          ...(currentExtra[res.code] || {}),
          ...res.trans
        };
        console.log(`  [Done] Merged ${langSymbol(res.code)} strings`);
      }
    }

    saveState();

    if (i + chunkSize < LANGUAGES.length) {
      console.log("Waiting 2 seconds to avoid limit triggers...");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`[Success] Wrote fully integrated settings translations to ${extraPath}`);
}

function langSymbol(code: string): string {
  return code.toUpperCase();
}

main().catch(err => {
  console.error("Global script failure:", err);
  process.exit(1);
});

#!/usr/bin/env node
// יצירת תמונות נושא (themes) באמצעות Gemini image API ("nano banana").
// שימוש:  GEMINI_API_KEY=... node resources/themes/generate-images.mjs [theme...]
// ברירת מחדל: מייצר עבור 4pharma ו-friends. ה-theme 'seach' משתמש בנכסים הקיימים.
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
if (!KEY) { console.error('Missing GEMINI_API_KEY'); process.exit(1); }

// כל נכס: שם קובץ + פרומפט
const THEMES = {
  '4pharma': [
    { file: 'logo.png', prompt: 'A modern minimalist emblem logo for a pharmacy-themed football prediction league named "Pharma Cup 2026". A soccer ball elegantly fused inside a clean six-pointed Star of David (Magen David), flat vector style, teal and white palette, centered on a solid dark teal background filling the whole frame (hex #10242b, not transparent), crisp professional healthcare branding, no text, no cross.' },
    { file: 'bg1.png', prompt: 'A clean, light, uncluttered background texture for a pharmacy sports web app. Soft teal-to-mint gradient with a very subtle repeating medical-cross pattern and faint soccer pitch line markings, calm and professional, plenty of light negative space so dark text remains readable, high resolution.' },
    { file: 'bg2.png', prompt: 'A calm abstract background for a medical sports dashboard. Pale mint and soft white with delicate molecule and pill silhouettes blended with subtle hexagon pitch patterns, minimal, light, lots of breathing room, high resolution.' }
  ],
  'friends': [
    { file: 'logo.png', prompt: 'A fun, playful emblem logo for a friends football prediction league named "Friends Cup 2026". A lively soccer ball surrounded by confetti and a warm group vibe, bold flat vector style, vibrant purple, orange and pink palette, centered on a white background, energetic and cheerful, no text.' },
    { file: 'bg1.png', prompt: 'A vibrant, playful background for a social football app. Smooth purple-to-orange gradient with scattered confetti, soccer balls and party shapes, energetic but soft enough that overlaid text stays readable, high resolution.' },
    { file: 'bg2.png', prompt: 'A cheerful festive background, warm sunset gradient of pink, orange and purple with subtle bokeh lights, confetti and soccer motifs, party atmosphere, soft enough for text overlay, high resolution.' }
  ]
};

async function generate(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  const body = { contents: [{ parts: [{ text: prompt }] }] };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const parts = j.candidates?.[0]?.content?.parts || [];
  const img = parts.find(p => p.inlineData);
  if (!img) throw new Error('No image in response: ' + JSON.stringify(parts).slice(0, 200));
  return Buffer.from(img.inlineData.data, 'base64');
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(THEMES);
for (const theme of targets) {
  const assets = THEMES[theme];
  if (!assets) { console.warn(`skip unknown theme ${theme}`); continue; }
  const dir = join(__dirname, theme);
  mkdirSync(dir, { recursive: true });
  for (const a of assets) {
    process.stdout.write(`[${theme}] ${a.file} … `);
    try {
      const buf = await generate(a.prompt);
      writeFileSync(join(dir, a.file), buf);
      console.log(`ok (${Math.round(buf.length / 1024)} KB)`);
    } catch (e) {
      console.log('FAILED: ' + e.message);
    }
  }
}
console.log('done');

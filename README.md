# Kapom PromptPack

Pack the files you care about into a single markdown prompt, ready to paste into AiPASS, ChatGPT, Claude, Gemini, or a local Ollama model.

Copying source files into an AI chat one at a time is slow, and it is easy to forget the one file that mattered. The answer comes back wrong, you ask again, and on a metered plan every retry costs you.

> 🚧 **Work in progress** — no release yet.

## Why it exists

Thailand's TH-AI Passport programme hands out a year of Pro-tier AI access through a platform called AiPASS. It has no public API and a daily quota, so every wasted round trip is expensive. This extension is built for that constraint, but nothing in it is tied to AiPASS — the output is plain markdown that works in any chat.

## Design notes

- **Provider-agnostic.** Clipboard is just the first transport behind a provider interface.
- **The goal is sending the *right* files, not every file.**
- **The secret guard is a requirement, not a nice-to-have.** It is the last stage of the pipeline and it overrides what you selected. Files that look like credentials never make it into the payload.

## License

MIT

---

## ภาษาไทย

รวบไฟล์ที่เกี่ยวข้องในโปรเจกต์ให้เป็น markdown prompt ก้อนเดียว พร้อมคัดลอกไปวางในเว็บ AI — AiPASS, ChatGPT, Claude, Gemini หรือ Ollama

แก้ปัญหาการเปิดไฟล์ copy ทีละอันไปถาม AI ซึ่งช้า มักลืมไฟล์ที่เกี่ยวข้อง ทำให้ AI ตอบไม่ตรงแล้วต้องถามซ้ำ — ซึ่งเปลือง quota ที่มีจำกัดของ TH-AI Passport

**หลักการ:** ไม่ผูกกับ AiPASS (เอาไปวางที่ไหนก็ได้) · เป้าหมายคือส่งไฟล์ที่ถูกต้องไม่ใช่ส่งทุกไฟล์ · secret guard เป็นด่านสุดท้ายเสมอและ override การเลือกของผู้ใช้ ไฟล์ที่เข้าข่ายความลับจะไม่หลุดไปกับ prompt

> 🚧 ยังพัฒนาไม่เสร็จ ยังไม่มี release

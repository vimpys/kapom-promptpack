# Kapom PromptPack

Pack the files you care about into a single markdown prompt, ready to paste into AiPASS, ChatGPT, Claude, Gemini, or a local Ollama model.

Copying source files into an AI chat one at a time is slow, and it is easy to forget the one file that mattered. The answer comes back wrong, you ask again, and on a metered plan every retry costs you.

## Use it

1. Select files or a folder in the Explorer.
2. Right click → **Pack Selected Files**, or run `Kapom PromptPack: Pack Selected Files` from the Command Palette.
3. Paste into the chat.

The status bar shows what the last pack cost in tokens.

## What lands in the prompt

````markdown
# Project overview

- Workspace: my-app
- Files attached: 3
- Estimated tokens: 1,240

# Files included

- `src/composables/useAuth.ts`
- `src/stores/auth.ts`

---

## src/composables/useAuth.ts

```ts
export function useAuth() { /* ... */ }
```
````

Paths stay relative to the workspace, the fence is always longer than any backticks inside the file, and the language tag follows the extension.

## Credentials do not travel with it

The secret guard is the last stage before the prompt is assembled, and it overrides your selection rather than trusting it.

- Files named like secrets — `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `secrets*`, `credentials*`, `id_rsa` — are left out even if you picked them by hand.
- Credentials found inside ordinary files are masked in place: `apiKey: "<REDACTED:assigned-secret>"`. The key survives so the model still knows the setting exists, and the line count never changes, so any line the model quotes back still matches your file.
- Covered shapes include AWS, OpenAI, GitHub, Google and Slack keys, JWTs, database and http connection strings, `Bearer` and `Basic` headers, and assignments such as `DJANGO_SECRET_KEY`, `db_password` or `dbPassword`.
- Absolute paths inside file contents are rewritten, so the account name in `C:\Users\<name>` does not travel with the prompt.
- Anything masked or dropped is listed at the bottom of the prompt and in the notification.

**Not covered yet:** personal data. National ID numbers, phone numbers, email addresses and customer names are *not* detected. Review before sending anything built from customer data.

By default the prompt opens for review before it reaches the clipboard whenever something was masked, something was dropped, or the payload is large. Once it is pasted it cannot be recalled.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `includeExtensions` | ts, tsx, vue, js, jsx, json, css, scss, sql, cs, md | Extensions to include. Empty allows everything. |
| `ignorePatterns` | node_modules, dist, build, out, coverage, .git | Names or globs to skip, matched per path segment. |
| `respectGitignore` | `true` | Skip what the workspace `.gitignore` excludes. |
| `maxFileSizeKb` | `200` | Skip larger files. `0` disables. |
| `tokenWarningThreshold` | `100000` | Warn past this size. `0` disables. |
| `secretGuard.enabled` | `true` | Scan file contents. The deny list runs either way. |
| `secretGuard.mode` | `redact` | `redact` masks values; `skipFile` drops the whole file. |
| `secretGuard.extraPatterns` | `[]` | Extra regular expressions to mask. |
| `previewBeforeCopy` | `onWarning` | `always`, `onWarning` or `never`. |
| `scrubAbsolutePaths` | `true` | Rewrite absolute paths inside file contents. |
| `outputLanguage` | `th` | Heading language in the generated prompt. |

## Known limits

- Only the workspace-root `.gitignore` is read; nested ones in a monorepo are not.
- Token counts use a `chars / 4` estimate, which runs low for Thai text.
- Personal data is not detected — see above.

## Why it exists

Thailand's TH-AI Passport programme hands out a year of Pro-tier AI access through a platform called AiPASS. It has no public API and a daily quota, so every wasted round trip is expensive. This extension is built for that constraint, but nothing in it is tied to AiPASS — the output is plain markdown that works in any chat.

## License

MIT

---

## ภาษาไทย

รวบไฟล์ที่เกี่ยวข้องในโปรเจกต์ให้เป็น markdown prompt ก้อนเดียว พร้อมคัดลอกไปวางในเว็บ AI — AiPASS, ChatGPT, Claude, Gemini หรือ Ollama

แก้ปัญหาการเปิดไฟล์ copy ทีละอันไปถาม AI ซึ่งช้า มักลืมไฟล์ที่เกี่ยวข้อง ทำให้ AI ตอบไม่ตรงแล้วต้องถามซ้ำ — ซึ่งเปลือง quota ที่มีจำกัดของ TH-AI Passport

### วิธีใช้

เลือกไฟล์หรือโฟลเดอร์ใน Explorer → คลิกขวา → **Pack Selected Files** → วางในแชท (หรือเรียกจาก Command Palette) ดู token ของครั้งล่าสุดได้ที่ status bar

### ความลับไม่หลุดไปกับ prompt

ตัวกรองความลับเป็น**ด่านสุดท้ายเสมอ และ override การเลือกของผู้ใช้** — ไฟล์อย่าง `.env`, `*.pem`, `*.key`, `credentials*` ถูกตัดออกแม้คุณจะคลิกเลือกเอง ส่วนความลับที่ปนอยู่ในไฟล์ปกติจะถูกปิดค่าเฉพาะจุด (`apiKey: "<REDACTED:assigned-secret>"`) โดย**ชื่อ key ยังอยู่และจำนวนบรรทัดไม่เปลี่ยน** เลขบรรทัดที่ AI อ้างถึงจึงตรงกับไฟล์จริง

absolute path ในเนื้อไฟล์ถูกลบด้วย ชื่อ user ใน `C:\Users\<ชื่อ>` จะไม่ติดไปกับ prompt

> ⚠️ **ยังไม่ครอบคลุมข้อมูลส่วนบุคคล** — เลขบัตรประชาชน เบอร์โทร อีเมล ชื่อ-ที่อยู่ลูกค้า **ยังไม่ถูกตรวจจับ** ถ้าจะแพ็คไฟล์ที่มีข้อมูลลูกค้า กรุณาตรวจเองก่อนส่งทุกครั้ง

โดย default prompt จะเปิดให้ตรวจก่อนเข้า clipboard เมื่อมีการปิดค่า มีไฟล์ถูกตัดออก หรือ payload ใหญ่เกินเกณฑ์ — **เพราะเมื่อวางไปแล้วเรียกคืนไม่ได้**

### ข้อจำกัดที่รู้อยู่

อ่าน `.gitignore` เฉพาะที่ root ของ workspace (monorepo ที่มี `.gitignore` ซ้อนยังไม่รองรับ) · ประเมิน token ด้วย `chars / 4` ซึ่งต่ำกว่าจริงสำหรับข้อความไทย · ยังไม่ตรวจจับข้อมูลส่วนบุคคล

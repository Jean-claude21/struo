# 015 — Voice notes

**Branch**: `015-voice` · **Status**: delivered

## What it delivers

- Field app: record a voice note (up to 3 minutes, compressed opus/mp4 at 32 kbit/s) on the observation step; it travels in the outbox with the report, offline included.
- Server: the note is stored with the report (`site_report.audio_*`, migration 0007), then transcribed after the answer is sent (OpenAI speech-to-text through the `Transcriber` port, in the company's language).
- Office: an audio player and the transcript (or its status) on every report card; MCP `field.list_reports` returns the transcript.

## Acceptance and proof

- A report with a note keeps it, the transcript is recorded later, another company cannot reach the note (`business.test.ts`).
- Without `OPENAI_API_KEY` the note stays audio-only: no invented text.

## Constitution check

II port + adapter + fallback · III RLS (same table, same policy) · VI built for the field (offline outbox) · VII fr/en.

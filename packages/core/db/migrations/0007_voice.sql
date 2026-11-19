-- Voice notes (spec 015): a field report may carry one recorded note, stored as a file and
-- transcribed later (when a transcription service is configured). Same table, same policy.
alter table site_report
  add column audio_key text,
  add column audio_media_type text check (audio_media_type ~ '^audio/[a-z0-9.+-]+$'),
  add column audio_size_bytes integer check (audio_size_bytes > 0 and audio_size_bytes <= 26214400),
  add column transcript text check (length(transcript) <= 20000),
  add column transcript_status text not null default 'none'
    check (transcript_status in ('none', 'pending', 'done', 'failed'));

# Technical docs

This folder is written for developers working on the codebase, not for
students using the app. If you just want to know what the app does and how
to run it, the main [README](../README.md) covers that.

These pages are organized by mechanism, not by feature. Several features
share the same underlying machinery, the single model route, the JSON
repair logic, the offline guarantee, and writing that up once here, with
feature pages linking back to it, keeps the explanation from drifting out
of sync across five different places as the code changes.

- **[Model integration](model-integration.md)**, how every feature talks
  to the model: the single `/api/llm` route, route tags, prompt design,
  the language-switching approach, JSON parsing and repair, and the cloud
  fallback.
- **[Data model](data-model.md)**, the schema, why it's shaped the way it
  is, and the reasoning behind a few fields that aren't self-explanatory
  from the field name alone.
- **[Offline guarantees](offline-guarantees.md)**, what "runs offline"
  actually means in this app and how it's verified rather than assumed.
- **[Windows setup](windows-setup.md)**, the PowerShell-specific gotchas
  in `bootstrap.ps1`/`setup.ps1` that aren't obvious unless you've already
  hit them on real Windows hardware.
- **Features**, short pages on what's specific to each feature, after
  reading the mechanism pages above:
  - [Study mode](features/study.md)
  - [Notes](features/notes.md)
  - [Past questions and CBT](features/past-questions.md) (including the
    PDF-to-CBT upload pipeline)
  - [Chat](features/chat.md)

Two more pages already existed before this set and are still worth
reading: [`AUDIO_FINDING.md`](AUDIO_FINDING.md) on why voice input uses
Ollama's OpenAI-compatible endpoint instead of its native one, and
[`hausa-eval.md`](hausa-eval.md), raw results from a 30-prompt Hausa/English
evaluation run against the real local model.

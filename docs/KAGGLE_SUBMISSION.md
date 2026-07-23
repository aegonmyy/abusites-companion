<!--
This is the actual ~283-word text pasted into Kaggle's Writeup form
(Inspiration / How we built it / The Prototype / Challenges), not the full
writeup — see docs/KAGGLE_WRITEUP.md for that. Kept here as the source of
truth so edits don't only live in chat history.
-->

## 🚀 Inspiration

Students in Hausa-speaking Northern Nigeria deal with expensive mobile data and patchy connectivity, exactly when exam week hits hardest, in a hostel room, on a bus, with no signal. Cloud-only study apps fail at the exact moment they'd matter most. English-only tools also miss how these students actually think, they mix Hausa and English naturally, not one or the other. ABUsites Companion removes both dependencies at once: zero connection required after setup, and Hausa output when that's genuinely more comfortable, not a bolted-on translation layer.

## 🛠️ How we built it

Runs on `gemma4:e2b`, entirely local via Ollama, with an opt-in Google AI Studio fallback for weaker hardware, same UI either way. No RAG, no fine-tuning, this is pure prompt engineering: every feature (syllabus, tutoring, notes, quizzes, chat) gets its own purpose-built system prompt through a single inference route. Not a Python ML stack, no Transformers, no Keras, Gemma runs entirely via Ollama's own server; the app is Next.js, TypeScript, Prisma/SQLite. Bilingual Hausa/English output adapts live to whatever the student actually types, mid-conversation.

## 🎥 The Prototype

Demo video: https://youtu.be/T0aZSoMK1go
Code: github.com/aegonmyy/abusites-companion
Full writeup: github.com/aegonmyy/abusites-companion/blob/main/docs/KAGGLE_WRITEUP.md
Technical docs: github.com/aegonmyy/abusites-companion/blob/main/docs/README.md

## 🧗 Challenges we ran into

Mid-conversation language switching was the hardest problem: a student switching from English to Hausa, or back, needs the reply to switch too. Asking the model to detect this itself failed constantly, every wording fixed one direction while breaking the other, 5/5 times. The fix was architectural: the app detects the language itself and gives a direct command instead of a question. Same root issue elsewhere: real Hausa instead of Pidgin needed naming actual Hausa function words, not a vague "code-switch naturally" instruction. "Offline" was verified with an automated audit, not assumed.

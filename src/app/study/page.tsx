import StudyIntakeForm from "./StudyIntakeForm";

// Ported from the earlier reference design's app/study-mode/page.tsx (the glass panel wrapper).
// requireActiveUser is dropped — no auth, single implicit local user.
//
// No width constraint or card wrapper here — StudyIntakeForm owns that
// itself now, applied only around the intake form (a form doesn't benefit
// from full width). Once a syllabus is open, StudyIntakeForm returns
// SyllabusView directly with no cap, so the tutor/chat view can actually
// use the space this page has, rather than being stuck inside a max-w-3xl
// card meant for a form it's no longer showing (a real bug: this page used
// to wrap SyllabusView in that same max-w-3xl card too).
export const dynamic = "force-dynamic";

export default function StudyModePage() {
  return (
    <div className="min-h-dvh px-6 py-12">
      <StudyIntakeForm />
    </div>
  );
}

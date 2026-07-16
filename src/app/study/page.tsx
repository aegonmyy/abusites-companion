import StudyIntakeForm from "./StudyIntakeForm";

// Ported from Grinnish's app/study-mode/page.tsx (the glass panel wrapper).
// requireActiveUser is dropped — no auth, single implicit local user.
export const dynamic = "force-dynamic";

export default function StudyModePage() {
  return (
    <div className="min-h-screen px-6 py-12">
      <div className="card-deep card-deep-glow mx-auto w-full max-w-3xl rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-semibold">Study mode</h1>
        <div className="mt-6">
          <StudyIntakeForm />
        </div>
      </div>
    </div>
  );
}

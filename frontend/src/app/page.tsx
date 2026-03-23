export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-900 p-8">
      <div className="max-w-4xl text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-blue-600 mb-6">
          Welcome to CognifyAI
        </h1>
        <p className="text-xl text-gray-600 mb-10 leading-relaxed">
          An AI-powered personalized learning platform that adapts content to your learner type, generates concept-aware quizzes, and provides truth-validated explanations.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="/dashboard"
            className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg shadow-lg hover:bg-blue-700 transition"
          >
            Go to Dashboard
          </a>
          <button className="px-8 py-4 bg-white text-blue-600 font-semibold border border-blue-200 rounded-lg shadow hover:bg-gray-50 transition">
            Learn More
          </button>
        </div>
      </div>
    </main>
  );
}

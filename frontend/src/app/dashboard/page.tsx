export default function DashboardPage() {
  return (
    <div className="min-h-screen p-8 bg-gray-50 text-gray-900">
      <header className="mb-8">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">CognifyAI Dashboard</h1>
        <p className="text-gray-500 mt-2">Welcome back! Let's continue your adaptive learning journey.</p>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-2">My Learning Style</h2>
          <p className="text-sm text-gray-600 mb-4">You are currently set to <span className="font-bold text-blue-600">Visual</span> learning mode.</p>
          <button className="text-sm text-blue-500 hover:underline">Change Style</button>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-2">Recent Topics</h2>
          <ul className="text-sm text-gray-600 space-y-2">
            <li>• Transport vs Application Layer</li>
            <li>• UDP vs TCP Protocols</li>
          </ul>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-2">Learning Analytics</h2>
          <p className="text-sm text-gray-600 mb-4">You have a 72% concept mastery track record.</p>
          <button className="w-full py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition">View Details</button>
        </div>
      </div>
    </div>
  );
}

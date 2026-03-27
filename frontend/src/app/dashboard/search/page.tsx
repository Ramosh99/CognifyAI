"use client";
import { useState } from "react";
import { searchDocuments, SearchResult } from "@/lib/api";

export default function SearchPage() {
  const [query, setQuery]       = useState("");
  const [topic, setTopic]       = useState("");
  const [topK, setTopK]         = useState(5);
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError]       = useState("");

  const search = async () => {
    if (!query.trim()) { setError("Please enter a query."); return; }
    setLoading(true); setError(""); setSearched(false);
    try {
      const res = await searchDocuments({ query, top_k: topK, filter_topic: topic || null });
      setResults(res.results);
      setSearched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (s: number) =>
    s > 0.8 ? "var(--accent-success)" : s > 0.6 ? "var(--accent-1)" : "var(--text-muted)";

  return (
    <div style={{ maxWidth: "800px" }}>
      <h1>Search Knowledge Base</h1>
      <p style={{ marginTop: "0.4rem", marginBottom: "2rem" }}>
        Semantically search your ingested documents. Results are ranked by cosine similarity.
      </p>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2rem" }}>
        <div>
          <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>
            Search query
          </label>
          <input
            className="input"
            placeholder="e.g. How does TCP ensure reliable delivery?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "1rem", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>
              Filter by topic <span style={{ color: "var(--text-muted)" }}>(optional)</span>
            </label>
            <input className="input" placeholder="e.g. networking" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>Top K</label>
            <select className="input" style={{ width: "80px" }} value={topK} onChange={(e) => setTopK(Number(e.target.value))}>
              {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={search} disabled={loading}>
            {loading ? <><span className="spinner" /> Searching...</> : "🔍 Search"}
          </button>
        </div>

        {error && <div className="feedback-box error">{error}</div>}
      </div>

      {/* Results */}
      {searched && (
        <div className="fade-up">
          <h2 style={{ marginBottom: "1rem" }}>
            {results.length ? `${results.length} results for "${query}"` : "No results found"}
          </h2>

          {!results.length && (
            <div className="feedback-box info">
              No matching chunks found. Try a different query or make sure you have ingested documents on this topic.
            </div>
          )}

          {results.map((r, i) => (
            <div key={i} className="card fade-up" style={{ marginBottom: "1rem", animationDelay: `${i * 0.04}s` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {r.topic && <span className="badge badge-blue">{r.topic}</span>}
                  {r.source && <span className="badge" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>{r.source}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <div className="progress-bar-bg" style={{ width: "80px" }}>
                    <div className="progress-bar-fill" style={{ width: `${r.score * 100}%` }} />
                  </div>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: scoreColor(r.score) }}>
                    {(r.score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <p style={{ fontSize: "0.875rem", lineHeight: 1.7, color: "var(--text-primary)" }}>
                {r.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

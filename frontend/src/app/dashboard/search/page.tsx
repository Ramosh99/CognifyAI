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
    <div style={{ maxWidth: "780px" }}>
      <h1>Search</h1>
      <p style={{ marginTop: "0.3rem", marginBottom: "2rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
        Semantically search your ingested documents by cosine similarity.
      </p>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "2rem" }}>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Query
          </label>
          <input
            className="input"
            placeholder="e.g. How does TCP ensure reliable delivery?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.85rem", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Topic filter
            </label>
            <input className="input" placeholder="e.g. networking" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Top K</label>
            <select className="input" style={{ width: "72px" }} value={topK} onChange={(e) => setTopK(Number(e.target.value))}>
              {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={search} disabled={loading}>
            {loading ? <><span className="spinner" /> Searching...</> : "Search"}
          </button>
        </div>

        {error && <div className="feedback-box error">{error}</div>}
      </div>

      {/* Results */}
      {searched && (
        <div className="fade-up">
          <h2 style={{ marginBottom: "1rem", fontSize: "1rem" }}>
            {results.length ? `${results.length} results` : "No results"}
          </h2>

          {!results.length && (
            <div className="feedback-box info">
              No matching chunks found. Try a different query or ingest documents on this topic.
            </div>
          )}

          {results.map((r, i) => (
            <div key={i} className="card fade-up" style={{ marginBottom: "0.6rem", animationDelay: `${i * 0.04}s` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  {r.topic && <span className="badge badge-blue">{r.topic}</span>}
                  {r.source && <span className="badge" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-muted)" }}>{r.source}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <div className="progress-bar-bg" style={{ width: "60px" }}>
                    <div className="progress-bar-fill" style={{ width: `${r.score * 100}%` }} />
                  </div>
                  <span style={{ fontSize: "0.72rem", fontWeight: 600, color: scoreColor(r.score) }}>
                    {(r.score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <p style={{ fontSize: "0.825rem", lineHeight: 1.7, color: "var(--text-primary)" }}>
                {r.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

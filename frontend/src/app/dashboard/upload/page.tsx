"use client";
import { useState, useRef, DragEvent } from "react";
import Link from "next/link";
import { ingestText, ingestFile } from "@/lib/api";

type Mode = "file" | "text";
type Status = { type: "success" | "error"; msg: string; topic?: string } | null;

export default function UploadPage() {
  const [mode, setMode]         = useState<Mode>("file");
  const [text, setText]         = useState("");
  const [topic, setTopic]       = useState("");
  const [source, setSource]     = useState("");
  const [file, setFile]         = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState<Status>(null);
  const fileRef                 = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const submit = async () => {
    setLoading(true);
    setStatus(null);
    const resolvedTopic = topic.trim() || (file ? file.name.replace(/\.[^/.]+$/, "") : "Ingested Material");

    try {
      let res;
      if (mode === "text") {
        if (!text.trim()) throw new Error("Please enter some text.");
        res = await ingestText({ text, topic: topic || undefined, source: source || undefined });
      } else {
        if (!file) throw new Error("Please select a file.");
        res = await ingestFile(file, topic || undefined);
      }
      setStatus({
        type: "success",
        msg: `${res.message} (${res.chunks_stored} chunks stored)`,
        topic: resolvedTopic,
      });
      setText("");
      setFile(null);
      setTopic("");
      setSource("");
    } catch (e: unknown) {
      setStatus({ type: "error", msg: `${e instanceof Error ? e.message : "Something went wrong"}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "780px", width: "100%" }}>
      <h1>Upload</h1>
      <p style={{ marginTop: "0.3rem", marginBottom: "2rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
        Ingest a PDF, TXT file, or paste raw text into the knowledge base.
      </p>

      {/* Mode Toggle */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
        {(["file", "text"] as Mode[]).map((m) => (
          <button
            key={m}
            className={`btn ${mode === m ? "btn-primary" : "btn-outline"}`}
            onClick={() => setMode(m)}
          >
            {m === "file" ? "File Upload" : "Paste Text"}
          </button>
        ))}
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
        {mode === "file" ? (
          <div
            className={`drop-zone ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.pdf"
              style={{ display: "none" }}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div>
                <p style={{ color: "var(--text-primary)", fontWeight: 500, fontSize: "0.9rem" }}>{file.name}</p>
                <p style={{ fontSize: "0.78rem", marginTop: "0.2rem", color: "var(--text-muted)" }}>{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <p style={{ color: "var(--text-secondary)", fontWeight: 500, fontSize: "0.9rem" }}>Drop a file here or click to browse</p>
                <p style={{ fontSize: "0.78rem", marginTop: "0.2rem", color: "var(--text-muted)" }}>Supports .txt and .pdf</p>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Content
            </label>
            <textarea
              className="input"
              rows={8}
              placeholder="Paste lecture notes, book excerpts, definitions..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        )}

        {/* Metadata */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Topic
            </label>
            <input className="input" placeholder="e.g. networking, operating systems" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          {mode === "text" && (
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Source
              </label>
              <input className="input" placeholder="e.g. Textbook Ch. 3" value={source} onChange={(e) => setSource(e.target.value)} />
            </div>
          )}
        </div>

        {status && (
          <div className={`feedback-box ${status.type === "success" ? "success" : "error"} fade-up`}>
            <p style={{ margin: 0, fontWeight: 600 }}>{status.msg}</p>
            {status.type === "success" && status.topic && (
              <div style={{ marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(16, 185, 129, 0.25)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  Ready to study <strong>{status.topic}</strong>?
                </span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Link
                    href={`/dashboard/learn?topic=${encodeURIComponent(status.topic)}`}
                    className="btn btn-primary"
                    style={{ fontSize: "0.78rem", padding: "0.35rem 0.8rem", textDecoration: "none" }}
                  >
                    Start Adaptive Lesson →
                  </Link>
                  <Link
                    href={`/dashboard/quiz?topic=${encodeURIComponent(status.topic)}`}
                    className="btn btn-outline"
                    style={{ fontSize: "0.78rem", padding: "0.35rem 0.8rem", textDecoration: "none" }}
                  >
                    Take Quiz →
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        <button className="btn btn-primary" onClick={submit} disabled={loading} style={{ alignSelf: "flex-start" }}>
          {loading ? <><span className="spinner" /> Ingesting...</> : "Ingest Material"}
        </button>
      </div>
    </div>
  );
}

"use client";
import { useState, useRef, DragEvent } from "react";
import { ingestText, ingestFile } from "@/lib/api";

type Mode = "text" | "file";
type Status = { type: "success" | "error"; msg: string } | null;

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
    try {
      let res;
      if (mode === "text") {
        if (!text.trim()) throw new Error("Please enter some text.");
        res = await ingestText({ text, topic: topic || undefined, source: source || undefined });
      } else {
        if (!file) throw new Error("Please select a file.");
        res = await ingestFile(file, topic || undefined);
      }
      setStatus({ type: "success", msg: `${res.message} (${res.chunks_stored} chunks stored)` });
      setText(""); setFile(null); setTopic(""); setSource("");
    } catch (e: unknown) {
      setStatus({ type: "error", msg: `${e instanceof Error ? e.message : "Something went wrong"}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "780px" }}>
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
              className="textarea"
              rows={8}
              placeholder="Paste lecture notes, textbook content, or any study material here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        )}

        {/* Metadata */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Topic
            </label>
            <input className="input" placeholder="e.g. networking" value={topic} onChange={(e) => setTopic(e.target.value)} />
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
          <div className={`feedback-box ${status.type === "success" ? "success" : "error"}`}>
            {status.msg}
          </div>
        )}

        <button className="btn btn-primary" onClick={submit} disabled={loading} style={{ alignSelf: "flex-start" }}>
          {loading ? <><span className="spinner" /> Ingesting...</> : "Ingest"}
        </button>
      </div>
    </div>
  );
}

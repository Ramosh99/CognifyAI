"use client";

export type DiagramNode = { label: string; color: string };
export type DiagramData = {
  diagram_type: "hub_spoke" | "flow" | "cycle" | string;
  center: string;
  nodes: DiagramNode[];
};

const BG = "#0d1117";
const VALID_HEX = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLORS = ["#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#f97316"];

function safeColor(c: string, idx: number) {
  return VALID_HEX.test(c) ? c : FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

/** Wrap text into lines of ≤ maxChars */
function wrap(text: string, maxChars = 11): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3); // max 3 lines
}

/** Multiline text element, vertically centered */
function Label({
  x, y, text, size = 12, weight = "600", fill = "#ffffff", lineH = 16, max = 11,
}: {
  x: number; y: number; text: string; size?: number; weight?: string; fill?: string; lineH?: number; max?: number;
}) {
  const lines = wrap(text, max);
  const totalH = (lines.length - 1) * lineH;
  return (
    <>
      {lines.map((line, i) => (
        <text
          key={i}
          x={x} y={y - totalH / 2 + i * lineH}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={fill}
          fontSize={size}
          fontWeight={weight}
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {line}
        </text>
      ))}
    </>
  );
}

// ─── Hub-Spoke (orbital / napkin.ai style) ────────────────────────────────────
function HubSpoke({ data }: { data: DiagramData }) {
  const cx = 350, cy = 205;
  const R  = 148;
  const nodes = data.nodes.slice(0, 6);
  const n = nodes.length;

  const angleFor = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2;

  return (
    <svg viewBox="0 0 700 410" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <radialGradient id="cg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#6366f1" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.05" />
        </radialGradient>
        <radialGradient id="bg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#1e1b4b" stopOpacity="0.6" />
          <stop offset="100%" stopColor={BG}       stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Background */}
      <rect width="700" height="410" fill={BG} />
      {/* Subtle center glow on background */}
      <ellipse cx={cx} cy={cy} rx="280" ry="200" fill="url(#bg-glow)" />

      {/* Orbital dashed rings — 3 ellipses at different angles */}
      {[{ rx: 195, ry: 88, rot: -38 }, { rx: 195, ry: 88, rot: 38 }, { rx: 80, ry: 195, rot: 0 }].map((o, i) => (
        <ellipse
          key={i}
          cx={cx} cy={cy} rx={o.rx} ry={o.ry}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeDasharray="9 6"
          strokeWidth="1.5"
          transform={`rotate(${o.rot} ${cx} ${cy})`}
        />
      ))}

      {/* Subtle spokes from center to nodes */}
      {nodes.map((_, i) => {
        const a = angleFor(i);
        const nx = cx + R * Math.cos(a), ny = cy + R * Math.sin(a);
        return (
          <line key={i}
            x1={cx} y1={cy} x2={nx} y2={ny}
            stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 5"
          />
        );
      })}

      {/* Center node */}
      <circle cx={cx} cy={cy} r="68" fill="url(#cg)" />
      <circle cx={cx} cy={cy} r="55" fill="none" stroke="rgba(99,102,241,0.6)" strokeWidth="1.8" />
      <circle cx={cx} cy={cy} r="50" fill="rgba(99,102,241,0.12)" />
      <Label x={cx} y={cy} text={data.center} size={13} weight="700" fill="#e2e8f0" max={10} lineH={17} />

      {/* Satellite nodes */}
      {nodes.map((node, i) => {
        const a = angleFor(i);
        const nx = cx + R * Math.cos(a), ny = cy + R * Math.sin(a);
        const color = safeColor(node.color, i);
        return (
          <g key={i}>
            {/* Glow ring */}
            <circle cx={nx} cy={ny} r="43" fill={color} fillOpacity="0.07" />
            {/* Main circle */}
            <circle cx={nx} cy={ny} r="34" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.8" strokeOpacity="0.8" />
            <Label x={nx} y={ny} text={node.label} size={11} fill="#f1f5f9" max={10} lineH={14} />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Flow (left → right steps) ────────────────────────────────────────────────
function Flow({ data }: { data: DiagramData }) {
  const allNodes = [{ label: data.center, color: "#6366f1" }, ...data.nodes.slice(0, 4)];
  const n   = allNodes.length;
  const W   = 600;
  const x0  = (700 - W) / 2;
  const sep = W / (n - 1 || 1);
  const cy  = 160;

  return (
    <svg viewBox="0 0 700 320" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="rgba(255,255,255,0.4)" />
        </marker>
      </defs>
      <rect width="700" height="320" fill={BG} />

      {allNodes.map((node, i) => {
        const x = x0 + i * sep;
        const color = safeColor(node.color ?? "#6366f1", i);
        return (
          <g key={i}>
            {i < n - 1 && (
              <line
                x1={x + 56} y1={cy} x2={x0 + (i + 1) * sep - 56} y2={cy}
                stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" markerEnd="url(#arr)"
              />
            )}
            {/* Step number badge */}
            <circle cx={x} cy={cy - 52} r="14" fill={color} fillOpacity="0.8" />
            <text x={x} y={cy - 52} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="system-ui,sans-serif">{i + 1}</text>
            {/* Box */}
            <rect x={x - 52} y={cy - 34} width="104" height="68" rx="12" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.5" strokeOpacity="0.7" />
            <Label x={x} y={cy} text={node.label} size={11} fill="#f1f5f9" max={9} lineH={14} />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Cycle (circular arrows) ───────────────────────────────────────────────────
function Cycle({ data }: { data: DiagramData }) {
  const cx = 350, cy = 205;
  const R  = 140;
  const nodes = [{ label: data.center, color: "#6366f1" }, ...data.nodes.slice(0, 4)];
  const n = nodes.length;

  const angleFor = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2;

  return (
    <svg viewBox="0 0 700 410" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <marker id="carr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="rgba(255,255,255,0.45)" />
        </marker>
      </defs>
      <rect width="700" height="410" fill={BG} />

      {/* Curved arrows between nodes */}
      {nodes.map((_, i) => {
        const a1 = angleFor(i), a2 = angleFor(i + 1);
        const mid = (a1 + a2) / 2;
        const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
        const x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
        const qx = cx + (R + 55) * Math.cos(mid), qy = cy + (R + 55) * Math.sin(mid);
        return (
          <path
            key={i}
            d={`M${x1},${y1} Q${qx},${qy} ${x2},${y2}`}
            fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" markerEnd="url(#carr)"
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node, i) => {
        const a = angleFor(i);
        const nx = cx + R * Math.cos(a), ny = cy + R * Math.sin(a);
        const color = safeColor(node.color, i);
        return (
          <g key={i}>
            <circle cx={nx} cy={ny} r="42" fill={color} fillOpacity="0.08" />
            <circle cx={nx} cy={ny} r="34" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.8" strokeOpacity="0.8" />
            <Label x={nx} y={ny} text={node.label} size={11} fill="#f1f5f9" max={10} lineH={14} />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────
export default function DiagramRenderer({ data }: { data: DiagramData }) {
  if (!data?.nodes?.length) return null;
  switch (data.diagram_type) {
    case "flow":  return <Flow  data={data} />;
    case "cycle": return <Cycle data={data} />;
    default:      return <HubSpoke data={data} />;
  }
}

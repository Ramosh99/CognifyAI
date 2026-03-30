"use client";

export type DiagramNode = { label: string; color: string };
export type DiagramData = {
  diagram_type: "hub_spoke" | "flow" | "cycle" | "comparison" | string;
  center: string;
  nodes: DiagramNode[];
};

const BG = "var(--diagram-bg)";
const VALID_HEX = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLORS = ["#ffffff", "#a3a3a3", "#737373", "#525252", "#404040", "#262626"];

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
  return lines.slice(0, 3);
}

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

// ─── Hub-Spoke ────────────────────────────────────────────────────────────────
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

      <rect width="700" height="410" fill={BG} />
      <ellipse cx={cx} cy={cy} rx="280" ry="200" fill="url(#bg-glow)" />

      {[{ rx: 195, ry: 88, rot: -38 }, { rx: 195, ry: 88, rot: 38 }, { rx: 80, ry: 195, rot: 0 }].map((o, i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={o.rx} ry={o.ry}
          fill="none" stroke="rgba(255,255,255,0.09)" strokeDasharray="9 6" strokeWidth="1.5"
          transform={`rotate(${o.rot} ${cx} ${cy})`} />
      ))}

      {nodes.map((_, i) => {
        const a = angleFor(i);
        const nx = cx + R * Math.cos(a), ny = cy + R * Math.sin(a);
        return <line key={i} x1={cx} y1={cy} x2={nx} y2={ny} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 5" />;
      })}

      <circle cx={cx} cy={cy} r="68" fill="url(#cg)" />
      <circle cx={cx} cy={cy} r="55" fill="none" stroke="rgba(99,102,241,0.6)" strokeWidth="1.8" />
      <circle cx={cx} cy={cy} r="50" fill="rgba(99,102,241,0.12)" />
      <Label x={cx} y={cy} text={data.center} size={13} weight="700" fill="#e2e8f0" max={10} lineH={17} />

      {nodes.map((node, i) => {
        const a = angleFor(i);
        const nx = cx + R * Math.cos(a), ny = cy + R * Math.sin(a);
        const color = safeColor(node.color, i);
        return (
          <g key={i}>
            <circle cx={nx} cy={ny} r="43" fill={color} fillOpacity="0.07" />
            <circle cx={nx} cy={ny} r="34" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.8" strokeOpacity="0.8" />
            <Label x={nx} y={ny} text={node.label} size={11} fill="#f1f5f9" max={10} lineH={14} />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Flow ─────────────────────────────────────────────────────────────────────
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
              <line x1={x + 56} y1={cy} x2={x0 + (i + 1) * sep - 56} y2={cy}
                stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" markerEnd="url(#arr)" />
            )}
            <circle cx={x} cy={cy - 52} r="14" fill={color} fillOpacity="0.8" />
            <text x={x} y={cy - 52} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="system-ui,sans-serif">{i + 1}</text>
            <rect x={x - 52} y={cy - 34} width="104" height="68" rx="12" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.5" strokeOpacity="0.7" />
            <Label x={x} y={cy} text={node.label} size={11} fill="#f1f5f9" max={9} lineH={14} />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Cycle ────────────────────────────────────────────────────────────────────
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

      {nodes.map((_, i) => {
        const a1 = angleFor(i), a2 = angleFor(i + 1);
        const mid = (a1 + a2) / 2;
        const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
        const x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
        const qx = cx + (R + 55) * Math.cos(mid), qy = cy + (R + 55) * Math.sin(mid);
        return (
          <path key={i} d={`M${x1},${y1} Q${qx},${qy} ${x2},${y2}`}
            fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" markerEnd="url(#carr)" />
        );
      })}

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

// ─── Comparison (new — side-by-side two-column card) ──────────────────────────
// nodes[0..2] = left side, nodes[3..5] = right side
function Comparison({ data }: { data: DiagramData }) {
  const nodes = data.nodes.slice(0, 6);
  // pad to ensure we always have 6
  while (nodes.length < 6) nodes.push({ label: "—", color: "#525252" });
  const left  = nodes.slice(0, 3);
  const right = nodes.slice(3, 6);

  const W = 700, H = 360;
  const midX = W / 2;
  const leftColor  = safeColor(left[0].color, 0);
  const rightColor = safeColor(right[0].color, 3);

  const itemY = (i: number) => 100 + i * 82;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <linearGradient id="leftGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={leftColor} stopOpacity="0.12" />
          <stop offset="100%" stopColor={leftColor} stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="rightGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={rightColor} stopOpacity="0.04" />
          <stop offset="100%" stopColor={rightColor} stopOpacity="0.12" />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill={BG} />

      {/* Column backgrounds */}
      <rect x="20" y="20" width={midX - 36} height={H - 40} rx="16" fill="url(#leftGrad)" stroke={leftColor} strokeWidth="1" strokeOpacity="0.3" />
      <rect x={midX + 16} y="20" width={midX - 36} height={H - 40} rx="16" fill="url(#rightGrad)" stroke={rightColor} strokeWidth="1" strokeOpacity="0.3" />

      {/* VS divider */}
      <line x1={midX} y1="40" x2={midX} y2={H - 40} stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" strokeDasharray="6 4" />
      <rect x={midX - 22} y={H / 2 - 16} width="44" height="32" rx="8" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <text x={midX} y={H / 2} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.5)" fontSize="11" fontWeight="700" fontFamily="system-ui,sans-serif">vs</text>

      {/* Column headers */}
      {/* left header uses center (first part before "/") */}
      {(() => {
        const parts = data.center.split(/[\/\|]/).map(s => s.trim());
        const lHeader = parts[0] || data.center;
        const rHeader = parts[1] || "";
        return (
          <>
            <rect x="32" y="28" width={midX - 60} height="36" rx="8" fill={leftColor} fillOpacity="0.25" />
            <text x={midX / 2} y="46" textAnchor="middle" dominantBaseline="middle" fill={leftColor} fontSize="12" fontWeight="700" fontFamily="system-ui,sans-serif">{lHeader}</text>
            {rHeader && (
              <>
                <rect x={midX + 28} y="28" width={midX - 60} height="36" rx="8" fill={rightColor} fillOpacity="0.25" />
                <text x={midX + (midX / 2)} y="46" textAnchor="middle" dominantBaseline="middle" fill={rightColor} fontSize="12" fontWeight="700" fontFamily="system-ui,sans-serif">{rHeader}</text>
              </>
            )}
          </>
        );
      })()}

      {/* Left items */}
      {left.map((node, i) => {
        const color = safeColor(node.color, i);
        const y = itemY(i);
        return (
          <g key={`l-${i}`}>
            <rect x="36" y={y - 26} width={midX - 70} height="52" rx="10" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.2" strokeOpacity="0.5" />
            <circle cx="64" cy={y} r="12" fill={color} fillOpacity="0.4" />
            <text x="64" y={y} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="system-ui,sans-serif">{i + 1}</text>
            <Label x={(36 + 64 + midX - 70) / 2 + 8} y={y} text={node.label} size={11} fill="#f1f5f9" max={13} lineH={14} />
          </g>
        );
      })}

      {/* Right items */}
      {right.map((node, i) => {
        const color = safeColor(node.color, i + 3);
        const y = itemY(i);
        const rx = midX + 28;
        return (
          <g key={`r-${i}`}>
            <rect x={rx} y={y - 26} width={midX - 70} height="52" rx="10" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.2" strokeOpacity="0.5" />
            <circle cx={rx + 28} cy={y} r="12" fill={color} fillOpacity="0.4" />
            <text x={rx + 28} y={y} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="system-ui,sans-serif">{i + 1}</text>
            <Label x={rx + 28 + (midX - 70 - 28) / 2 + 8} y={y} text={node.label} size={11} fill="#f1f5f9" max={13} lineH={14} />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Tree (root at top, children spread below, 2 levels for 4-5 nodes) ─────────
function Tree({ data }: { data: DiagramData }) {
  const nodes = data.nodes.slice(0, 5);
  const n = nodes.length;
  const rootX = 350, rootY = 65, rootR = 42;

  type Pos = { x: number; y: number; r: number; parent: "root" | number };
  let positions: Pos[];

  if (n <= 3) {
    const xs = n === 1 ? [350] : n === 2 ? [210, 490] : [150, 350, 550];
    positions = xs.map(x => ({ x, y: 255, r: 36, parent: "root" as const }));
  } else if (n === 4) {
    positions = [
      { x: 185, y: 195, r: 36, parent: "root" as const },
      { x: 515, y: 195, r: 36, parent: "root" as const },
      { x: 110, y: 335, r: 30, parent: 0 },
      { x: 560, y: 335, r: 30, parent: 1 },
    ];
  } else {
    positions = [
      { x: 180, y: 190, r: 36, parent: "root" as const },
      { x: 520, y: 190, r: 36, parent: "root" as const },
      { x: 80,  y: 325, r: 28, parent: 0 },
      { x: 265, y: 325, r: 28, parent: 0 },
      { x: 520, y: 325, r: 28, parent: 1 },
    ];
  }
  const H = n <= 3 ? 380 : 420;

  return (
    <svg viewBox={`0 0 700 ${H}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect width="700" height={H} fill={BG} />
      {positions.map((pos, i) => {
        const px = pos.parent === "root" ? rootX : positions[pos.parent as number].x;
        const py = pos.parent === "root" ? rootY + rootR : positions[pos.parent as number].y + positions[pos.parent as number].r;
        return <line key={i} x1={px} y1={py + 3} x2={pos.x} y2={pos.y - pos.r - 3}
          stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" strokeDasharray="5 4" />;
      })}
      {nodes.map((node, i) => {
        const p = positions[i]; const color = safeColor(node.color, i);
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={p.r + 8} fill={color} fillOpacity="0.06" />
            <circle cx={p.x} cy={p.y} r={p.r} fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.8" strokeOpacity="0.8" />
            <Label x={p.x} y={p.y} text={node.label} size={p.r > 32 ? 11 : 10} fill="#f1f5f9" max={9} lineH={13} />
          </g>
        );
      })}
      <circle cx={rootX} cy={rootY} r={rootR + 10} fill="rgba(99,102,241,0.07)" />
      <circle cx={rootX} cy={rootY} r={rootR} fill="rgba(99,102,241,0.22)" stroke="rgba(99,102,241,0.75)" strokeWidth="2" />
      <Label x={rootX} y={rootY} text={data.center} size={13} weight="700" fill="#e2e8f0" max={11} lineH={16} />
    </svg>
  );
}

// ─── Pyramid (stacked trapezoid layers, top = small, bottom = wide) ───────────
function Pyramid({ data }: { data: DiagramData }) {
  const layers = data.nodes.slice(0, 5);
  const n = layers.length || 1;
  const W = 700, H = 380, midX = W / 2;
  const topY = 30, bottomY = H - 20;
  const totalH = bottomY - topY;
  const layerH = totalH / n;
  const minW = 14, maxW = 580;

  const wAt = (frac: number) => minW + (maxW - minW) * frac;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect width={W} height={H} fill={BG} />
      {layers.map((layer, i) => {
        const y1 = topY + i * layerH, y2 = y1 + layerH;
        const w1 = wAt(i / n), w2 = wAt((i + 1) / n);
        const [x1L, x1R, x2L, x2R] = [midX - w1/2, midX + w1/2, midX - w2/2, midX + w2/2];
        const color = safeColor(layer.color, i);
        const cy = (y1 + y2) / 2;
        return (
          <g key={i}>
            <polygon points={`${x1L},${y1} ${x1R},${y1} ${x2R},${y2} ${x2L},${y2}`}
              fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5" strokeOpacity="0.7" />
            <Label x={midX} y={cy} text={layer.label} size={12} fill="#f1f5f9" max={18} lineH={15} />
          </g>
        );
      })}
      <text x={midX} y={H - 6} textAnchor="middle" fill="rgba(255,255,255,0.3)"
        fontSize="10" fontFamily="system-ui,sans-serif">{data.center}</text>
    </svg>
  );
}

// ─── Timeline (horizontal line, alternating labels above/below) ───────────────
function Timeline({ data }: { data: DiagramData }) {
  const events = data.nodes.slice(0, 5);
  const n = events.length || 1;
  const W = 700, H = 290, lineY = H / 2;
  const startX = 70, endX = 630;
  const step = (endX - startX) / Math.max(n - 1, 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <marker id="tarr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="rgba(255,255,255,0.35)" />
        </marker>
      </defs>
      <rect width={W} height={H} fill={BG} />
      <line x1={startX - 10} y1={lineY} x2={endX + 14} y2={lineY}
        stroke="rgba(255,255,255,0.2)" strokeWidth="2" markerEnd="url(#tarr)" />
      <text x={W / 2} y={H - 8} textAnchor="middle" fill="rgba(255,255,255,0.3)"
        fontSize="10" fontFamily="system-ui,sans-serif">{data.center}</text>
      {events.map((event, i) => {
        const x = n === 1 ? (startX + endX) / 2 : startX + i * step;
        const color = safeColor(event.color, i);
        const above = i % 2 === 0;
        const boxY = above ? lineY - 90 : lineY + 20;
        return (
          <g key={i}>
            <line x1={x} y1={above ? lineY - 14 : lineY + 14} x2={x} y2={above ? boxY + 44 : boxY - 4}
              stroke={color} strokeWidth="1.5" strokeOpacity="0.55" strokeDasharray="3 3" />
            <circle cx={x} cy={lineY} r="9" fill={color} fillOpacity="0.9" />
            <circle cx={x} cy={lineY} r="16" fill={color} fillOpacity="0.15" />
            <rect x={x - 52} y={boxY} width="104" height="44" rx="9"
              fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.3" strokeOpacity="0.65" />
            <Label x={x} y={boxY + 22} text={event.label} size={11} fill="#f1f5f9" max={9} lineH={14} />
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
    case "flow":        return <Flow       data={data} />;
    case "cycle":       return <Cycle      data={data} />;
    case "comparison":  return <Comparison data={data} />;
    case "tree":        return <Tree       data={data} />;
    case "pyramid":     return <Pyramid    data={data} />;
    case "timeline":    return <Timeline   data={data} />;
    default:            return <HubSpoke   data={data} />;
  }
}


"use client";

export type DiagramNode = {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "rect" | "circle";
};

export type DiagramEdge = {
  source: string;
  target: string;
  label?: string | null;
  points: [number, number][];
  marker: "arrow" | "none";
};

export type DiagramData = {
  title: string;
  layout_type: string;
  viewbox: { w: number; h: number };
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

const BG = "var(--diagram-bg)";
const VALID_HEX = /^#[0-9a-fA-F]{6}$/;
const FALLBACK = "#6366f1";

function safeColor(c: string) {
  return VALID_HEX.test(c) ? c : FALLBACK;
}

function wrap(text: string, maxChars = 14): string[] {
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
  x, y, text, size = 11, weight = "600", fill = "#f1f5f9", lineH = 14, max = 14,
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

function Node({ node }: { node: DiagramNode }) {
  const color = safeColor(node.color);
  const maxChars = Math.max(6, Math.floor((node.w - 24) / 7));

  if (node.shape === "circle") {
    const r = Math.max(node.w, node.h) / 2;
    return (
      <g>
        <circle cx={node.x} cy={node.y} r={r + 6} fill={color} fillOpacity="0.07" />
        <circle cx={node.x} cy={node.y} r={r} fill={color} fillOpacity="0.18"
          stroke={color} strokeWidth="1.8" strokeOpacity="0.85" />
        <Label x={node.x} y={node.y} text={node.label} size={11} max={maxChars} />
      </g>
    );
  }

  return (
    <g>
      <rect x={node.x - node.w / 2} y={node.y - node.h / 2}
        width={node.w} height={node.h} rx="10"
        fill={color} fillOpacity="0.18"
        stroke={color} strokeWidth="1.6" strokeOpacity="0.85" />
      <Label x={node.x} y={node.y} text={node.label} size={11} max={maxChars} />
    </g>
  );
}

function pointsToPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  const [x0, y0] = points[0];
  if (points.length === 2) return `M${x0},${y0} L${points[1][0]},${points[1][1]}`;
  if (points.length === 3) {
    const [cx, cy] = points[1];
    const [x2, y2] = points[2];
    return `M${x0},${y0} Q${cx},${cy} ${x2},${y2}`;
  }
  return points.reduce((acc, [x, y], i) => acc + (i === 0 ? `M${x},${y}` : ` L${x},${y}`), "");
}

function edgeMidpoint(points: [number, number][]): [number, number] {
  if (points.length === 0) return [0, 0];
  if (points.length === 3) return points[1];
  const [a, b] = [points[0], points[points.length - 1]];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function Edge({ edge }: { edge: DiagramEdge }) {
  if (edge.points.length < 2) return null;
  const stroke = "rgba(255,255,255,0.35)";
  const path = pointsToPath(edge.points);
  const midpoint = edge.label ? edgeMidpoint(edge.points) : null;
  return (
    <g>
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.6"
        markerEnd={edge.marker === "arrow" ? "url(#diag-arr)" : undefined} />
      {midpoint && edge.label && (
        <g>
          <rect
            x={midpoint[0] - edge.label.length * 3.2 - 6}
            y={midpoint[1] - 9}
            width={edge.label.length * 6.4 + 12}
            height={18}
            rx="6"
            fill="var(--diagram-bg, #0a0a0a)"
            fillOpacity="0.85"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
          <text
            x={midpoint[0]}
            y={midpoint[1]}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.7)"
            fontSize="10"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {edge.label}
          </text>
        </g>
      )}
    </g>
  );
}

export default function DiagramRenderer({ data }: { data: DiagramData }) {
  if (!data?.nodes?.length) return null;
  const W = data.viewbox?.w ?? 700;
  const H = data.viewbox?.h ?? 410;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <marker id="diag-arr" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="rgba(255,255,255,0.5)" />
        </marker>
      </defs>
      <rect width={W} height={H} fill={BG} />
      {data.edges.map((e, i) => <Edge key={`e${i}-${e.source}-${e.target}`} edge={e} />)}
      {data.nodes.map((n) => <Node key={n.id} node={n} />)}
    </svg>
  );
}

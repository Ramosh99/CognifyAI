"use client";

import { PointerEvent, useMemo, useRef, useState } from "react";

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

type DragState = {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
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
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function Label({
  x,
  y,
  text,
  size = 11,
  weight = "600",
  fill = "#f1f5f9",
  lineH = 14,
  max = 14,
}: {
  x: number;
  y: number;
  text: string;
  size?: number;
  weight?: string;
  fill?: string;
  lineH?: number;
  max?: number;
}) {
  const lines = wrap(text, max);
  const totalH = (lines.length - 1) * lineH;
  return (
    <>
      {lines.map((line, i) => (
        <text
          key={i}
          x={x}
          y={y - totalH / 2 + i * lineH}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={fill}
          fontSize={size}
          fontWeight={weight}
          fontFamily="system-ui, -apple-system, sans-serif"
          pointerEvents="none"
        >
          {line}
        </text>
      ))}
    </>
  );
}

function Node({
  node,
  dragging,
  onPointerDown,
}: {
  node: DiagramNode;
  dragging: boolean;
  onPointerDown: (event: PointerEvent<SVGGElement>, node: DiagramNode) => void;
}) {
  const color = safeColor(node.color);
  const maxChars = Math.max(6, Math.floor((node.w - 24) / 7));
  const className = dragging ? "diagram-node dragging" : "diagram-node";

  if (node.shape === "circle") {
    const r = Math.max(node.w, node.h) / 2;
    return (
      <g className={className} onPointerDown={(event) => onPointerDown(event, node)} style={{ cursor: dragging ? "grabbing" : "grab" }}>
        <circle cx={node.x} cy={node.y} r={r + 10} fill="transparent" />
        <circle cx={node.x} cy={node.y} r={r + 6} fill={color} fillOpacity="0.07" pointerEvents="none" />
        <circle
          cx={node.x}
          cy={node.y}
          r={r}
          fill={color}
          fillOpacity="0.18"
          stroke={color}
          strokeWidth="1.8"
          strokeOpacity="0.85"
          pointerEvents="none"
        />
        <Label x={node.x} y={node.y} text={node.label} size={11} max={maxChars} />
      </g>
    );
  }

  return (
    <g className={className} onPointerDown={(event) => onPointerDown(event, node)} style={{ cursor: dragging ? "grabbing" : "grab" }}>
      <rect x={node.x - node.w / 2 - 8} y={node.y - node.h / 2 - 8} width={node.w + 16} height={node.h + 16} rx="14" fill="transparent" />
      <rect
        x={node.x - node.w / 2}
        y={node.y - node.h / 2}
        width={node.w}
        height={node.h}
        rx="10"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.6"
        strokeOpacity="0.85"
        pointerEvents="none"
      />
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

function edgePathBetween(source: DiagramNode, target: DiagramNode, originalPoints: [number, number][]): [number, number][] {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy) || 1;
  const sx = source.x + (dx / distance) * (source.w / 2);
  const sy = source.y + (dy / distance) * (source.h / 2);
  const tx = target.x - (dx / distance) * (target.w / 2);
  const ty = target.y - (dy / distance) * (target.h / 2);

  if (originalPoints.length === 3) {
    const originalStart = originalPoints[0];
    const originalControl = originalPoints[1];
    const originalEnd = originalPoints[2];
    const originalMidX = (originalStart[0] + originalEnd[0]) / 2;
    const originalMidY = (originalStart[1] + originalEnd[1]) / 2;
    const newMidX = (sx + tx) / 2;
    const newMidY = (sy + ty) / 2;
    return [
      [sx, sy],
      [newMidX + (originalControl[0] - originalMidX), newMidY + (originalControl[1] - originalMidY)],
      [tx, ty],
    ];
  }

  return [[sx, sy], [tx, ty]];
}

function Edge({ edge, nodesById }: { edge: DiagramEdge; nodesById: Map<string, DiagramNode> }) {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  if (!source || !target) return null;

  const stroke = "rgba(255,255,255,0.35)";
  const points = edgePathBetween(source, target, edge.points);
  const path = pointsToPath(points);
  const midpoint = edge.label ? edgeMidpoint(points) : null;
  return (
    <g>
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.6" markerEnd={edge.marker === "arrow" ? "url(#diag-arr)" : undefined} />
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

function InteractiveDiagram({ data }: { data: DiagramData }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [nodes, setNodes] = useState(data.nodes);
  const [drag, setDrag] = useState<DragState | null>(null);

  const W = data?.viewbox?.w ?? 700;
  const H = data?.viewbox?.h ?? 410;
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  if (!data?.nodes?.length) return null;

  const pointerToSvg = (event: PointerEvent<SVGSVGElement | SVGGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  const handlePointerDown = (event: PointerEvent<SVGGElement>, node: DiagramNode) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerToSvg(event);
    setDrag({
      id: node.id,
      pointerId: event.pointerId,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
    });
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = pointerToSvg(event);
    setNodes((prev) =>
      prev.map((node) =>
        node.id === drag.id
          ? {
              ...node,
              x: Math.min(Math.max(point.x - drag.offsetX, node.w / 2 + 8), W - node.w / 2 - 8),
              y: Math.min(Math.max(point.y - drag.offsetY, node.h / 2 + 8), H - node.h / 2 - 8),
            }
          : node
      )
    );
  };

  const handlePointerEnd = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    setDrag(null);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", touchAction: "none", userSelect: "none" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
    >
      <defs>
        <marker id="diag-arr" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="rgba(255,255,255,0.5)" />
        </marker>
        <style>
          {`
            @keyframes diagram-node-float {
              0%, 100% { transform: translateY(0); filter: drop-shadow(0 0 0 rgba(255,255,255,0)); }
              50% { transform: translateY(-4px); filter: drop-shadow(0 8px 16px rgba(255,255,255,0.08)); }
            }
            .diagram-node {
              animation: diagram-node-float 4.5s ease-in-out infinite;
              transform-box: fill-box;
              transform-origin: center;
              transition: opacity 0.15s ease;
            }
            .diagram-node:nth-of-type(2n) { animation-delay: -1.1s; }
            .diagram-node:nth-of-type(3n) { animation-delay: -2.2s; }
            .diagram-node.dragging {
              animation: none;
              opacity: 0.96;
            }
          `}
        </style>
      </defs>
      <rect width={W} height={H} fill={BG} />
      {data.edges.map((edge, i) => (
        <Edge key={`e${i}-${edge.source}-${edge.target}`} edge={edge} nodesById={nodesById} />
      ))}
      {nodes.map((node) => (
        <Node key={node.id} node={node} dragging={drag?.id === node.id} onPointerDown={handlePointerDown} />
      ))}
    </svg>
  );
}

export default function DiagramRenderer({ data }: { data: DiagramData }) {
  if (!data?.nodes?.length) return null;
  const diagramKey = `${data.title}:${data.nodes.map((node) => `${node.id}:${node.x}:${node.y}`).join("|")}`;
  return <InteractiveDiagram key={diagramKey} data={data} />;
}

from app.agents.visual_tools.icon_manifest import hydrate_icon
from app.agents.visual_tools.schemas import DiagramData, LaidOutEdge, LaidOutNode, VisualPlan
from app.services import layout_solver as ls


def layout_plan(plan: VisualPlan) -> DiagramData:
    input_nodes = [
        ls.InputNode(
            id=node.id,
            label=node.label,
            color=node.color,
            role=node.role,
        )
        for node in plan.nodes
    ]
    input_edges = [
        ls.InputEdge(
            src=edge.source,
            dst=edge.target,
            label=edge.label,
        )
        for edge in plan.edges
    ]
    solved = ls.solve(
        ls.GraphPlan(
            title=plan.title,
            nodes=input_nodes,
            edges=input_edges,
            intent=plan.intent,
        )
    )

    plan_nodes = {node.id: node for node in plan.nodes}
    plan_edges = {(edge.source, edge.target): edge for edge in plan.edges}
    return DiagramData(
        title=solved.title,
        layout_type=solved.layout_type,
        theme=plan.theme,
        viewbox=solved.viewbox,
        nodes=[
            LaidOutNode(
                id=node.id,
                label=node.label,
                color=node.color,
                x=node.x,
                y=node.y,
                w=node.w,
                h=node.h,
                shape=node.shape,
                icon=hydrate_icon(plan_nodes.get(node.id).icon if plan_nodes.get(node.id) else None),
                type=plan_nodes.get(node.id).type if plan_nodes.get(node.id) else None,
            )
            for node in solved.nodes
        ],
        edges=[
            LaidOutEdge(
                source=edge.src,
                target=edge.dst,
                label=edge.label,
                points=edge.points,
                marker=edge.marker,
                style=plan_edges.get((edge.src, edge.dst)).style if plan_edges.get((edge.src, edge.dst)) else None,
            )
            for edge in solved.edges
        ],
    )

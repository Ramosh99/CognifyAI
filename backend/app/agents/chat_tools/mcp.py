from typing import Dict


def call_mcp_tool(*, message: str) -> Dict[str, object]:
    return {
        "response": (
            "MCP app calling is now represented in the chat agent flow, but no backend MCP connector "
            "adapter is configured for this FastAPI service yet. Connectors such as calendar, YouTube, "
            "Drive, or Docs should be registered behind this tool with read/write permission checks."
        ),
        "blocks": [
            {
                "type": "tool_result",
                "title": "MCP action pending setup",
                "data": {
                    "request": message,
                    "requires_connector_adapter": True,
                    "write_actions_need_confirmation": True,
                },
            }
        ],
        "quiz": None,
        "feedback": None,
        "action": {
            "tool": "mcp_action",
            "input": message,
            "output": {"configured": False},
        },
    }

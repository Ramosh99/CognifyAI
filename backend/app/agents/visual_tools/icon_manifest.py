from typing import Dict, Optional


ICON_MANIFEST: Dict[str, str] = {
    "concept": "circle",
    "state": "circle-dot",
    "event": "zap",
    "transition": "arrow-right",
    "decision": "diamond",
    "process": "workflow",
    "storage": "database",
    "user": "user",
    "client": "monitor",
    "server": "server",
}


def allowed_icon_tokens() -> list[str]:
    return sorted(ICON_MANIFEST)


def hydrate_icon(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    key = token.strip().lower()
    if key not in ICON_MANIFEST:
        return None
    return {
        "token": key,
        "name": ICON_MANIFEST[key],
        "source": "lucide",
    }

import random
import re
from typing import Any, Dict, List, Tuple


LETTERS = ["A", "B", "C", "D"]


def _topic_terms(topic: str) -> List[str]:
    terms = re.findall(r"[A-Za-z][A-Za-z0-9-]{2,}", topic)
    return [term.lower() for term in terms[:4]] or ["topic"]


def _shuffle_options(options: List[Dict], correct_key: str) -> Tuple[List[Dict], str]:
    """
    Randomly shuffle the 4 MCQ options and remap keys A/B/C/D in new order.
    Returns the shuffled list and the new key of the correct answer.

    This eliminates the LLM bias of always placing the correct answer first
    (which causes the 'always A is correct' problem).
    """
    correct_text = next(
        (o["text"] for o in options if o["key"] == correct_key),
        options[0]["text"] if options else "",
    )

    shuffled = options[:]
    random.shuffle(shuffled)

    # Re-label A/B/C/D after shuffle
    for i, opt in enumerate(shuffled):
        opt["key"] = LETTERS[i]

    # Track where the correct answer landed
    new_correct = next(
        (o["key"] for o in shuffled if o["text"] == correct_text),
        shuffled[0]["key"],
    )

    return shuffled, new_correct


def build_fallback_quiz(topic: str, count: int) -> List[Dict[str, Any]]:
    """Generates simple fallback questions when LLM output cannot be parsed."""
    terms = _topic_terms(topic)
    label = " ".join(term.capitalize() for term in terms)

    # (question, correct_text, wrong1, wrong2, wrong3, explanation)
    templates = [
        (
            f"What is the best first step when learning {label}?",
            "Identify the core concepts and how they relate.",
            "Memorize isolated terms without context.",
            "Skip definitions and only look at examples.",
            "Assume every subtopic works the same way.",
            "Strong understanding starts with the core concepts and relationships before details.",
        ),
        (
            f"Which practice method is most useful for understanding {label}?",
            "Compare examples, explain tradeoffs, and test your reasoning.",
            "Read once and avoid checking mistakes.",
            "Focus only on rare edge cases first.",
            "Use definitions without applying them.",
            "Concept-aware practice checks whether you can apply and explain ideas, not just recall words.",
        ),
        (
            f"What usually signals a misconception about {label}?",
            "Confusing related terms or applying one rule in every situation.",
            "Asking how examples connect to definitions.",
            "Breaking a workflow into smaller steps.",
            "Checking why an answer is correct.",
            "Misconceptions often appear when a learner overgeneralises or mixes up related ideas.",
        ),
    ]

    questions = []
    for idx in range(max(1, count)):
        q, correct_text, w1, w2, w3, explanation = templates[idx % len(templates)]
        raw_options = [
            {"key": "A", "text": correct_text,  "concept_tag": "Correct concept"},
            {"key": "B", "text": w1,             "concept_tag": "Memorisation without understanding"},
            {"key": "C", "text": w2,             "concept_tag": "Example-first confusion"},
            {"key": "D", "text": w3,             "concept_tag": "Overgeneralisation"},
        ]
        shuffled, new_correct = _shuffle_options(raw_options, "A")
        questions.append({
            "question": q,
            "options": shuffled,
            "correct_key": new_correct,
            "explanation": explanation,
        })
    return questions


def normalize_quiz(data: Any, topic: str, count: int) -> List[Dict[str, Any]]:
    """
    Parse and validate LLM quiz output into a clean list of MCQ dicts.
    Always shuffles options to prevent the LLM always-A-correct bias.
    """
    if isinstance(data, dict):
        data = data.get("questions") or data.get("quiz") or []
    if not isinstance(data, list):
        return build_fallback_quiz(topic, count)

    normalized: List[Dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        question = str(item.get("question") or "").strip()
        raw_options = item.get("options") or []
        if not question or not isinstance(raw_options, list):
            continue

        options = []
        for idx, option in enumerate(raw_options[:4]):
            if isinstance(option, dict):
                text        = str(option.get("text") or "").strip()
                concept_tag = str(option.get("concept_tag") or "").strip()
                key         = str(option.get("key") or LETTERS[idx]).strip().upper()[:1]
            else:
                text        = str(option).strip()
                concept_tag = ""
                key         = LETTERS[idx]
            if not text:
                continue
            if key not in LETTERS:
                key = LETTERS[idx]
            options.append({
                "key": key,
                "text": text,
                "concept_tag": concept_tag or ("Correct concept" if idx == 0 else "Common misconception"),
            })

        if len(options) != 4:
            continue

        # Deduplicate keys (in case LLM emitted duplicates)
        seen: set = set()
        for idx, option in enumerate(options):
            if option["key"] in seen:
                option["key"] = LETTERS[idx]
            seen.add(option["key"])

        correct_key = str(item.get("correct_key") or options[0]["key"]).strip().upper()[:1]
        if correct_key not in {o["key"] for o in options}:
            correct_key = options[0]["key"]

        # ── Shuffle options to remove LLM first-option bias ──────────
        options, correct_key = _shuffle_options(options, correct_key)
        # ─────────────────────────────────────────────────────────────

        normalized.append({
            "question": question,
            "options": options,
            "correct_key": correct_key,
            "explanation": str(
                item.get("explanation") or
                "Review the concept and compare why each option is or is not supported."
            ).strip(),
        })

    if not normalized:
        return build_fallback_quiz(topic, count)
    if len(normalized) < count:
        normalized.extend(build_fallback_quiz(topic, count - len(normalized)))
    return normalized[:count]

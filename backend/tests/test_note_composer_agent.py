from types import SimpleNamespace

from app.agents.note_composer_agent import compose_note


def _fake_diagram():
    return SimpleNamespace(
        model_dump=lambda: {
            "title": "Learning Map",
            "layout_type": "sequential",
            "theme": "developer-dark",
            "viewbox": {"w": 900, "h": 520},
            "nodes": [],
            "edges": [],
        }
    )


def test_note_composer_interleaves_planned_diagram(monkeypatch):
    monkeypatch.setattr(
        "app.agents.note_composer_agent.llm_service.compose_note_article",
        lambda **kwargs: """
        {
          "title": "Catastrophic Forgetting",
          "note_type": "conceptual_explainer",
          "sections": [
            {"type": "text", "body": "Catastrophic forgetting happens when new learning disrupts older knowledge."},
            {"type": "text", "heading": "Why It Happens", "body": "The model updates shared weights for a new task, which can overwrite patterns needed for the old task."}
          ],
          "visual_plan": [
            {
              "after_section_index": 1,
              "visual_type": "diagram",
              "purpose": "Show new task updates overwriting older task knowledge.",
              "query": "catastrophic forgetting weight update diagram",
              "placement_reason": "The diagram belongs after the mechanism is introduced."
            }
          ],
          "references": []
        }
        """,
    )
    monkeypatch.setattr(
        "app.agents.note_composer_agent.llm_service.parse_json_response",
        lambda raw: __import__("json").loads(raw),
    )
    monkeypatch.setattr(
        "app.agents.note_composer_agent.build_diagram",
        lambda text: _fake_diagram(),
    )

    note = compose_note(
        concept="catastrophic forgetting",
        numbered_context="",
        learner_type="Visual",
        rag_results=[],
    )

    assert note.note_type == "conceptual_explainer"
    text_sections = [section for section in note.sections if section.type == "text"]
    visual_sections = [section for section in note.sections if section.type != "text"]

    assert len(text_sections) >= 6
    assert len(visual_sections) >= len(text_sections)


def test_note_composer_fallback_is_substantial_and_visual_rich(monkeypatch):
    monkeypatch.setattr(
        "app.agents.note_composer_agent.llm_service.compose_note_article",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("llm unavailable")),
    )
    monkeypatch.setattr(
        "app.agents.note_composer_agent.build_diagram",
        lambda text: _fake_diagram(),
    )
    monkeypatch.setattr(
        "app.agents.note_composer_agent.search_images",
        lambda **kwargs: {"blocks": []},
    )

    note = compose_note(
        concept="differences between AI and ML for advance exams",
        numbered_context="",
        learner_type="Visual",
        rag_results=[],
    )

    text_sections = [section for section in note.sections if section.type == "text"]
    visual_sections = [section for section in note.sections if section.type != "text"]
    total_words = sum(len(section.body.split()) for section in text_sections)

    assert len(text_sections) >= 6
    assert len(visual_sections) >= len(text_sections)
    assert total_words >= 450

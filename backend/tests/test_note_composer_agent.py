from types import SimpleNamespace

from app.agents.note_composer_agent import compose_note, compose_note_events


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


def test_note_composer_fallback_does_not_leak_ai_ml_for_other_topics(monkeypatch):
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
        concept="auditory hallucinations in medical science",
        numbered_context="",
        learner_type="Visual",
        rag_results=[
            {
                "text": "Auditory hallucinations are perceptions of sound without an external acoustic stimulus.",
                "score": 1.0,
                "topic": "auditory hallucinations",
                "source": "Wikipedia: Auditory hallucination",
            }
        ],
    )
    combined = " ".join(
        section.body
        for section in note.sections
        if section.type == "text"
    ).lower()

    assert "auditory hallucinations" in combined
    assert "machine learning" not in combined
    assert "deep learning" not in combined


def test_note_composer_events_include_realtime_statuses(monkeypatch):
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

    events = list(compose_note_events(
        concept="differences between AI and ML for advance exams",
        numbered_context="",
        learner_type="Visual",
        rag_results=[],
    ))
    phases = [
        event["data"]["phase"]
        for event in events
        if event["event"] == "status"
    ]

    assert "planning_note" in phases
    assert "writing_article" in phases
    assert "planning_visuals" in phases
    assert "searching_images" in phases
    assert "generating_diagram" in phases
    assert "placing_visual" in phases
    assert "finalizing_references" in phases
    assert phases[-1] == "complete"


def test_note_composer_events_report_image_fallback(monkeypatch):
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

    events = list(compose_note_events(
        concept="differences between AI and ML for advance exams",
        numbered_context="",
        learner_type="Visual",
        rag_results=[],
    ))
    fallback_messages = [
        event["data"]["message"]
        for event in events
        if event["event"] == "status"
    ]

    assert "No suitable image found, generating a diagram instead..." in fallback_messages

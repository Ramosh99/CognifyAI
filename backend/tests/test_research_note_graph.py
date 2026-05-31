from app.agents.research_note_graph import classify_topic_sensitivity, research_topic


def test_classifies_sensitive_health_topic():
    profile = classify_topic_sensitivity("Auditory hallucinations in medical science")

    assert profile["topic_domain"] == "health_science"
    assert profile["sensitivity_level"] == "high"


def test_research_topic_uses_wikipedia(monkeypatch):
    monkeypatch.setattr(
        "app.agents.research_note_graph._wikipedia_summary",
        lambda query: (
            [
                {
                    "text": "Auditory hallucinations are perceptions of sound without an external acoustic stimulus.",
                    "score": 1.0,
                    "topic": query,
                    "source": "Wikipedia: Auditory hallucination",
                    "url": "https://en.wikipedia.org/wiki/Auditory_hallucination",
                    "kind": "research",
                }
            ],
            None,
        ),
    )

    result = research_topic("auditory hallucinations")

    assert result["sources"][0]["source"] == "Wikipedia: Auditory hallucination"
    assert "Auditory hallucinations" in result["sources"][0]["text"]

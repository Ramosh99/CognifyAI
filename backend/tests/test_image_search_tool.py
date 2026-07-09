from app.agents.chat_tools import router
from app.agents.chat_tools.image_search import search_images


def test_fallback_route_detects_image_search():
    route = router._fallback_route(
        message="show me images about this",
        topic=None,
        wrong_answer=None,
        correct_answer=None,
    )

    assert route["intent"] == "image_search"


def test_image_search_returns_normalized_results(monkeypatch):
    def fake_search(search_query):
        return [
            {
                "title": "State machine diagram",
                "image": "https://example.com/image.png",
                "thumbnail": "https://example.com/thumb.png",
                "url": "https://example.com/page",
                "source": "example.com",
            }
        ], None

    monkeypatch.setattr(
        "app.agents.chat_tools.image_search.plan_query",
        lambda **kwargs: {"query": "state machine diagram", "reason": "test"},
    )
    monkeypatch.setattr(
        "app.agents.chat_tools.image_search._duckduckgo_image_search",
        fake_search,
    )

    result = search_images(query="show me images about this", history=[])

    assert result["action"]["tool"] == "image_search"
    assert result["blocks"][1]["type"] == "image_results"
    assert result["blocks"][1]["results"][0]["thumbnail"] == "https://example.com/thumb.png"


def test_image_search_falls_back_when_duckduckgo_fails(monkeypatch):
    monkeypatch.setattr(
        "app.agents.chat_tools.image_search.plan_query",
        lambda **kwargs: {"query": "neural network diagram", "reason": "test"},
    )
    monkeypatch.setattr(
        "app.agents.chat_tools.image_search._duckduckgo_image_search",
        lambda search_query: ([], "DuckDuckGo image search failed: 403 Ratelimit"),
    )
    monkeypatch.setattr(
        "app.agents.chat_tools.image_search._wikimedia_image_search",
        lambda search_query: (
            [
                {
                    "title": "Artificial neural network",
                    "image": "https://commons.wikimedia.org/image.svg",
                    "thumbnail": "https://commons.wikimedia.org/thumb.png",
                    "url": "https://commons.wikimedia.org/wiki/File:Ann.svg",
                    "source": "Wikimedia Commons",
                }
            ],
            None,
        ),
    )

    result = search_images(query="show me images about neural networks", history=[])

    assert result["blocks"][1]["type"] == "image_results"
    assert result["action"]["output"]["provider"] == "Wikimedia Commons"


def test_image_search_prefers_wikimedia_for_wiki_queries(monkeypatch):
    monkeypatch.setattr(
        "app.agents.chat_tools.image_search.plan_query",
        lambda **kwargs: {"query": "artificial intelligence applications Wikimedia Commons", "reason": "test"},
    )
    monkeypatch.setattr(
        "app.agents.chat_tools.image_search._duckduckgo_image_search",
        lambda search_query: (_ for _ in ()).throw(AssertionError("DuckDuckGo should not be first")),
    )
    monkeypatch.setattr(
        "app.agents.chat_tools.image_search._wikimedia_image_search",
        lambda search_query: (
            [
                {
                    "title": "Artificial Intelligence Scale",
                    "image": "https://upload.wikimedia.org/image.png",
                    "thumbnail": "https://upload.wikimedia.org/thumb.png",
                    "url": "https://commons.wikimedia.org/wiki/File:AI.png",
                    "source": "Wikimedia Commons",
                }
            ],
            None,
        ),
    )

    result = search_images(query="artificial intelligence applications Wikimedia Commons", history=[])

    assert result["action"]["output"]["provider"] == "Wikimedia Commons"

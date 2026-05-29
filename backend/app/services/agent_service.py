from typing import Any, Dict, List, Literal, Optional, TypedDict

from app.services.llm_service import llm_service
from app.services.rag_service import rag_service

try:
    from langgraph.graph import END, StateGraph
except ImportError:  # Lets the app still import before requirements are installed.
    END = "__end__"
    StateGraph = None


Intent = Literal["normal", "study", "quiz", "analyze", "visual"]


class AgentState(TypedDict, total=False):
    message: str
    user_id: str
    history: List[Dict[str, str]]
    topic: Optional[str]
    learner_type: str
    top_k: int
    question_count: int
    wrong_answer: Optional[str]
    correct_answer: Optional[str]
    intent: Intent
    actions: List[Dict[str, Any]]
    sources: List[Dict[str, Any]]
    context_chunks: List[str]
    response: str
    quiz: Optional[List[Dict[str, Any]]]
    feedback: Optional[str]


class AgentService:
    """
    LangGraph-backed tutor orchestrator.

    Normal/app/help messages bypass the graph and get a plain Gemini response.
    Learning tasks enter the graph, where nodes can retrieve documents, generate
    quizzes, analyze misconceptions, or produce grounded tutor answers.
    """

    def __init__(self):
        self.graph = self._build_graph() if StateGraph else None

    def _detect_intent(self, message: str, topic: Optional[str] = None) -> Intent:
        text = message.lower().strip()

        normal_terms = (
            "hi",
            "hello",
            "hey",
            "what can you do",
            "what you can do",
            "what are the agents",
            "how do you work",
            "help",
            "who are you",
        )
        quiz_terms = ("quiz", "mcq", "test me", "practice questions", "generate questions")
        analyze_terms = (
            "wrong answer",
            "why is my answer wrong",
            "misconception",
            "analyze my answer",
            "explain my mistake",
        )
        visual_terms = ("diagram", "visual", "mind map", "flowchart")
        study_terms = (
            "explain",
            "summarize",
            "compare",
            "define",
            "teach",
            "from my document",
            "from my notes",
            "uploaded",
        )

        if text in {"hi", "hello", "hey"} or any(term in text for term in normal_terms):
            return "normal"
        if any(term in text for term in analyze_terms):
            return "analyze"
        if any(term in text for term in quiz_terms):
            return "quiz"
        if any(term in text for term in visual_terms):
            return "visual"
        if topic or any(term in text for term in study_terms) or len(text.split()) >= 5:
            return "study"
        return "normal"

    def is_normal_message(self, message: str, topic: Optional[str] = None) -> bool:
        return self._detect_intent(message, topic) == "normal"

    def _source_payload(self, results: List[dict]) -> List[Dict[str, Any]]:
        return [
            {
                "text": result.get("text", ""),
                "score": result.get("score", 0.0),
                "topic": result.get("topic"),
                "source": result.get("source"),
            }
            for result in results
        ]

    def _route_node(self, state: AgentState) -> AgentState:
        intent = self._detect_intent(state["message"], state.get("topic"))
        return {
            **state,
            "intent": intent,
            "actions": [
                *state.get("actions", []),
                {"tool": "langgraph_router", "input": state["message"], "output": intent},
            ],
        }

    def _retrieve_node(self, state: AgentState) -> AgentState:
        query = state.get("topic") or state["message"]
        top_k = 10 if state["intent"] == "quiz" else state.get("top_k", 6)
        if state["intent"] == "analyze":
            query = f"{state['message']} {state.get('topic') or ''}".strip()
            top_k = 5

        results = rag_service.retrieve(
            query=query,
            user_id=state["user_id"],
            top_k=top_k,
            filter_topic=state.get("topic") if state["intent"] == "study" else None,
        )
        return {
            **state,
            "sources": self._source_payload(results),
            "context_chunks": [result["text"] for result in results],
            "actions": [
                *state.get("actions", []),
                {
                    "tool": "document_search",
                    "input": query,
                    "output": {"results": len(results)},
                },
            ],
        }

    def _study_node(self, state: AgentState) -> AgentState:
        response = llm_service.chat(
            context_chunks=state.get("context_chunks", []),
            message=state["message"],
            history=state.get("history", []),
        )
        return {
            **state,
            "response": response,
            "quiz": None,
            "feedback": None,
            "actions": [
                *state.get("actions", []),
                {"tool": "rag_tutor", "input": state["message"], "output": "response"},
            ],
        }

    def _quiz_node(self, state: AgentState) -> AgentState:
        if not state.get("context_chunks"):
            return {
                **state,
                "response": "I need uploaded study material for that topic before I can generate a grounded quiz.",
                "quiz": None,
                "feedback": None,
            }

        topic = state.get("topic") or state["message"]
        questions = llm_service.generate_quiz(
            context_chunks=state["context_chunks"],
            topic=topic,
            learner_type=state.get("learner_type", "Textual"),
            count=state.get("question_count", 3),
        )
        return {
            **state,
            "response": f"I generated {len(questions)} grounded practice questions.",
            "quiz": questions,
            "feedback": None,
            "actions": [
                *state.get("actions", []),
                {
                    "tool": "quiz_agent",
                    "input": {"topic": topic, "question_count": state.get("question_count", 3)},
                    "output": {"questions": len(questions)},
                },
            ],
        }

    def _analyze_node(self, state: AgentState) -> AgentState:
        if not state.get("wrong_answer") or not state.get("correct_answer"):
            return {
                **state,
                "response": "Send the question, your wrong answer, and the correct answer so I can analyze the misconception.",
                "quiz": None,
                "feedback": None,
            }

        feedback = llm_service.analyze_misconception(
            context_chunks=state.get("context_chunks", []),
            question=state["message"],
            wrong_answer=state["wrong_answer"] or "",
            correct_answer=state["correct_answer"] or "",
        )
        return {
            **state,
            "response": feedback,
            "quiz": None,
            "feedback": feedback,
            "actions": [
                *state.get("actions", []),
                {"tool": "misconception_agent", "input": "answer_pair", "output": "feedback"},
            ],
        }

    def _visual_node(self, state: AgentState) -> AgentState:
        response = llm_service.chat(
            context_chunks=state.get("context_chunks", []),
            message=state["message"],
            history=state.get("history", []),
        )
        return {
            **state,
            "response": (
                f"{response}\n\nI can also create a diagram from selected text with "
                "`/api/v1/visual/diagram`."
            ),
            "quiz": None,
            "feedback": None,
            "actions": [
                *state.get("actions", []),
                {"tool": "visual_agent", "input": state["message"], "output": "visual_response"},
            ],
        }

    def _next_after_route(self, state: AgentState) -> str:
        if state["intent"] == "normal":
            return "normal"
        return "retrieve"

    def _next_after_retrieve(self, state: AgentState) -> str:
        return f"{state['intent']}_node"

    def _normal_node(self, state: AgentState) -> AgentState:
        response = llm_service.general_chat(
            message=state["message"],
            history=state.get("history", []),
        )
        return {
            **state,
            "response": response,
            "sources": [],
            "quiz": None,
            "feedback": None,
            "actions": [
                *state.get("actions", []),
                {"tool": "direct_chat", "input": state["message"], "output": "response"},
            ],
        }

    def _build_graph(self):
        graph = StateGraph(AgentState)
        graph.add_node("route", self._route_node)
        graph.add_node("normal_node", self._normal_node)
        graph.add_node("retrieve", self._retrieve_node)
        graph.add_node("study_node", self._study_node)
        graph.add_node("quiz_node", self._quiz_node)
        graph.add_node("analyze_node", self._analyze_node)
        graph.add_node("visual_node", self._visual_node)

        graph.set_entry_point("route")
        graph.add_conditional_edges(
            "route",
            self._next_after_route,
            {"normal": "normal_node", "retrieve": "retrieve"},
        )
        graph.add_conditional_edges(
            "retrieve",
            self._next_after_retrieve,
            {
                "study_node": "study_node",
                "quiz_node": "quiz_node",
                "analyze_node": "analyze_node",
                "visual_node": "visual_node",
            },
        )
        for node in ("normal_node", "study_node", "quiz_node", "analyze_node", "visual_node"):
            graph.add_edge(node, END)
        return graph.compile()

    def _fallback_run(self, state: AgentState) -> AgentState:
        state = self._route_node(state)
        if state["intent"] == "normal":
            return self._normal_node(state)
        state = self._retrieve_node(state)
        if state["intent"] == "quiz":
            return self._quiz_node(state)
        if state["intent"] == "analyze":
            return self._analyze_node(state)
        if state["intent"] == "visual":
            return self._visual_node(state)
        return self._study_node(state)

    def run(
        self,
        message: str,
        user_id: str,
        history: Optional[List[Dict[str, str]]] = None,
        topic: Optional[str] = None,
        learner_type: str = "Textual",
        top_k: int = 6,
        question_count: int = 3,
        wrong_answer: Optional[str] = None,
        correct_answer: Optional[str] = None,
    ) -> Dict[str, Any]:
        state: AgentState = {
            "message": message,
            "user_id": user_id,
            "history": history or [],
            "topic": topic,
            "learner_type": learner_type,
            "top_k": top_k,
            "question_count": question_count,
            "wrong_answer": wrong_answer,
            "correct_answer": correct_answer,
            "actions": [],
            "sources": [],
            "context_chunks": [],
        }
        result = self.graph.invoke(state) if self.graph else self._fallback_run(state)

        return {
            "intent": result.get("intent", "normal"),
            "response": result.get("response", ""),
            "actions": result.get("actions", []),
            "sources": result.get("sources", []),
            "quiz": result.get("quiz"),
            "feedback": result.get("feedback"),
        }


agent_service = AgentService()

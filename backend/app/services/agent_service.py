from typing import Any, Dict, List, Literal, Optional, TypedDict

from app.agents import chat_tools

try:
    from langgraph.graph import END, StateGraph
except ImportError:  # Lets the app still import before requirements are installed.
    END = "__end__"
    StateGraph = None


Intent = Literal[
    "normal",
    "study",
    "quiz",
    "analyze",
    "visual",
    "web_search",
    "mcp_action",
    "multi_tool",
]


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
    blocks: List[Dict[str, Any]]
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
        route = chat_tools.route_intent(
            message=message,
            history=[],
            topic=topic,
            wrong_answer=None,
            correct_answer=None,
        )
        return route["intent"]

    def is_normal_message(self, message: str, topic: Optional[str] = None) -> bool:
        return self._detect_intent(message, topic) == "normal"

    def _route_node(self, state: AgentState) -> AgentState:
        route = chat_tools.route_intent(
            message=state["message"],
            history=state.get("history", []),
            topic=state.get("topic"),
            wrong_answer=state.get("wrong_answer"),
            correct_answer=state.get("correct_answer"),
        )
        intent = route["intent"]
        return {
            **state,
            "intent": intent,
            "actions": [
                *state.get("actions", []),
                {
                    "tool": "llm_router",
                    "input": state["message"],
                    "output": {"intent": intent, "reason": route["reason"]},
                },
            ],
        }

    def _retrieve_node(self, state: AgentState) -> AgentState:
        result = chat_tools.retrieve_documents(
            message=state["message"],
            user_id=state["user_id"],
            intent=state["intent"],
            topic=state.get("topic"),
            top_k=state.get("top_k", 6),
        )
        return {
            **state,
            "sources": result["sources"],
            "context_chunks": result["context_chunks"],
            "actions": [
                *state.get("actions", []),
                result["action"],
            ],
        }

    def _study_node(self, state: AgentState) -> AgentState:
        result = chat_tools.answer_study_question(
            message=state["message"],
            history=state.get("history", []),
            context_chunks=state.get("context_chunks", []),
        )
        return {
            **state,
            "response": result["response"],
            "blocks": result["blocks"],
            "quiz": result["quiz"],
            "feedback": result["feedback"],
            "actions": [
                *state.get("actions", []),
                result["action"],
            ],
        }

    def _quiz_node(self, state: AgentState) -> AgentState:
        topic = state.get("topic") or state["message"]
        result = chat_tools.generate_quiz(
            topic=topic,
            learner_type=state.get("learner_type", "Textual"),
            question_count=state.get("question_count", 3),
            context_chunks=state.get("context_chunks", []),
        )
        return {
            **state,
            "response": result["response"],
            "blocks": result["blocks"],
            "quiz": result["quiz"],
            "feedback": result["feedback"],
            "actions": [
                *state.get("actions", []),
                result["action"],
            ],
        }

    def _analyze_node(self, state: AgentState) -> AgentState:
        result = chat_tools.analyze_misconception(
            message=state["message"],
            wrong_answer=state.get("wrong_answer"),
            correct_answer=state["correct_answer"] or "",
            context_chunks=state.get("context_chunks", []),
        )
        actions = state.get("actions", [])
        if result["action"]:
            actions = [*actions, result["action"]]
        return {
            **state,
            "response": result["response"],
            "blocks": result["blocks"],
            "quiz": result["quiz"],
            "feedback": result["feedback"],
            "actions": actions,
        }

    def _visual_node(self, state: AgentState) -> AgentState:
        result = chat_tools.answer_visual_question(
            message=state["message"],
            history=state.get("history", []),
            context_chunks=state.get("context_chunks", []),
        )
        return {
            **state,
            "response": result["response"],
            "blocks": result["blocks"],
            "quiz": result["quiz"],
            "feedback": result["feedback"],
            "actions": [
                *state.get("actions", []),
                result["action"],
            ],
        }

    def _web_search_node(self, state: AgentState) -> AgentState:
        result = chat_tools.search_web(
            query=state["message"],
            history=state.get("history", []),
        )
        return {
            **state,
            "response": result["response"],
            "blocks": result["blocks"],
            "quiz": result["quiz"],
            "feedback": result["feedback"],
            "actions": [
                *state.get("actions", []),
                result["action"],
            ],
        }

    def _mcp_action_node(self, state: AgentState) -> AgentState:
        result = chat_tools.call_mcp_tool(message=state["message"])
        return {
            **state,
            "response": result["response"],
            "blocks": result["blocks"],
            "quiz": result["quiz"],
            "feedback": result["feedback"],
            "actions": [
                *state.get("actions", []),
                result["action"],
            ],
        }

    def _multi_tool_node(self, state: AgentState) -> AgentState:
        search_result = chat_tools.search_web(
            query=state["message"],
            history=state.get("history", []),
        )
        return {
            **state,
            "response": search_result["response"],
            "blocks": search_result["blocks"],
            "quiz": search_result["quiz"],
            "feedback": search_result["feedback"],
            "actions": [
                *state.get("actions", []),
                search_result["action"],
            ],
        }

    def _next_after_route(self, state: AgentState) -> str:
        if state["intent"] == "normal":
            return "normal"
        if state["intent"] in {"web_search", "mcp_action", "multi_tool"}:
            return state["intent"]
        return "retrieve"

    def _next_after_retrieve(self, state: AgentState) -> str:
        return f"{state['intent']}_node"

    def _normal_node(self, state: AgentState) -> AgentState:
        result = chat_tools.answer_normal_message(
            message=state["message"],
            history=state.get("history", []),
        )
        return {
            **state,
            "response": result["response"],
            "blocks": result["blocks"],
            "sources": result["sources"],
            "quiz": result["quiz"],
            "feedback": result["feedback"],
            "actions": [
                *state.get("actions", []),
                result["action"],
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
        graph.add_node("web_search_node", self._web_search_node)
        graph.add_node("mcp_action_node", self._mcp_action_node)
        graph.add_node("multi_tool_node", self._multi_tool_node)

        graph.set_entry_point("route")
        graph.add_conditional_edges(
            "route",
            self._next_after_route,
            {
                "normal": "normal_node",
                "retrieve": "retrieve",
                "web_search": "web_search_node",
                "mcp_action": "mcp_action_node",
                "multi_tool": "multi_tool_node",
            },
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
        for node in (
            "normal_node",
            "study_node",
            "quiz_node",
            "analyze_node",
            "visual_node",
            "web_search_node",
            "mcp_action_node",
            "multi_tool_node",
        ):
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
        if state["intent"] == "web_search":
            return self._web_search_node(state)
        if state["intent"] == "mcp_action":
            return self._mcp_action_node(state)
        if state["intent"] == "multi_tool":
            return self._multi_tool_node(state)
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
            "blocks": [],
        }
        result = self.graph.invoke(state) if self.graph else self._fallback_run(state)

        return {
            "intent": result.get("intent", "normal"),
            "response": result.get("response", ""),
            "blocks": result.get("blocks", []),
            "actions": result.get("actions", []),
            "sources": result.get("sources", []),
            "quiz": result.get("quiz"),
            "feedback": result.get("feedback"),
        }


agent_service = AgentService()

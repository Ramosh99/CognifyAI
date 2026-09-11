import json
import re
import time
from typing import Any, Dict, Generator, List, Optional

import requests

from app.agents.quiz_tools import normalize_quiz
from app.core.config import settings
from app.core import prompts


class LLMService:
    def __init__(self):
        self.default_model = settings.GEMINI_MODEL
        self.article_model = settings.GEMINI_MODEL
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"

    def _headers(self) -> Dict[str, str]:
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not configured in .env")
        return {
            "Content-Type": "application/json",
            "X-goog-api-key": settings.GEMINI_API_KEY,
        }

    def _url(self, method: str, model: Optional[str] = None) -> str:
        return f"{self.base_url}/models/{model or self.default_model}:{method}"

    def _build_payload(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        contents: List[Dict[str, Any]] = []

        for turn in (history or [])[-10:]:
            role = "model" if turn.get("role") == "assistant" else "user"
            contents.append(
                {"role": role, "parts": [{"text": turn.get("content", "")}]}
            )

        contents.append({"role": "user", "parts": [{"text": user_prompt}]})

        return {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
                "topP": 1,
            },
        }

    def _extract_content(self, payload: Dict[str, Any]) -> str:
        candidates = payload.get("candidates") or []
        if not candidates:
            error = payload.get("error")
            if error:
                raise ValueError(f"LLM API error: {error}")
            raise ValueError("LLM returned no candidates.")

        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(part.get("text", "") for part in parts).strip()
        if not text:
            finish = candidates[0].get("finishReason", "unknown")
            raise ValueError(f"LLM returned empty content (finishReason='{finish}').")
        return text

    def parse_json_response(self, raw_response: str) -> Any:
        clean_json = raw_response.strip()
        clean_json = re.sub(r"^```(?:json)?\s*", "", clean_json, flags=re.IGNORECASE)
        clean_json = re.sub(r"\s*```$", "", clean_json)

        parse_error: Optional[json.JSONDecodeError] = None
        try:
            return json.loads(clean_json)
        except json.JSONDecodeError as e:
            parse_error = e

        starts = [idx for idx in (clean_json.find("{"), clean_json.find("[")) if idx >= 0]
        if not starts:
            raise parse_error or ValueError("LLM response did not contain JSON.")

        start = min(starts)
        end = max(clean_json.rfind("}"), clean_json.rfind("]"))
        if end <= start:
            raise parse_error or ValueError("LLM response did not contain complete JSON.")
        return json.loads(clean_json[start : end + 1])

    def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.5,
        max_tokens: int = 1024,
        model: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
        max_retries: int = 3,
    ) -> str:
        """Invoke Gemini with exponential backoff retry on 429/5xx errors."""
        payload = self._build_payload(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            history=history,
        )
        url = self._url("generateContent", model)
        last_exc: Exception = RuntimeError("LLM call failed.")

        for attempt in range(max_retries):
            try:
                response = requests.post(
                    url,
                    headers=self._headers(),
                    json=payload,
                    timeout=settings.GEMINI_TIMEOUT,
                )
                # Retry on rate-limit (429) or server errors (5xx)
                if response.status_code == 429 or response.status_code >= 500:
                    wait = 2 ** attempt  # 1s, 2s, 4s
                    print(f"Gemini {response.status_code}: retrying in {wait}s (attempt {attempt + 1}/{max_retries})")
                    time.sleep(wait)
                    last_exc = ValueError(f"Gemini error {response.status_code}: {response.text}")
                    continue
                if response.status_code >= 400:
                    raise ValueError(f"Gemini error {response.status_code}: {response.text}")
                return self._extract_content(response.json())
            except ValueError:
                raise
            except Exception as e:
                wait = 2 ** attempt
                print(f"LLM network error: {e}. Retrying in {wait}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(wait)
                last_exc = e

        print(f"LLM Error after {max_retries} retries: {last_exc}")
        raise last_exc

    def generate_quiz(
        self,
        context_chunks: List[str],
        topic: str,
        learner_type: str = "Textual",
        count: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Generates concept-aware MCQs from a list of RAG chunks.
        """
        combined_context = "\n\n---\n\n".join(context_chunks)
        user_prompt = prompts.get_quiz_user_prompt(
            combined_context, topic, learner_type, count
        )

        raw_response = self._call_llm(
            system_prompt=prompts.QUIZ_GENERATION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=max(1800, count * 900),
        )

        try:
            return normalize_quiz(self.parse_json_response(raw_response), topic, count)
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Failed to parse LLM JSON: {raw_response}")
            return normalize_quiz([], topic, count)

    def generate_general_quiz(
        self,
        topic: str,
        learner_type: str = "Textual",
        count: int = 3,
    ) -> List[Dict[str, Any]]:
        user_prompt = prompts.get_general_quiz_user_prompt(topic, learner_type, count)

        raw_response = self._call_llm(
            system_prompt=prompts.QUIZ_GENERATION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=max(1800, count * 900),
        )

        try:
            return normalize_quiz(self.parse_json_response(raw_response), topic, count)
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Failed to parse LLM JSON: {raw_response}")
            return normalize_quiz([], topic, count)

    def generate_onboarding_quiz(
        self,
        topic: str = "general learning and discovery",
    ) -> List[Dict[str, Any]]:
        """
        Generates 5 scenario-based questions to determine cognitive learning style
        (Visual, Auditory, Textual, Example/Analogy) across any subject or field.
        """
        user_prompt = prompts.get_onboarding_quiz_user_prompt(topic)
        fallback_questions = [
            {
                "id": 1,
                "scenario": "When learning a complex new subject for the first time, what helps you grasp it fastest?",
                "options": [
                    {"key": "A", "text": "Diagrams, mind maps, infographics, or charts showing how parts connect", "modality": "visual"},
                    {"key": "B", "text": "Listening to a knowledgeable person explain it or discussing it out loud", "modality": "auditory"},
                    {"key": "C", "text": "Reading well-organized notes, bullet points, definitions, and articles", "modality": "text"},
                    {"key": "D", "text": "Walking through concrete real-world cases, everyday examples, or demonstrations", "modality": "example"},
                ],
            },
            {
                "id": 2,
                "scenario": "When you get stuck trying to understand a difficult, confusing concept, what is your first instinct?",
                "options": [
                    {"key": "A", "text": "Sketch out the relationships or look for a visual diagram/graphic", "modality": "visual"},
                    {"key": "B", "text": "Talk through the idea out loud to yourself or ask someone to explain it verbally", "modality": "auditory"},
                    {"key": "C", "text": "Re-read written explanations or look up structured reference summaries", "modality": "text"},
                    {"key": "D", "text": "Think of a relatable everyday metaphor, comparison, or analogy", "modality": "analogy"},
                ],
            },
            {
                "id": 3,
                "scenario": "Which format makes a study session or lesson feel most engaging and easy to absorb?",
                "options": [
                    {"key": "A", "text": "Visual presentations, clear layouts, diagrams, and graphic organizers", "modality": "visual"},
                    {"key": "B", "text": "Audio discussions, podcasts, voice walk-throughs, or conversational explanations", "modality": "auditory"},
                    {"key": "C", "text": "Carefully written articles with clear headings, bullet points, and definitions", "modality": "text"},
                    {"key": "D", "text": "Practical demonstrations, step-by-step walkthroughs, or case studies", "modality": "example"},
                ],
            },
            {
                "id": 4,
                "scenario": "How do you best retain and recall an abstract idea days after learning it?",
                "options": [
                    {"key": "A", "text": "Visualizing the diagram, color cues, or mental picture of the concept", "modality": "visual"},
                    {"key": "B", "text": "Remembering the voice, conversation, tone, or verbal explanation", "modality": "auditory"},
                    {"key": "C", "text": "Reviewing organized written notes, highlights, and summary flashcards", "modality": "text"},
                    {"key": "D", "text": "Remembering a vivid real-life story, metaphor, or comparison", "modality": "analogy"},
                ],
            },
            {
                "id": 5,
                "scenario": "If you had 15 minutes to review before an exam or presentation on any subject, you would prefer:",
                "options": [
                    {"key": "A", "text": "A one-page visual cheat sheet with diagrams, flowcharts, and tables", "modality": "visual"},
                    {"key": "B", "text": "A quick 10-minute audio breakdown or voice conversation recap", "modality": "auditory"},
                    {"key": "C", "text": "A concise bullet-point summary of key terms, facts, and definitions", "modality": "text"},
                    {"key": "D", "text": "A sample scenario or case study worked through step-by-step", "modality": "example"},
                ],
            },
        ]

        try:
            raw_response = self._call_llm(
                system_prompt=prompts.ONBOARDING_QUIZ_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=0.4,
                max_tokens=2000,
            )
            parsed = self.parse_json_response(raw_response)
            if isinstance(parsed, list) and len(parsed) >= 3:
                return parsed
        except Exception as e:
            print(f"[LLMService] generate_onboarding_quiz failed ({e}), using fallback questions")

        return fallback_questions

    def analyze_misconception(

        self,
        context_chunks: List[str],
        question: str,
        wrong_answer: str,
        correct_answer: str,
    ) -> str:
        """
        Analyzes why a user got a question wrong based on RAG context.
        """
        combined_context = "\n\n---\n\n".join(context_chunks)
        user_prompt = prompts.get_analysis_user_prompt(
            combined_context, question, wrong_answer, correct_answer
        )

        return self._call_llm(
            system_prompt=prompts.MISCONCEPTION_ANALYSIS_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.3,
        )

    def chat(
        self,
        context_chunks: List[str],
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        """
        RAG-grounded multi-turn chat. History is a list of {"role": "user"/"assistant", "content": "..."}.
        """
        combined_context = "\n\n---\n\n".join(context_chunks)
        user_prompt = prompts.get_chat_user_prompt(combined_context, message)

        return self._call_llm(
            system_prompt=prompts.CHAT_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.5,
            max_tokens=1024,
            history=history,
        )

    def general_chat(
        self,
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        return self._call_llm(
            system_prompt=prompts.GENERAL_CHAT_SYSTEM_PROMPT,
            user_prompt=prompts.get_general_chat_user_prompt(message),
            temperature=0.5,
            max_tokens=700,
            history=history,
        )

    def general_study_chat(
        self,
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        return self._call_llm(
            system_prompt=prompts.GENERAL_STUDY_CHAT_SYSTEM_PROMPT,
            user_prompt=prompts.get_general_study_chat_user_prompt(message),
            temperature=0.5,
            max_tokens=1024,
            history=history,
        )

    def stream_general_chat(
        self,
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Generator[str, None, None]:
        payload = self._build_payload(
            system_prompt=prompts.GENERAL_CHAT_SYSTEM_PROMPT,
            user_prompt=prompts.get_general_chat_user_prompt(message),
            temperature=0.5,
            max_tokens=700,
            history=history,
        )

        response = requests.post(
            f"{self._url('streamGenerateContent')}?alt=sse",
            headers=self._headers(),
            json=payload,
            timeout=settings.GEMINI_TIMEOUT,
            stream=True,
        )
        if response.status_code >= 400:
            raise ValueError(f"Gemini error {response.status_code}: {response.text}")

        for line in response.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            chunk = json.loads(line.removeprefix("data: "))
            parts = chunk.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            for part in parts:
                text = part.get("text")
                if text:
                    yield text

    def stream_auditory_query(
        self,
        system_prompt: str,
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Generator[str, None, None]:
        payload = self._build_payload(
            system_prompt=system_prompt,
            user_prompt=message,
            temperature=0.6,
            max_tokens=200,
            history=history,
        )

        response = requests.post(
            f"{self._url('streamGenerateContent')}?alt=sse",
            headers=self._headers(),
            json=payload,
            timeout=settings.GEMINI_TIMEOUT,
            stream=True,
        )
        if response.status_code >= 400:
            raise ValueError(f"Gemini error {response.status_code}: {response.text}")

        for line in response.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            chunk = json.loads(line.removeprefix("data: "))
            parts = chunk.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            for part in parts:
                text = part.get("text")
                if text:
                    yield text

    def stream_general_study_chat(
        self,
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Generator[str, None, None]:
        payload = self._build_payload(
            system_prompt=prompts.GENERAL_STUDY_CHAT_SYSTEM_PROMPT,
            user_prompt=prompts.get_general_study_chat_user_prompt(message),
            temperature=0.5,
            max_tokens=1024,
            history=history,
        )

        response = requests.post(
            f"{self._url('streamGenerateContent')}?alt=sse",
            headers=self._headers(),
            json=payload,
            timeout=settings.GEMINI_TIMEOUT,
            stream=True,
        )
        if response.status_code >= 400:
            raise ValueError(f"Gemini error {response.status_code}: {response.text}")

        for line in response.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            chunk = json.loads(line.removeprefix("data: "))
            parts = chunk.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            for part in parts:
                text = part.get("text")
                if text:
                    yield text

    def stream_chat(
        self,
        context_chunks: List[str],
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Generator[str, None, None]:
        combined_context = "\n\n---\n\n".join(context_chunks)
        user_prompt = prompts.get_chat_user_prompt(combined_context, message)
        payload = self._build_payload(
            system_prompt=prompts.CHAT_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.5,
            max_tokens=1024,
            history=history,
        )

        response = requests.post(
            f"{self._url('streamGenerateContent')}?alt=sse",
            headers=self._headers(),
            json=payload,
            timeout=settings.GEMINI_TIMEOUT,
            stream=True,
        )
        if response.status_code >= 400:
            raise ValueError(f"Gemini error {response.status_code}: {response.text}")

        for line in response.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            chunk = json.loads(line.removeprefix("data: "))
            parts = chunk.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            for part in parts:
                text = part.get("text")
                if text:
                    yield text

    def visual_explain_article(
        self,
        numbered_context: str,
        concept: str,
        learner_type: str = "Visual",
    ) -> str:
        """Single LLM call → full illustrated article JSON (title, sections[], references[])."""
        user_prompt = prompts.get_visual_article_user_prompt(
            numbered_context, concept, learner_type
        )
        return self._call_llm(
            system_prompt=prompts.VISUAL_ARTICLE_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=4096,
            model=self.article_model,  # use high-context model
        )

    def compose_note_article(
        self,
        numbered_context: str,
        concept: str,
        learner_type: str = "Visual",
    ) -> str:
        """Plan and write a structured note with meaningful visual slots."""
        user_prompt = prompts.get_note_composer_user_prompt(
            numbered_context, concept, learner_type
        )
        return self._call_llm(
            system_prompt=prompts.NOTE_COMPOSER_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.35,
            max_tokens=4096,
            model=self.article_model,
        )

    def generate_diagram_from_selection(self, text: str) -> str:
        """Single call: emit a semantic graph (nodes + edges) for a short text snippet.
        The layout solver, not the LLM, picks coordinates."""
        return self._call_llm(
            system_prompt=prompts.QUICK_DIAGRAM_SYSTEM_PROMPT,
            user_prompt=prompts.get_quick_diagram_user_prompt(text[:600]),
            temperature=0.3,
            max_tokens=700,
            model=self.article_model,
        )


# Singleton instance
llm_service = LLMService()

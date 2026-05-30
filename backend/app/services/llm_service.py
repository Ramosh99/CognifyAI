import json
import re
from typing import Any, Dict, Generator, List, Optional

import requests

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
    ) -> str:
        """Invoke Gemini. Pass model= to override the default."""
        try:
            response = requests.post(
                self._url("generateContent", model),
                headers=self._headers(),
                json=self._build_payload(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    history=history,
                ),
                timeout=settings.GEMINI_TIMEOUT,
            )
            if response.status_code >= 400:
                raise ValueError(f"Gemini error {response.status_code}: {response.text}")
            return self._extract_content(response.json())
        except Exception as e:
            print(f"LLM Error: {e}")
            raise

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
        )

        try:
            return self.parse_json_response(raw_response)
        except json.JSONDecodeError as e:
            print(f"Failed to parse LLM JSON: {raw_response}")
            raise ValueError("LLM did not return valid JSON.") from e

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
        )

        try:
            return self.parse_json_response(raw_response)
        except json.JSONDecodeError as e:
            print(f"Failed to parse LLM JSON: {raw_response}")
            raise ValueError("LLM did not return valid JSON.") from e

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

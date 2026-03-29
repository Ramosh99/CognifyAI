import json
from groq import Groq
from typing import List, Dict, Any, Optional

from app.core.config import settings
from app.core import prompts


class LLMService:
    def __init__(self):
        self._client = Groq(api_key=settings.GROQ_API_KEY)
        self.default_model = "groq/compound"

    def _extract_content(self, response) -> str:
        """
        Safely extract text content from a Groq response.
        """
        if response is None:
            raise ValueError("LLM returned a None response object.")

        choices = getattr(response, "choices", None)
        if not choices:
            err = getattr(response, "error", None)
            if err:
                raise ValueError(f"LLM API error: {err}")
            raise ValueError("LLM returned an empty choices list.")

        choice = choices[0]
        message = getattr(choice, "message", None)
        content = getattr(message, "content", None) if message else None

        if content is None:
            finish = getattr(choice, "finish_reason", "unknown")
            refusal = getattr(message, "refusal", None) if message else None
            if refusal:
                raise ValueError(f"Model refused to answer: {refusal}")
            raise ValueError(
                f"LLM returned null content (finish_reason='{finish}'). "
                "Try a different model or rephrase your request."
            )

        return content.strip()

    def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.5,
        max_tokens: int = 1024,
    ) -> str:
        """Helper to invoke the Groq Compound model."""
        if not settings.GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY is not configured in .env")

        try:
            response = self._client.chat.completions.create(
                model=self.default_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                max_completion_tokens=max_tokens,
                top_p=1,
                stream=False,
            )
            return self._extract_content(response)
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
            clean_json = raw_response.replace("```json", "").replace("```", "").strip()
            return json.loads(clean_json)
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
        if not settings.GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY is not configured in .env")

        combined_context = "\n\n---\n\n".join(context_chunks)
        user_prompt = prompts.get_chat_user_prompt(combined_context, message)

        messages = [{"role": "system", "content": prompts.CHAT_SYSTEM_PROMPT}]
        for turn in (history or [])[-10:]:
            messages.append({"role": turn["role"], "content": turn["content"]})
        messages.append({"role": "user", "content": user_prompt})

        response = self._client.chat.completions.create(
            model=self.default_model,
            messages=messages,
            temperature=0.5,
            max_completion_tokens=1024,
            top_p=1,
            stream=False,
        )
        return self._extract_content(response)

    def visual_explain_text(
        self,
        numbered_context: str,
        concept: str,
        learner_type: str = "Visual",
    ) -> str:
        """Call 1: Returns JSON — title, explanation, highlights, references."""
        user_prompt = prompts.get_visual_text_user_prompt(
            numbered_context, concept, learner_type
        )
        return self._call_llm(
            system_prompt=prompts.VISUAL_TEXT_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=1200,
        )

    def visual_explain_diagram(self, concept: str, title: str, highlights: list) -> str:
        """
        Returns structured JSON for the diagram: {diagram_type, center, nodes[]}.
        The frontend renders the actual SVG from this data.
        """
        user_prompt = prompts.get_visual_diagram_user_prompt(concept, title, highlights)
        return self._call_llm(
            system_prompt=prompts.VISUAL_DIAGRAM_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=400,
        )


# Singleton instance
llm_service = LLMService()

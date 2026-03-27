import json
from openai import OpenAI
from typing import List, Dict, Any, Optional

from app.core.config import settings
from app.core import prompts

class LLMService:
    def __init__(self):
        # Initialize OpenAI client to point to OpenRouter
        # OpenRouter uses the exact same API signature as OpenAI
        self._client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.OPENROUTER_API_KEY,
        )
        # We use a fast, affordable model for reasoning by default
        self.default_model = "minimax/minimax-m2.5:free"

    def _extract_content(self, response) -> str:
        """
        Safely extract text content from an OpenRouter/OpenAI response.
        Some models (e.g. minimax) can return None content or empty choices.
        """
        if response is None:
            raise ValueError("LLM returned a None response object.")

        choices = getattr(response, "choices", None)
        if not choices:
            # Try to surface any error message the API embedded in the response
            err = getattr(response, "error", None)
            if err:
                raise ValueError(f"LLM API error: {err}")
            raise ValueError("LLM returned an empty choices list — the model may not support this request.")

        choice  = choices[0]
        message = getattr(choice, "message", None)
        content = getattr(message, "content", None) if message else None

        if content is None:
            # Some models use finish_reason='content_filter' or refusal
            finish  = getattr(choice, "finish_reason", "unknown")
            refusal = getattr(message, "refusal", None) if message else None
            if refusal:
                raise ValueError(f"Model refused to answer: {refusal}")
            raise ValueError(
                f"LLM returned null content (finish_reason='{finish}'). "
                "Try a different model or rephrase your request."
            )

        return content.strip()

    def _call_llm(self, system_prompt: str, user_prompt: str, response_format: str = "text") -> str:
        """Helper to invoke the OpenRouter LLM"""
        if not settings.OPENROUTER_API_KEY:
            raise ValueError("OPENROUTER_API_KEY is not configured in .env")

        extra_headers = {
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": settings.PROJECT_NAME,
        }

        try:
            response = self._client.chat.completions.create(
                model=self.default_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
                extra_headers=extra_headers,
                temperature=0.3,
            )
            return self._extract_content(response)
        except Exception as e:
            print(f"LLM Error: {e}")
            raise


    def generate_quiz(self, context_chunks: List[str], topic: str, learner_type: str = "Textual", count: int = 3) -> List[Dict[str, Any]]:
        """
        Generates concept-aware MCQs from a list of RAG chunks.
        """
        combined_context = "\n\n---\n\n".join(context_chunks)
        user_prompt = prompts.get_quiz_user_prompt(combined_context, topic, learner_type, count)
        
        raw_response = self._call_llm(
            system_prompt=prompts.QUIZ_GENERATION_SYSTEM_PROMPT,
            user_prompt=user_prompt
        )

        # Attempt to parse the JSON. Since LLMs sometimes wrap JSON in markdown blocks (```json), we strip it.
        try:
            clean_json = raw_response.replace("```json", "").replace("```", "").strip()
            return json.loads(clean_json)
        except json.JSONDecodeError as e:
            print(f"Failed to parse LLM JSON: {raw_response}")
            raise ValueError("LLM did not return valid JSON.") from e

    def analyze_misconception(self, context_chunks: List[str], question: str, wrong_answer: str, correct_answer: str) -> str:
        """
        Analyzes why a user got a question wrong based on RAG context.
        """
        combined_context = "\n\n---\n\n".join(context_chunks)
        user_prompt = prompts.get_analysis_user_prompt(combined_context, question, wrong_answer, correct_answer)

        return self._call_llm(
            system_prompt=prompts.MISCONCEPTION_ANALYSIS_SYSTEM_PROMPT,
            user_prompt=user_prompt
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
        if not settings.OPENROUTER_API_KEY:
            raise ValueError("OPENROUTER_API_KEY is not configured in .env")

        combined_context = "\n\n---\n\n".join(context_chunks)
        user_prompt = prompts.get_chat_user_prompt(combined_context, message)

        extra_headers = {
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": settings.PROJECT_NAME,
        }

        messages = [{"role": "system", "content": prompts.CHAT_SYSTEM_PROMPT}]
        # Inject conversation history (last 10 turns to stay within context)
        for turn in (history or [])[-10:]:
            messages.append({"role": turn["role"], "content": turn["content"]})
        messages.append({"role": "user", "content": user_prompt})

        response = self._client.chat.completions.create(
            model=self.default_model,
            messages=messages,
            extra_headers=extra_headers,
            temperature=0.4,
        )
        return self._extract_content(response)

    def visual_explain_text(
        self,
        numbered_context: str,
        concept: str,
        learner_type: str = "Visual",
    ) -> str:
        """Call 1: Returns small JSON — title, explanation, highlights, references. No SVG."""
        user_prompt = prompts.get_visual_text_user_prompt(numbered_context, concept, learner_type)
        extra_headers = {"HTTP-Referer": "http://localhost:3000", "X-Title": settings.PROJECT_NAME}
        response = self._client.chat.completions.create(
            model=self.default_model,
            messages=[
                {"role": "system", "content": prompts.VISUAL_TEXT_SYSTEM_PROMPT},
                {"role": "user",   "content": user_prompt},
            ],
            extra_headers=extra_headers,
            temperature=0.3,
            max_tokens=1200,
        )
        return self._extract_content(response)

    def visual_explain_diagram(self, concept: str, title: str, highlights: list) -> str:
        """
        Returns structured JSON for the diagram: {diagram_type, center, nodes[]}.
        The frontend renders the actual SVG from this data.
        This is much more reliable than asking the LLM to write raw SVG.
        """
        user_prompt = prompts.get_visual_diagram_user_prompt(concept, title, highlights)
        extra_headers = {"HTTP-Referer": "http://localhost:3000", "X-Title": settings.PROJECT_NAME}
        response = self._client.chat.completions.create(
            model=self.default_model,
            messages=[
                {"role": "system", "content": prompts.VISUAL_DIAGRAM_SYSTEM_PROMPT},
                {"role": "user",   "content": user_prompt},
            ],
            extra_headers=extra_headers,
            temperature=0.3,
            max_tokens=400,     # tiny response — just labels and type
        )
        return self._extract_content(response)


# Singleton instance
llm_service = LLMService()

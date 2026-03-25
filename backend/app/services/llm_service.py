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
        self.default_model = "openai/gpt-oss-120b:free"

    def _call_llm(self, system_prompt: str, user_prompt: str, response_format: str = "text") -> str:
        """Helper to invoke the OpenRouter LLM"""
        if not settings.OPENROUTER_API_KEY:
            raise ValueError("OPENROUTER_API_KEY is not configured in .env")

        # Set up OpenRouter specific headers if needed
        extra_headers = {
            "HTTP-Referer": "http://localhost:3000", # Required by OpenRouter for ranking
            "X-Title": settings.PROJECT_NAME,
        }

        try:
            response = self._client.chat.completions.create(
                model=self.default_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                extra_headers=extra_headers,
                # Some models support JSON mode, but standard text generation with strict prompts works universally
                temperature=0.3, # Low temperature for analytical tasks
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"LLM Error: {e}")
            raise e

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


# Singleton instance
llm_service = LLMService()

import os
import asyncio
from typing import Optional

from notebooklm import NotebookLMClient, MindMapKind
from notebooklm.rpc import QuizDifficulty, QuizQuantity


DIFFICULTY_MAP = {
    "easy": QuizDifficulty.EASY,
    "medium": QuizDifficulty.MEDIUM,
    "hard": QuizDifficulty.HARD,
}

QUANTITY_MAP = {
    "fewer": QuizQuantity.FEWER,
    "standard": QuizQuantity.STANDARD,
    "more": QuizQuantity.STANDARD,
}


class NotebookService:
    def __init__(self, client: NotebookLMClient):
        self.client = client

    async def create_notebook(self, title: str) -> str:
        nb = await self.client.notebooks.create(title)
        return nb.id

    async def add_file_source(self, notebook_id: str, file_path: str):
        await self.client.sources.add_file(notebook_id, file_path, wait=True)

    async def add_file_sources(self, notebook_id: str, file_paths: list[str]):
        tasks = [self.add_file_source(notebook_id, fp) for fp in file_paths]
        await asyncio.gather(*tasks)

    async def generate_mind_map(self, notebook_id: str):
        await self.client.mind_maps.generate(
            notebook_id, kind=MindMapKind.INTERACTIVE, wait=True
        )

    async def generate_quiz(
        self,
        notebook_id: str,
        difficulty: str = "medium",
        quantity: str = "standard",
        instructions: Optional[str] = None,
    ) -> str:
        diff = DIFFICULTY_MAP.get(difficulty, QuizDifficulty.MEDIUM)
        qty = QUANTITY_MAP.get(quantity, QuizQuantity.STANDARD)
        kwargs = {"difficulty": diff, "quantity": qty}
        if instructions:
            kwargs["instructions"] = instructions
        status = await self.client.artifacts.generate_quiz(notebook_id, **kwargs)
        await self.client.artifacts.wait_for_completion(
            notebook_id, status.task_id, timeout=600
        )
        return status.task_id

    async def generate_flashcards(
        self,
        notebook_id: str,
        difficulty: str = "medium",
        quantity: str = "standard",
        instructions: Optional[str] = None,
    ) -> str:
        diff = DIFFICULTY_MAP.get(difficulty, QuizDifficulty.MEDIUM)
        qty = QUANTITY_MAP.get(quantity, QuizQuantity.STANDARD)
        kwargs = {"difficulty": diff, "quantity": qty}
        if instructions:
            kwargs["instructions"] = instructions
        status = await self.client.artifacts.generate_flashcards(
            notebook_id, **kwargs
        )
        await self.client.artifacts.wait_for_completion(
            notebook_id, status.task_id, timeout=600
        )
        return status.task_id

    async def get_notebook_url(self, notebook_id: str) -> str:
        return f"https://notebooklm.google.com/notebook/{notebook_id}"

    async def list_notebooks(self) -> list[dict]:
        notebooks = await self.client.notebooks.list()
        return [
            {
                "id": nb.id,
                "title": nb.title,
                "url": f"https://notebooklm.google.com/notebook/{nb.id}",
            }
            for nb in notebooks
        ]

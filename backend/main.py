import os
import json
import tempfile
import shutil
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from notebooklm import NotebookLMClient
from notebooklm import RPCError

from .notebook_service import NotebookService
from .file_converter import SUPPORTED_EXTENSIONS


FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    auth_json = os.environ.get("NOTEBOOKLM_AUTH_JSON")
    if auth_json:
        os.environ["NOTEBOOKLM_AUTH_JSON"] = auth_json

    try:
        async with NotebookLMClient.from_storage() as client:
            app.state.client = client
            app.state.service = NotebookService(client)
            notebooks = await client.notebooks.list()
            print(f"Authenticated. Found {len(notebooks)} notebooks.")
            yield
    except Exception as e:
        print(f"Auth failed: {e}")
        print("Set NOTEBOOKLM_AUTH_JSON env var with valid session cookies.")
        app.state.client = None
        app.state.service = None
        yield


app = FastAPI(lifespan=lifespan)

app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
async def index():
    html_path = FRONTEND_DIR / "index.html"
    if html_path.exists():
        return HTMLResponse(html_path.read_text(encoding="utf-8"))
    return {"error": "frontend not found"}


@app.get("/manifest.json")
async def manifest():
    manifest_path = FRONTEND_DIR / "manifest.json"
    if manifest_path.exists():
        return FileResponse(str(manifest_path), media_type="application/json")
    return {"error": "not found"}


@app.get("/sw.js")
async def service_worker():
    sw_path = FRONTEND_DIR / "sw.js"
    if sw_path.exists():
        return FileResponse(str(sw_path), media_type="application/javascript")
    return {"error": "not found"}


@app.post("/upload")
async def upload_files(
    files: list[UploadFile] = File(...),
    notebook_name: str = Form(...),
    generate_mindmap: bool = Form(False),
    generate_quiz: bool = Form(False),
    quiz_difficulty: str = Form("medium"),
    quiz_quantity: str = Form("standard"),
    quiz_instructions: str = Form(""),
    generate_flashcards: bool = Form(False),
    flashcards_difficulty: str = Form("medium"),
    flashcards_quantity: str = Form("standard"),
    flashcards_instructions: str = Form(""),
):
    service: NotebookService | None = getattr(app.state, "service", None)
    if not service:
        raise HTTPException(
            status_code=503,
            detail="NotebookLM not authenticated. Set NOTEBOOKLM_AUTH_JSON env var.",
        )

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    for f in files:
        ext = Path(f.filename).suffix.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {f.filename} (supported: PDF, DOCX, PPTX — save old .ppt files as .pptx first)",
            )

    tmp_dir = tempfile.mkdtemp()
    try:
        tmp_paths = []
        for uploaded_file in files:
            tmp_path = os.path.join(tmp_dir, uploaded_file.filename)
            content = await uploaded_file.read()
            with open(tmp_path, "wb") as f:
                f.write(content)
            tmp_paths.append(tmp_path)

        notebook_id = await service.create_notebook(notebook_name)

        await service.add_file_sources(notebook_id, tmp_paths)

        generation_tasks = []

        if generate_mindmap:
            t = asyncio.create_task(
                service.generate_mind_map(notebook_id)
            )
            generation_tasks.append(("mind_map", t))

        if generate_quiz:
            t = asyncio.create_task(
                service.generate_quiz(
                    notebook_id,
                    difficulty=quiz_difficulty,
                    quantity=quiz_quantity,
                    instructions=quiz_instructions or None,
                )
            )
            generation_tasks.append(("quiz", t))

        if generate_flashcards:
            t = asyncio.create_task(
                service.generate_flashcards(
                    notebook_id,
                    difficulty=flashcards_difficulty,
                    quantity=flashcards_quantity,
                    instructions=flashcards_instructions or None,
                )
            )
            generation_tasks.append(("flashcards", t))

        if generation_tasks:
            await asyncio.gather(*[t for _, t in generation_tasks])

        notebook_url = await service.get_notebook_url(notebook_id)

        return {
            "success": True,
            "notebook_id": notebook_id,
            "notebook_url": notebook_url,
            "notebook_name": notebook_name,
            "generated": {
                "mind_map": generate_mindmap,
                "quiz": generate_quiz,
                "flashcards": generate_flashcards,
            },
        }

    except RPCError as e:
        raise HTTPException(status_code=502, detail=f"NotebookLM API error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/notebooks")
async def list_notebooks():
    service: NotebookService | None = getattr(app.state, "service", None)
    if not service:
        raise HTTPException(
            status_code=503, detail="NotebookLM not authenticated"
        )
    try:
        notebooks = await service.list_notebooks()
        return {"notebooks": notebooks}
    except RPCError as e:
        raise HTTPException(status_code=502, detail=f"NotebookLM API error: {e}")

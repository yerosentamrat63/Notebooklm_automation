import os
import json
import tempfile
import shutil
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
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
                detail=f"Unsupported file type: {f.filename} (supported: PDF, DOCX, PPTX)",
            )

    tmp_dir = tempfile.mkdtemp()

    file_contents = []
    for uploaded_file in files:
        content = await uploaded_file.read()
        file_contents.append((uploaded_file.filename, content))

    async def event_stream():
        try:
            tmp_paths = []
            for filename, content in file_contents:
                tmp_path = os.path.join(tmp_dir, filename)
                with open(tmp_path, "wb") as f:
                    f.write(content)
                tmp_paths.append(tmp_path)

            notebook_id = await service.create_notebook(notebook_name)
            yield json.dumps({"step": "notebook", "status": "done"}) + "\n"

            await service.add_file_sources(notebook_id, tmp_paths)
            yield json.dumps({"step": "sources", "status": "done"}) + "\n"

            generation_tasks = []

            if generate_mindmap:
                yield json.dumps({"step": "mind_map", "status": "active"}) + "\n"
                t = asyncio.create_task(service.generate_mind_map(notebook_id))
                generation_tasks.append(("mind_map", t))

            if generate_quiz:
                yield json.dumps({"step": "quiz", "status": "active"}) + "\n"
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
                yield json.dumps({"step": "flashcards", "status": "active"}) + "\n"
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
                for coro in asyncio.as_completed([t for _, t in generation_tasks]):
                    task = await coro
                    for name, t in generation_tasks:
                        if t.done() and not t.cancelled():
                            yield json.dumps({"step": name, "status": "done"}) + "\n"

            notebook_url = await service.get_notebook_url(notebook_id)

            result = {
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
            yield json.dumps({"step": "done", "result": result}) + "\n"

        except RPCError as e:
            yield json.dumps({"step": "error", "detail": f"NotebookLM API error: {e}"}) + "\n"
        except Exception as e:
            yield json.dumps({"step": "error", "detail": str(e)}) + "\n"
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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


@app.get("/auth-status")
async def auth_status():
    auth_json = os.environ.get("NOTEBOOKLM_AUTH_JSON")
    if not auth_json:
        return {"authenticated": False, "error": "No auth cookies configured"}
    try:
        data = json.loads(auth_json)
        cookies = data.get("cookies", [])
        critical_names = {"SID", "__Secure-1PSIDTS", "SAPISID", "APISID"}
        earliest_expiry = None
        for c in cookies:
            if c.get("name") not in critical_names:
                continue
            exp = c.get("expires", -1)
            if exp > 0:
                if earliest_expiry is None or exp < earliest_expiry:
                    earliest_expiry = exp
        import time
        now = time.time()
        if earliest_expiry and earliest_expiry < now:
            return {"authenticated": False, "error": "Cookies expired", "expired_at": int(earliest_expiry)}
        remaining = int(earliest_expiry - now) if earliest_expiry else None
        return {"authenticated": True, "expires_in": remaining, "cookie_count": len(cookies)}
    except Exception:
        return {"authenticated": False, "error": "Invalid auth format"}

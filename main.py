import os
from dotenv import load_dotenv
load_dotenv()
import time, uuid
from typing import Optional
from datetime import datetime
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import google.generativeai as genai
from knowledge_base import SYSTEM_PROMPT
from sentiment_analysis import analyze, build_sentiment_note
from sheets_logger import log_interaction, log_qa_cache
try:
    from langdetect import detect as _detect
except ImportError:
    _detect = None

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

if not GEMINI_API_KEY:
    print("⚠️  GEMINI_API_KEY is not set. Chat will fail until the key is provided.")
else:
    genai.configure(api_key=GEMINI_API_KEY)
    print(f"✅ Gemini configured — model: {GEMINI_MODEL}")

app = FastAPI(title="ARION — FlowZint AI Assistant", version="2.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

sessions: dict[str, dict] = {}
MAX_HISTORY, SESSION_TTL = 20, 3600

def get_session(sid: str) -> dict:
    now = time.time()
    if sid not in sessions:
        sessions[sid] = {
            "messages": [],
            "message_count": 0,
            "created_at": now,
            "last_active": now,
        }
    else:
        sessions[sid]["last_active"] = now
    return sessions[sid]


def prune_sessions():
    now = time.time()
    for sid in [k for k, v in sessions.items() if now - v["last_active"] > SESSION_TTL]:
        del sessions[sid]

_LATIN_AMBIGUOUS = {"af","ca","cs","cy","da","de","es","et","eu","fi","fr","ga","gl","hr","hu","id","it","lt","lv","ms","mt","nl","no","pl","pt","ro","sk","sl","sq","sv","tl","tr","vi"}
_MIN_WORDS_FOR_LATIN = 8
_MIN_WORDS_FOR_OTHER = 3


def detect_language_safe(text: str) -> str:
    if not _detect:
        return "en"
    stripped = text.strip()
    word_count = len(stripped.split())
    if word_count < 2:
        return "en"
    try:
        from langdetect import detect_langs

        results = detect_langs(stripped)
        if not results:
            return "en"
        top = results[0]
        lang, prob = top.lang, top.prob
        if lang == "en":
            return "en"
        if lang in _LATIN_AMBIGUOUS:
            if prob < 0.85 or word_count < _MIN_WORDS_FOR_LATIN:
                return "en"
        else:
            if prob < 0.70 or word_count < _MIN_WORDS_FOR_OTHER:
                return "en"
        return lang
    except Exception:
        return "en"

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    mode_hint: Optional[str] = ""


class ChatResponse(BaseModel):
    reply: str
    session_id: str
    sentiment: str
    intent: str
    escalated: bool
    message_count: int
    response_time_ms: int
    language: str
    model: str


class SessionResetRequest(BaseModel):
    session_id: str

@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, background_tasks: BackgroundTasks):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=401, detail="GEMINI_API_KEY is not configured.")

    prune_sessions()
    sid = req.session_id or str(uuid.uuid4())
    session = get_session(sid)
    t0 = time.time()

    sentiment, intent, escalated = analyze(
        req.message, message_count=session["message_count"]
    )
    sentiment_note = build_sentiment_note(sentiment)
    user_lang = detect_language_safe(req.message)

    dynamic_system = SYSTEM_PROMPT
    if req.mode_hint and req.mode_hint.strip():
        dynamic_system = (
            f"[MODE OVERRIDE]\n{req.mode_hint.strip()}\n\n" + dynamic_system
        )
    if sentiment_note:
        dynamic_system = sentiment_note + "\n\n" + dynamic_system
    if user_lang not in ("en", "unknown", ""):
        dynamic_system += (
            f"\n\n[LANGUAGE DIRECTIVE: The user is writing in '{user_lang}'. "
            f"Reply entirely in that language. Keep all FlowZint facts accurate — "
            f"do not invent information not present in the knowledge base.]"
        )

    session["messages"].append({"role": "user", "content": req.message})
    session["message_count"] += 1
    history = session["messages"][-MAX_HISTORY:]

    gemini_history = []
    for msg in history[:-1]: 
        gemini_role = "model" if msg["role"] == "assistant" else "user"
        gemini_history.append({"role": gemini_role, "parts": [msg["content"]]})

    try:
        model = genai.GenerativeModel(
            model_name=GEMINI_MODEL, system_instruction=dynamic_system
        )
        chat_session = model.start_chat(history=gemini_history)
        response = chat_session.send_message(req.message)
        bot_reply = response.text
    except Exception as e:
        err = str(e).lower()
        if (
            "api_key" in err
            or "permission" in err
            or "unauthorized" in err
            or "invalid" in err
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid GEMINI_API_KEY. Get a free key at https://aistudio.google.com/apikey",
            )
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")

    if escalated and "contact@shridhar.group" not in bot_reply:
        bot_reply += "\n\n📧 For immediate human support: contact@shridhar.group or WhatsApp via https://flowzint.in"

    session["messages"].append({"role": "assistant", "content": bot_reply})
    response_time_ms = int((time.time() - t0) * 1000)

    background_tasks.add_task(
        log_interaction,
        session_id=sid,
        user_message=req.message,
        bot_response=bot_reply,
        sentiment=sentiment,
        intent=intent,
        escalated=escalated,
        response_time_ms=response_time_ms,
        language=user_lang,
    )
    background_tasks.add_task(
        log_qa_cache,
        session_id=sid,
        question=req.message,
        answer=bot_reply,
        intent=intent,
        sentiment=sentiment,
        language=user_lang,
    )

    return ChatResponse(
        reply=bot_reply,
        session_id=sid,
        sentiment=sentiment,
        intent=intent,
        escalated=escalated,
        message_count=session["message_count"],
        response_time_ms=response_time_ms,
        language=user_lang,
        model=GEMINI_MODEL,
    )

@app.post("/api/session/reset")
async def reset_session(req: SessionResetRequest):
    sessions.pop(req.session_id, None)
    return {"status": "ok"}

@app.get("/api/health")
async def health():
    return {
        "status": "online",
        "service": "ARION",
        "version": "2.0.0",
        "model": GEMINI_MODEL,
        "active_sessions": len(sessions),
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(static_dir, "index.html"))

@app.get("/{path:path}")
async def serve_app(path: str):
    return FileResponse(os.path.join(static_dir, "index.html"))

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app", host="0.0.0.0", port=int(os.getenv("PORT", 5000)))

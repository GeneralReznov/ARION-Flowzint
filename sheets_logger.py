import csv
import os
import re
import threading
from datetime import datetime, timezone

_BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
LOGS_DIR    = os.path.join(_BASE_DIR, "logs")
INTERACTIONS_CSV = os.path.join(LOGS_DIR, "interactions.csv")
QA_CACHE_CSV     = os.path.join(LOGS_DIR, "qa_cache.csv")

HEADERS_INTERACTIONS = [
    "Timestamp (UTC)",
    "Session ID",
    "User Message",
    "Bot Response",
    "Sentiment",
    "Intent",
    "Language",
    "Escalated",
    "Response Time (ms)",
]

HEADERS_QA = [
    "Timestamp (UTC)",
    "Session ID",
    "Question",
    "Answer",
    "Language",
    "Intent",
    "Sentiment",
    "Answer Word Count",
]

_lock = threading.Lock()

def _ensure_csv(path: str, headers: list[str]) -> None:
    """Create the CSV file with a header row if it doesn't already exist."""
    os.makedirs(LOGS_DIR, exist_ok=True)
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(headers)
        print(f"📋 Created log file: {path}")


_ensure_csv(INTERACTIONS_CSV, HEADERS_INTERACTIONS)
_ensure_csv(QA_CACHE_CSV,     HEADERS_QA)
print("✅ CSV Logger: ONLINE — logs/ directory ready")

def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _append(path: str, row: list) -> None:
    """Thread-safe CSV row append."""
    with _lock:
        with open(path, "a", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(row)

_HINDI_WORDS = {"hai","nahi","kya","karo","hoga","mujhe","aap","mera",
                "achha","badhiya","paisa","madad"}
_TAMIL_WORDS = {"illa","enna","romba","vanakkam","nalla","seekram",
                "udane","velai","kanduka","kaasu","udhavi"}

def _lang_label(text: str, detected: str = "") -> str:
    """Return a human-readable language label for the CSV."""
    if detected and detected not in ("en", "unknown", ""):
        return detected.upper()
    lo = text.lower()
    h = sum(1 for w in _HINDI_WORDS if re.search(r"\b" + w + r"\b", lo))
    t = sum(1 for w in _TAMIL_WORDS if re.search(r"\b" + w + r"\b", lo))
    if h and t:   return "Mixed"
    if h:         return "Hinglish"
    if t:         return "Tanglish"
    if re.search(r"[\u0900-\u097F]", text): return "Hindi"
    if re.search(r"[\u0B80-\u0BFF]", text): return "Tamil"
    return "English"

def log_interaction(
    session_id: str,
    user_message: str,
    bot_response: str,
    sentiment: str,
    intent: str,
    escalated: bool,
    response_time_ms: int,
    language: str = "",
) -> None:
    """Append one row to interactions.csv."""
    lang = _lang_label(user_message, language)
    print(f"[LOG] {session_id[:8]} | {lang} | {sentiment} | {intent} | {response_time_ms}ms")
    try:
        _append(INTERACTIONS_CSV, [
            _now(),
            session_id[:8],
            user_message[:500],
            bot_response[:1000],
            sentiment.upper(),
            intent.upper(),
            lang,
            "YES" if escalated else "NO",
            f"{response_time_ms}ms",
        ])
    except Exception as e:
        print(f"⚠️  [CSV Interactions] write failed: {e}")


def log_qa_cache(
    session_id: str,
    question: str,
    answer: str,
    intent: str,
    sentiment: str,
    language: str = "",
) -> None:
    """Append one row to qa_cache.csv — skips trivial greetings."""
    if intent == "greeting" and len(question.strip()) < 10:
        return
    lang = _lang_label(question, language)
    word_count = len(answer.split())
    try:
        _append(QA_CACHE_CSV, [
            _now(),
            session_id[:8],
            question[:400],
            answer[:1200],
            lang,
            intent.upper(),
            sentiment.upper(),
            word_count,
        ])
        print(f"📝 [QA] {intent} | {lang} | {word_count} words")
    except Exception as e:
        print(f"⚠️  [CSV QA Cache] write failed: {e}")

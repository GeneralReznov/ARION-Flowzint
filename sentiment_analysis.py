import re
from typing import Tuple
FRUSTRATED_KEYWORDS = [
    "angry", "frustrated", "terrible", "awful", "useless", "broken",
    "not working", "pathetic", "waste", "refund", "horrible", "worst",
    "hate", "trash", "disgusting", "incompetent", "scam", "lied", "fake",
    "bekar", "kharab", "gussa", "khatam", "fraud", "bakwas", "chutiya",
    "mosam", "kevalam", "kandravi", "kuppa", "waste", "velai seiyala", "kanduka"
]

URGENT_KEYWORDS = [
    "urgent", "asap", "immediately", "right now", "critical", "emergency",
    "deadline", "production down", "live issue", "can't wait", "right away",
    "jaldi", "fatafat", "seekram", "udane", "fast", "quick"
]

POSITIVE_KEYWORDS = [
    "great", "awesome", "love", "excellent", "perfect", "thanks", "thank you",
    "helpful", "amazing", "impressed", "good job", "well done",
    "achha", "badhiya", "super", "nalla", "mass", "vera level", "pakka"
]


def analyze_sentiment(text: str) -> str:
    """Returns: 'frustrated' | 'urgent' | 'positive' | 'neutral'"""
    lower = text.lower()
    if any(kw in lower for kw in FRUSTRATED_KEYWORDS):
        return "frustrated"
    if any(kw in lower for kw in URGENT_KEYWORDS):
        return "urgent"
    if any(kw in lower for kw in POSITIVE_KEYWORDS):
        return "positive"
    return "neutral"

INTENT_PATTERNS = {
    "pricing":    r"(price|cost|budget|quote|how much|charges|fee|rate|afford|valai|kaasu|paisa)",
    "support":    r"(help|issue|problem|error|bug|not working|broken|fix|trouble|udhavi|madad)",
    "sales":      r"(build|develop|create|need a (website|app|bot)|start a project|hire|services)",
    "account":    r"(login|sign in|sign up|account|password|register|profile|access)",
    "project":    r"(status|project|vault|progress|update|milestone|delivery|timeline)",
    "billing":    r"(invoice|payment|bill|paid|transaction|receipt|refund|charge)",
    "escalation": r"(speak to (human|person|agent|someone)|escalate|manager|supervisor|complaint|customer care)",
    "greeting":   r"^(hi|hello|hey|good (morning|evening|afternoon)|howdy|namaste|hii|helo|vanakkam)",
    "general":    r".*"
}


def analyze_intent(text: str) -> str:
    """Returns the most specific matching intent."""
    lower = text.lower().strip()
    for intent, pattern in INTENT_PATTERNS.items():
        if re.search(pattern, lower):
            return intent
    return "general"

def should_escalate(text: str, sentiment: str, intent: str, message_count: int) -> bool:
    """Determines escalation using combined Sentiment + Intent matrices."""
    lower = text.lower()

    if intent == "escalation":
        return True

    if re.search(r"(legal|contract|dispute|sue|court|lawyer|police)", lower):
        return True

    if sentiment == "frustrated" and intent in ["billing", "pricing"]:
        return True

    if sentiment == "frustrated" and message_count >= 3:
        return True

    return False


def build_sentiment_note(sentiment: str) -> str:
    """Injects behavioral context into the LLM system prompt without exposing it to the user."""
    notes = {
        "frustrated": "[SYSTEM COMPROMISE AVERTED: User is highly frustrated. Validate their emotions immediately, apologize for the inconvenience, and DO NOT blame the user. Offer clear next steps.]",
        "urgent":     "[SYSTEM OVERRIDE: User is in a rush. Drop conversational filler. Provide direct, bullet-point answers immediately.]",
        "positive":   "[SYSTEM NOTE: User is happy. Match their energy, be warm, and subtly offer to help them explore more FlowZint services.]",
        "neutral":    ""
    }
    return notes.get(sentiment, "")


def analyze(text: str, message_count: int = 0) -> Tuple[str, str, bool]:
    """
    Master analyze function.
    Returns: (sentiment, intent, should_escalate)
    """
    sentiment = analyze_sentiment(text)
    intent    = analyze_intent(text)
    escalate  = should_escalate(text, sentiment, intent, message_count)
    return sentiment, intent, escalate

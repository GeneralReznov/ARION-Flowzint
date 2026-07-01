# ARION — Adaptive Real-time Intelligent Online Network

> An AI-powered customer assistant for **FlowZint**, a digital engineering company. ARION handles customer support, sales inquiries, and project management queries through a grounded knowledge base, real-time sentiment analysis, and seamless voice interaction.

---

## Table of Contents

- [Overview](#overview)
- [Live Demo](#live-demo)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Directory Structure](#directory-structure)
- [Prerequisites](#prerequisites)
- [Local Setup & Installation](#local-setup--installation)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [How It Works](#how-it-works)
- [Logging & Analytics](#logging--analytics)
- [Browser Compatibility](#browser-compatibility)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

ARION (Adaptive Real-time Intelligent Online Network) is a **RAG-based (Retrieval-Augmented Generation)** conversational AI assistant built for FlowZint. It combines Google's Gemini LLM with a structured company knowledge base to deliver accurate, context-aware responses for customer support, sales, and project queries — all without hallucinating information outside its knowledge domain.

---

## Live Demo

> Deployed on Replit — accessible via browser with no installation required.

---

## Features

### 🤖 Core AI Capabilities

- **Grounded Knowledge Base** — All responses are anchored to an XML-structured FlowZint knowledge base (`knowledge_base.py`), preventing hallucination and ensuring accurate company information.
- **Google Gemini LLM** — Powered by `gemini-2.5-flash` for fast, high-quality natural language responses.
- **Session Memory** — Maintains up to 20 turns of conversation history per session with a 1-hour TTL, enabling coherent multi-turn dialogues.
- **Dynamic Persona Routing** — Automatically identifies user intent and routes between three modes:
  - **Support Mode** — Technical issues, troubleshooting, bug reports
  - **Sales Mode** — Pricing, packages, service inquiries
  - **Customer Care Mode** — Billing disputes, account management, escalations

### 🎤 Voice Interaction

- **Speech-to-Text (STT)** — Hands-free voice input using the browser's Web Speech API (`SpeechRecognition`).
- **Text-to-Speech (TTS)** — ARION speaks responses aloud using `SpeechSynthesis` for a fully voice-driven experience.
- **Voice Toggle** — Users can switch between text and voice modes at any time during a session.

### 🌐 Multilingual Support

- **Language Detection** — Automatically detects the user's language using `langdetect`.
- **Multilingual Responses** — Responds in the user's detected language, including:
  - English
  - Hindi
  - Tamil
  - Kannada
  - Hinglish (Hindi + English mix)
  - Tanglish (Tamil + English mix)
  - Other supported Indian and international languages

### 📊 Sentiment & Intent Analysis

- **Real-time Sentiment Detection** — Rule-based engine (`sentiment_analysis.py`) classifies each message as positive, neutral, or negative/frustrated.
- **Intent Identification** — Identifies specific intents such as:
  - Billing queries
  - Pricing inquiries
  - Technical support
  - General information
- **Empathetic Response Shaping** — Sentiment data is injected into the system prompt so ARION adjusts its tone accordingly — more empathetic for frustrated users, more enthusiastic for interested prospects.

### 🚨 Automated Escalation

- **Frustration Detection** — Recognizes high-frustration signals and proactively offers human support contact details.
- **Critical Issue Routing** — Legal, billing disputes, and unresolved technical issues are flagged and escalated with direct support contact information.
- **Escalation Triggers** — Works silently in the background without breaking conversational flow.

### 📁 Project Vault Integration

- Informs clients how to access their **secure cloud storage** (Project Vault) for deliverables, assets, and project files.
- Guides users through the retrieval process as part of the grounded knowledge base.

### 📝 Dual Logging System

- **Interaction Log** (`logs/interactions.csv`) — Full audit trail of every message exchanged, including timestamps, session IDs, sentiment scores, and detected intent.
- **Q&A Cache** (`logs/qa_cache.csv`) — Filtered log of meaningful question-answer pairs for training data and performance analytics.
- **Thread-safe** — Logging runs in background tasks (FastAPI `BackgroundTasks`) so it never slows down the chat response.
- **Privacy-first** — All logs are stored locally; no external data sharing.

### 💻 Responsive UI

- Clean, modern chat interface built with vanilla HTML5, CSS3, and JavaScript — no frontend framework needed.
- Fully responsive across desktop, tablet, and mobile.
- Animated typing indicators, smooth message transitions, and mode badges.
- Dark/light theme ready.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11+, FastAPI 0.115.5 |
| **ASGI Server** | Uvicorn 0.32.0 |
| **LLM** | Google Gemini (`gemini-2.5-flash`) via `google-generativeai` 0.8.3 |
| **Language Detection** | `langdetect` 1.0.9 |
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES6+) |
| **Voice** | Web Speech API (SpeechRecognition + SpeechSynthesis) |
| **Data Validation** | Pydantic 2.9.2 |
| **Environment** | `python-dotenv` 1.0.1 |
| **Logging/Storage** | Local CSV files (thread-safe) |

---

## Directory Structure

```
arion/
├── main.py                  # FastAPI server — chat logic, session management, routing
├── knowledge_base.py        # XML-structured FlowZint company data & system prompts
├── sentiment_analysis.py    # Rule-based sentiment & intent analysis engine
├── sheets_logger.py         # Thread-safe CSV logging for interactions & Q&A pairs
├── requirements.txt         # Python package dependencies
├── replit.nix               # System-level Nix dependencies (for Replit environment)
├── .env                     # Environment variables (not committed — see below)
│
├── static/                  # Frontend assets (served automatically by FastAPI)
│   ├── index.html           # Main UI structure and chat layout
│   ├── script.js            # Voice logic, API calls, UI state management
│   └── style.css            # Responsive styling, animations, and theming
│
├── logs/                    # Auto-generated on first run
│   ├── interactions.csv     # Full message-level audit log
│   └── qa_cache.csv         # Filtered Q&A pairs for analytics
│
│
└── README.md                # You are here
```

---

## Prerequisites

Before running ARION locally, make sure you have the following:

- **Python 3.11 or higher** — [Download Python](https://www.python.org/downloads/)
- **pip** — Comes bundled with Python
- **A Gemini API Key** — Free to obtain from [Google AI Studio](https://aistudio.google.com/apikey)
- **A modern browser** — Chrome or Edge recommended for full Web Speech API support

---

## Local Setup & Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/arion-flowzint.git
cd arion-flowzint
```

### 2. Create a Virtual Environment (Recommended)

```bash
python -m venv venv

# On macOS/Linux
source venv/bin/activate

# On Windows
venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

---

## Environment Variables

Create a `.env` file in the project root:

```bash
touch .env
```

Add the following variables:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | ✅ Yes | — | Your Google Gemini API key from AI Studio |
| `GEMINI_MODEL` | ❌ No | `gemini-2.5-flash` | Gemini model to use |

> ⚠️ **Never commit your `.env` file.** Add it to `.gitignore` to keep your API key private.

---

## Running the Application

```bash
python main.py
```

The server will start and output:

```
✅ Gemini configured — model: gemini-2.5-flash
INFO:     Uvicorn running on http://0.0.0.0:5000
```

Open your browser and navigate to:

```
http://localhost:5000
```

FastAPI automatically serves the frontend from the `/static` directory on the same port — no separate frontend server needed.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves the main chat UI (`index.html`) |
| `POST` | `/chat` | Send a message and receive an AI response |
| `GET` | `/health` | Health check — returns server status |
| `DELETE` | `/session/{session_id}` | Clear a specific user session |

### POST `/chat` — Request Body

```json
{
  "message": "What are your pricing plans?",
  "session_id": "optional-uuid-string"
}
```

### POST `/chat` — Response

```json
{
  "reply": "FlowZint offers three tiers...",
  "session_id": "uuid-string",
  "mode": "sales",
  "sentiment": "positive",
  "language": "en"
}
```

---

## How It Works

```
User Message
     │
     ▼
Language Detection (langdetect)
     │
     ▼
Sentiment & Intent Analysis (sentiment_analysis.py)
     │
     ▼
Session History Retrieved (in-memory store)
     │
     ▼
System Prompt Built:
  Knowledge Base + Sentiment Note + Mode Directive
     │
     ▼
Gemini LLM Called (gemini-2.5-flash)
     │
     ▼
Response Returned to User
     │
     ▼
Background Logging (interactions.csv + qa_cache.csv)
```

1. **Message received** — User sends a text or voice message via the frontend.
2. **Language detected** — `langdetect` identifies the language; ARION will reply in that language.
3. **Sentiment analyzed** — The rule-based engine scores the message and identifies the intent category.
4. **System prompt assembled** — The full prompt combines the FlowZint knowledge base, current sentiment note, detected mode (support/sales/care), and the last 20 turns of chat history.
5. **Gemini generates a response** — The LLM produces a grounded, context-aware reply.
6. **Response delivered** — The reply is sent back instantly; logging happens asynchronously in the background.

---

## Logging & Analytics

ARION automatically creates a `logs/` directory on first run.

### `logs/interactions.csv`

Full audit trail with columns:

| Column | Description |
|---|---|
| `timestamp` | ISO 8601 datetime of the exchange |
| `session_id` | Unique session identifier |
| `user_message` | Raw user input |
| `bot_reply` | ARION's response |
| `sentiment` | Detected sentiment label |
| `intent` | Detected intent category |
| `language` | Detected language code |
| `mode` | Active persona mode (support/sales/care) |

### `logs/qa_cache.csv`

Filtered Q&A pairs suitable for fine-tuning or analytics:

| Column | Description |
|---|---|
| `timestamp` | ISO 8601 datetime |
| `question` | Cleaned user question |
| `answer` | ARION's answer |
| `intent` | Intent category |

> Logs are written asynchronously using FastAPI `BackgroundTasks` and are fully thread-safe.

---

## Browser Compatibility

| Feature | Chrome | Edge | Firefox | Safari |
|---|---|---|---|---|
| Text Chat | ✅ | ✅ | ✅ | ✅ |
| Voice Input (STT) | ✅ | ✅ | ✅ | ✅ |
| Voice Output (TTS) | ✅ | ✅ | ✅ | ✅ |

> Voice features rely on the **Web Speech API**, which has the best support in Chromium-based browsers (Chrome, Edge). Firefox and Safari have partial or experimental support.

---

## Contributing

Contributions are welcome! To get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push to your fork: `git push origin feature/your-feature-name`
5. Open a Pull Request

Please ensure your changes:
- Do not expose API keys or secrets
- Follow the existing code style
- Include a clear description of the feature or fix

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

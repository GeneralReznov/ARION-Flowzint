'use strict';

// ── State ────────────────────────────────────────────────
let sessionId       = null;
let currentMode     = { mode: '', hint: '' };
let isLoading       = false;
let voiceModeActive = false;
let isListening     = false;
let isSpeaking      = false;
let recognition     = null;
let voiceLang       = 'en-IN';
let pendingRestart  = false;
let ttsTimeout      = null;

// ── DOM refs ─────────────────────────────────────────────
const messagesArea       = document.getElementById('messagesArea');
const messageInput       = document.getElementById('messageInput');
const sendBtn            = document.getElementById('sendBtn');
const micBtn             = document.getElementById('micBtn');
const voiceModeBtn       = document.getElementById('voiceModeBtn');
const voiceIndicator     = document.getElementById('voiceIndicator');
const voiceIndicatorText = document.getElementById('voiceIndicatorText');
const voiceIndicatorIcon = document.getElementById('voiceIndicatorIcon');
const voiceStopBtn       = document.getElementById('voiceStopBtn');
const statusDot          = document.getElementById('statusDot');
const statusText         = document.getElementById('statusText');
const headerMode         = document.getElementById('headerMode');
const sidebar            = document.getElementById('sidebar');
const menuBtn            = document.getElementById('menuBtn');
const sidebarClose       = document.getElementById('sidebarClose');
const voiceLangSelect    = document.getElementById('voiceLangSelect');

// ── Language display names ────────────────────────────────
// Used for human-readable badges on bot messages
const LANG_DISPLAY_NAMES = {
  hi: 'Hindi', ta: 'Tamil', kn: 'Kannada', te: 'Telugu', mr: 'Marathi',
  bn: 'Bengali', gu: 'Gujarati', ml: 'Malayalam', pa: 'Punjabi',
  ar: 'Arabic', fr: 'French', de: 'German', es: 'Spanish', ja: 'Japanese',
  ko: 'Korean', pt: 'Portuguese', ru: 'Russian', zh: 'Chinese',
  'zh-cn': 'Chinese', 'zh-tw': 'Chinese (Trad.)', it: 'Italian',
  nl: 'Dutch', tr: 'Turkish', vi: 'Vietnamese', th: 'Thai',
};

function langDisplayName(code) {
  if (!code || code === 'en' || code === 'unknown') return null;
  return LANG_DISPLAY_NAMES[code] || LANG_DISPLAY_NAMES[code.split('-')[0]] || code.toUpperCase();
}

// ── Chrome TTS keep-alive fix ─────────────────────────────
// Chrome pauses speechSynthesis silently after ~15s in some contexts.
if (window.speechSynthesis) {
  setInterval(() => {
    if (isSpeaking) window.speechSynthesis.resume();
  }, 5000);
}

// ── Mobile sidebar overlay ────────────────────────────────
const overlay = document.createElement('div');
overlay.className = 'sidebar-overlay';
document.body.appendChild(overlay);

menuBtn.addEventListener('click', () => {
  sidebar.classList.add('open');
  overlay.classList.add('visible');
});

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('visible');
}
sidebarClose.addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

// ── Voice language picker ─────────────────────────────────
voiceLangSelect.value = voiceLang;
voiceLangSelect.addEventListener('change', () => {
  voiceLang = voiceLangSelect.value;
  buildRecognition();
});

// ── Mode tabs ─────────────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = { mode: btn.dataset.mode, hint: btn.dataset.hint };
    const labels = { '': 'Auto Mode', support: 'Support Mode', sales: 'Sales Mode', care: 'Customer Care Mode' };
    headerMode.textContent = `FlowZint AI Assistant · ${labels[btn.dataset.mode] || 'Auto Mode'}`;
    closeSidebar();
  });
});

// ── New chat ──────────────────────────────────────────────
document.getElementById('newChatBtn').addEventListener('click', () => {
  stopVoiceSession();
  sessionId = null;
  messagesArea.innerHTML = buildWelcomeHTML();
  closeSidebar();
});

function buildWelcomeHTML() {
  return `
    <div class="welcome-block">
      <div class="welcome-avatar">A</div>
      <h2>Hi, I'm ARION 👋</h2>
      <p>I'm FlowZint's AI assistant. Ask me anything about our services, platform, or how to get started.</p>
      <div class="suggestion-chips">
        <button class="chip" onclick="sendSuggestion(this)">What services do you offer?</button>
        <button class="chip" onclick="sendSuggestion(this)">How do I get a quote?</button>
        <button class="chip" onclick="sendSuggestion(this)">Tell me about Project Vault</button>
        <button class="chip" onclick="sendSuggestion(this)">Download the Android app</button>
      </div>
    </div>`;
}

// ── Send helpers ──────────────────────────────────────────
function sendSuggestion(btn) {
  messageInput.value = btn.textContent;
  sendMessage();
}

function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

// ── Send message ──────────────────────────────────────────
async function sendMessage(overrideText, options = {}) {
  const text = (overrideText != null ? overrideText : messageInput.value).trim();
  if (!text || isLoading) return;

  stopListening();
  stopSpeaking();

  const welcome = messagesArea.querySelector('.welcome-block');
  if (welcome) welcome.remove();

  appendMessage('user', text);

  // Always clear the input regardless of source
  messageInput.value = '';
  messageInput.style.height = 'auto';

  const typingEl = appendTyping();
  setLoading(true);
  if (options.fromVoice) setVoiceStatus('thinking');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        session_id: sessionId,
        mode_hint: currentMode.hint
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();
    sessionId = data.session_id;

    typingEl.remove();
    appendMessage('bot', data.reply, {
      sentiment: data.sentiment,
      intent: data.intent,
      escalated: data.escalated,
      ms: data.response_time_ms,
      lang: data.language
    });

    // Bidirectional auto-sync: update voice language whenever detected lang differs
    const mappedLang = langToSpeechCode(data.language || 'en');
    if (mappedLang !== voiceLang) {
      voiceLang = mappedLang;
      // Only update the dropdown if the option exists in the select
      if (Array.from(voiceLangSelect.options).some(o => o.value === mappedLang)) {
        voiceLangSelect.value = mappedLang;
      }
      buildRecognition();
    }

    if (options.fromVoice || voiceModeActive) {
      await speakReply(data.reply, data.language);
    }

  } catch (err) {
    typingEl.remove();
    const errMsg = `⚠️ ${err.message || 'Something went wrong. Please try again.'}`;
    appendMessage('bot', errMsg, null);
    if (options.fromVoice || voiceModeActive) {
      await speakReply(errMsg.replace(/^⚠️\s*/, ''), 'en');
    }
  } finally {
    setLoading(false);
    if (voiceModeActive && !isSpeaking) {
      scheduleRestart();
    } else if (!voiceModeActive) {
      hideVoiceIndicator();
    }
  }
}

// ── Append message ────────────────────────────────────────
function appendMessage(role, text, meta) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'bot' ? 'A' : 'U';
  if (role === 'bot') {
    avatar.setAttribute('aria-label', 'ARION avatar');
  } else {
    avatar.setAttribute('aria-label', 'You');
  }

  const content = document.createElement('div');
  content.className = 'msg-content';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  content.appendChild(bubble);

  if (role === 'bot' && meta) {
    const metaRow = document.createElement('div');
    metaRow.className = 'msg-meta';

    const time = document.createElement('span');
    time.textContent = formatTime();
    metaRow.appendChild(time);

    if (meta.ms) {
      const ms = document.createElement('span');
      ms.textContent = `${meta.ms}ms`;
      metaRow.appendChild(ms);
    }

    // Show human-readable language name instead of raw code
    const langName = langDisplayName(meta.lang);
    if (langName) {
      const langBadge = document.createElement('span');
      langBadge.className = 'meta-badge lang-badge';
      langBadge.textContent = `🌐 ${langName}`;
      langBadge.setAttribute('title', `Detected language: ${langName}`);
      metaRow.appendChild(langBadge);
    }

    if (meta.sentiment && meta.sentiment !== 'neutral') {
      const badge = document.createElement('span');
      badge.className = `meta-badge sentiment-${meta.sentiment}`;
      const icons = { positive: '😊 Positive', frustrated: '😤 Frustrated', urgent: '⚡ Urgent' };
      badge.textContent = icons[meta.sentiment] || meta.sentiment;
      metaRow.appendChild(badge);
    }

    content.appendChild(metaRow);

    if (meta.escalated) {
      const callout = document.createElement('div');
      callout.className = 'escalation-callout';
      callout.textContent = '🔔 Escalated to human support — contact@shridhar.group';
      content.appendChild(callout);
    }
  }

  if (role === 'bot') {
    row.appendChild(avatar);
    row.appendChild(content);
  } else {
    row.appendChild(content);
    row.appendChild(avatar);
  }

  messagesArea.appendChild(row);
  scrollToBottom();
  return row;
}

// ── Typing indicator ──────────────────────────────────────
function appendTyping() {
  const row = document.createElement('div');
  row.className = 'typing-row';
  row.setAttribute('aria-label', 'ARION is typing');

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.style.background = 'linear-gradient(135deg, #6c63ff, #a855f7)';
  avatar.style.color = '#fff';
  avatar.textContent = 'A';

  const bubble = document.createElement('div');
  bubble.className = 'typing-bubble';
  bubble.innerHTML = '<span></span><span></span><span></span>';

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesArea.appendChild(row);
  scrollToBottom();
  return row;
}

// ── Helpers ───────────────────────────────────────────────
function setLoading(state) {
  isLoading = state;
  sendBtn.disabled = state;
  messageInput.disabled = state;

  const hasSpeech = !!window.SpeechRecognition || !!window.webkitSpeechRecognition;
  if (!voiceModeActive) micBtn.disabled = state || !hasSpeech;

  if (state) {
    statusDot.classList.add('thinking');
    statusText.textContent = 'Thinking…';
  } else if (!isListening && !isSpeaking) {
    statusDot.classList.remove('thinking');
    statusText.textContent = 'Online';
  }
}

function scrollToBottom() {
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Language helpers ──────────────────────────────────────
function langToSpeechCode(lang) {
  if (!lang || lang === 'unknown') return 'en-IN';
  const map = {
    en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', kn: 'kn-IN', te: 'te-IN',
    mr: 'mr-IN', bn: 'bn-IN', gu: 'gu-IN', ml: 'ml-IN', pa: 'pa-IN',
    'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW', zh: 'zh-CN', ar: 'ar-SA',
    fr: 'fr-FR', de: 'de-DE', es: 'es-ES', ja: 'ja-JP', ko: 'ko-KR', pt: 'pt-BR'
  };
  return map[lang] || map[lang.split('-')[0]] || 'en-IN';
}

// Find the best available TTS voice for a given BCP-47 lang code
function pickVoiceForLang(speechLang) {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const prefix = speechLang.slice(0, 2);
  return (
    voices.find(v => v.lang === speechLang && v.name.toLowerCase().includes('google')) ||
    voices.find(v => v.lang === speechLang) ||
    voices.find(v => v.lang.startsWith(prefix) && v.name.toLowerCase().includes('google')) ||
    voices.find(v => v.lang.startsWith(prefix)) ||
    voices[0]
  );
}

// ── Speech Recognition (STT) ──────────────────────────────
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

function buildRecognition() {
  if (!SpeechRecognitionAPI) return;

  // FIX #3: Reset listening state immediately before aborting the old instance.
  // The old instance's onend will have its handlers nulled and won't corrupt state.
  if (recognition) {
    try { recognition.abort(); } catch (_) {}
    // Null all handlers on the OLD object so its async events don't fire
    recognition.onstart  = null;
    recognition.onresult = null;
    recognition.onerror  = null;
    recognition.onend    = null;
  }

  // Reset listening state explicitly — the old onend won't run to do it
  isListening = false;
  micBtn.classList.remove('active');

  recognition = new SpeechRecognitionAPI();
  recognition.continuous      = false;
  recognition.interimResults  = true;
  recognition.maxAlternatives = 1;
  recognition.lang            = voiceLang;

  recognition.onstart = () => {
    isListening = true;
    pendingRestart = false;
    micBtn.classList.add('active');
    setVoiceStatus('listening');
  };

  recognition.onresult = (event) => {
    let interim = '';
    let finalText = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += t;
      else interim += t;
    }

    const preview = (finalText || interim).trim();
    if (preview && voiceModeActive) {
      voiceIndicatorText.textContent = finalText
        ? `Heard: "${preview.slice(0, 55)}${preview.length > 55 ? '…' : ''}"`
        : `Listening… ${preview.slice(0, 38)}`;
    }

    if (finalText.trim()) {
      stopListening();
      // FIX #4: Don't populate the input box with voice text — it never gets cleared
      // when overrideText is provided, leaving stale text behind.
      sendMessage(finalText.trim(), { fromVoice: true });
    }
  };

  recognition.onerror = (event) => {
    isListening = false;
    micBtn.classList.remove('active');

    if (event.error === 'no-speech') {
      if (voiceModeActive) scheduleRestart(1000);
      else hideVoiceIndicator();
      return;
    }
    if (event.error === 'aborted') return;

    const msgs = {
      'not-allowed':   '🎙️ Microphone access denied. Please allow mic in browser settings.',
      'network':       '🌐 Voice recognition needs internet. Check connection.',
      'audio-capture': '🎙️ No microphone detected. Connect a mic and try again.'
    };
    const msg = msgs[event.error] || `Voice error: ${event.error}`;

    if (voiceModeActive) {
      voiceIndicatorText.textContent = msg;
      scheduleRestart(3000);
    } else {
      hideVoiceIndicator();
      appendMessage('bot', `⚠️ ${msg}`, null);
    }
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove('active');
    if (voiceModeActive && !isLoading && !isSpeaking && pendingRestart) {
      pendingRestart = false;
      startListening();
    }
  };
}

function startListening() {
  if (!recognition || isListening || isLoading || isSpeaking) return;
  recognition.lang = voiceLang;
  pendingRestart = false;
  try {
    recognition.start();
    showVoiceIndicator();
  } catch (err) {
    if (err.name === 'InvalidStateError') {
      buildRecognition();
      setTimeout(startListening, 200);
      return;
    }
    appendMessage('bot', `⚠️ Could not start microphone: ${err.message}`, null);
  }
}

function stopListening() {
  pendingRestart = false;
  if (!recognition || !isListening) return;
  try { recognition.stop(); } catch (_) {}
  isListening = false;
  micBtn.classList.remove('active');
}

function scheduleRestart(delay = 500) {
  if (!voiceModeActive || isLoading || isSpeaking) return;
  pendingRestart = true;
  setTimeout(() => {
    if (voiceModeActive && !isLoading && !isSpeaking && !isListening) startListening();
  }, delay);
}

// ── Speech Synthesis (TTS) ────────────────────────────────
// FIX #2: isSpeaking is set immediately after speak() — not inside onstart.
// Chrome can queue an utterance without ever firing onstart in sandboxed contexts.
// Setting isSpeaking=true immediately ensures the safety timeout guard works.

function estimateTTSDuration(text) {
  // ~14 chars/second, min 3s, max 60s
  return Math.min(60000, Math.max(3000, (text.length / 14) * 1000));
}

function speakReply(text, language) {
  if (!window.speechSynthesis || !text) {
    scheduleRestart();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    stopSpeaking();

    // Clean text for speech: remove URLs, markdown, normalise whitespace
    const clean = text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*_~`#>]/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ', ')
      .replace(/[^\p{L}\p{N}\p{P}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) {
      scheduleRestart();
      resolve();
      return;
    }

    const speechLang = langToSpeechCode(language || 'en');

    // FIX #6: Guard against double doSpeak() calls.
    // Both onvoiceschanged and the 500ms fallback can fire.
    // The first one to run flips this flag and owns the utterance.
    let ttsStarted = false;

    function doSpeak() {
      if (ttsStarted) return;
      ttsStarted = true;

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang  = speechLang;
      utterance.rate  = 1.0;
      utterance.pitch = 1.0;

      const voice = pickVoiceForLang(speechLang);
      if (voice) utterance.voice = voice;

      // Safety timeout: if onend never fires, unblock after estimated time
      const safeDuration = estimateTTSDuration(clean);
      ttsTimeout = setTimeout(() => {
        if (isSpeaking) {
          window.speechSynthesis.cancel();
          isSpeaking = false;
          resolve();
          if (voiceModeActive) scheduleRestart();
          else hideVoiceIndicator();
        }
      }, safeDuration + 2000);

      utterance.onstart = () => {
        // onstart may or may not fire — isSpeaking is already true either way
        setVoiceStatus('speaking');
      };

      utterance.onend = () => {
        clearTimeout(ttsTimeout);
        isSpeaking = false;
        resolve();
        if (voiceModeActive) scheduleRestart(600);
        else hideVoiceIndicator();
      };

      utterance.onerror = (e) => {
        clearTimeout(ttsTimeout);
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.warn('TTS error:', e.error);
        }
        isSpeaking = false;
        resolve();
        if (voiceModeActive) scheduleRestart();
        else hideVoiceIndicator();
      };

      window.speechSynthesis.speak(utterance);

      // FIX #2: Set isSpeaking immediately after speak(), not in onstart.
      // onstart may never fire in sandboxed/iframe contexts.
      isSpeaking = true;
      setVoiceStatus('speaking');

      // Chrome sometimes needs an explicit resume() right after speak()
      setTimeout(() => {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      }, 100);
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      doSpeak();
    } else {
      // Voices not loaded yet — wait for them
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        doSpeak();
      };
      // FIX #6: The ttsStarted flag ensures this fallback is a no-op if
      // onvoiceschanged already fired
      setTimeout(doSpeak, 500);
    }
  });
}

function stopSpeaking() {
  clearTimeout(ttsTimeout);
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  isSpeaking = false;
}

// ── Voice mode controls ───────────────────────────────────
function toggleMic() {
  if (isListening) {
    stopListening();
    hideVoiceIndicator();
    return;
  }
  if (isLoading || isSpeaking) return;
  startListening();
}

function toggleVoiceMode() {
  if (voiceModeActive) {
    stopVoiceSession();
    return;
  }
  voiceModeActive = true;
  voiceModeBtn.classList.add('active');
  startListening();
}

function stopVoiceSession() {
  voiceModeActive = false;
  pendingRestart  = false;
  voiceModeBtn.classList.remove('active');
  stopListening();
  stopSpeaking();
  hideVoiceIndicator();
  if (!isLoading) {
    statusDot.classList.remove('thinking');
    statusText.textContent = 'Online';
  }
}

// ── Voice indicator UI ────────────────────────────────────
function showVoiceIndicator() {
  voiceIndicator.classList.remove('hidden');
}

function hideVoiceIndicator() {
  if (!voiceModeActive) voiceIndicator.classList.add('hidden');
}

function setVoiceStatus(state) {
  showVoiceIndicator();
  voiceIndicator.classList.remove('listening', 'speaking', 'thinking');
  voiceIndicator.classList.add(state);

  const labels = {
    listening: ['🎙️', 'Listening… speak now'],
    speaking:  ['🔊', 'ARION is speaking…'],
    thinking:  ['💭', 'ARION is thinking…']
  };
  const [icon, txt] = labels[state] || labels.listening;
  voiceIndicatorIcon.textContent = icon;
  voiceIndicatorText.textContent = txt;

  if (state === 'listening') {
    statusDot.classList.add('thinking');
    statusText.textContent = 'Listening…';
  } else if (state === 'speaking') {
    statusDot.classList.add('thinking');
    statusText.textContent = 'Speaking…';
  }
}

// ── Init ──────────────────────────────────────────────────
function initVoice() {
  if (!SpeechRecognitionAPI) {
    micBtn.disabled       = true;
    micBtn.title          = 'Voice input not supported. Use Chrome or Edge.';
    voiceModeBtn.disabled = true;
    voiceModeBtn.title    = 'Voice mode requires Chrome or Edge.';
    voiceLangSelect.disabled = true;
    return;
  }

  buildRecognition();

  // Eagerly load voices so they're available for the first TTS call
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }

  micBtn.addEventListener('click', toggleMic);
  voiceModeBtn.addEventListener('click', toggleVoiceMode);
  voiceStopBtn.addEventListener('click', stopVoiceSession);
}

initVoice();

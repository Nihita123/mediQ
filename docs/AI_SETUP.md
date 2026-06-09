# MediQ — AI Setup Guide

MediQ uses a **hybrid AI architecture**. The LLM is the primary reasoning engine. If no LLM is configured, the system automatically falls back to the built-in rule-based engine — no configuration required to run the app.

---

## Architecture Overview

```
Patient Message
      │
      ▼
┌─────────────────────┐
│   Triage Engine     │  ← Orchestrator (triageEngine.js)
│   (State Machine)   │
└────────┬────────────┘
         │ try LLM first
         ▼
┌─────────────────────┐     fail / no key
│   AI Service        │ ──────────────────► Rule-based Fallback
│   (aiService.js)    │                     (symptomExtractor +
└────────┬────────────┘                      questionEngine +
         │                                   triageAssessor)
         ▼
┌─────────────────────┐
│   LLM Router        │  ← Provider abstraction (llmRouter.js)
│   (llmRouter.js)    │
└────────┬────────────┘
         │ auto-detects active provider
    ┌────┴──────┬──────────┐
    ▼           ▼          ▼
 OpenAI      Gemini     Ollama
```

---

## Quick Start — No LLM (Default)

The app runs fully without any API keys. The rule-based engine handles:
- Symptom extraction via regex dictionary (18 symptoms)
- Dynamic follow-up questions (16 symptom-specific flows)
- Risk classification (critical → low)
- Department routing
- Plain-text physician summary

No `.env` changes needed — just start the server.

---

## Enabling LLM Features

Set ONE of the following in `server/.env`. The system auto-detects which provider is configured.

### Option 1 — OpenAI

```env
OPENAI_API_KEY=sk-proj-...
# Optional overrides:
OPENAI_MODEL=gpt-4o-mini        # Default: gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1  # Override for Azure / compatible APIs
```

Recommended models by use case:
| Use case | Recommended |
|---|---|
| Best quality | `gpt-4o` |
| Balanced (default) | `gpt-4o-mini` |
| Fastest / cheapest | `gpt-3.5-turbo` |

---

### Option 2 — Google Gemini

```env
GEMINI_API_KEY=AIzaSy...
# Optional:
GEMINI_MODEL=gemini-1.5-flash   # Default: gemini-1.5-flash
```

Get a free API key at [aistudio.google.com](https://aistudio.google.com).

Recommended models:
| Use case | Recommended |
|---|---|
| Best quality | `gemini-1.5-pro` |
| Balanced (default) | `gemini-1.5-flash` |

---

### Option 3 — Ollama (Local, Private)

Run models completely locally. No data leaves your machine.

```bash
# Install Ollama: https://ollama.com
ollama pull llama3          # or mistral, phi3, etc.
ollama serve                # starts on http://localhost:11434
```

```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

Recommended models for medical intake:
| Model | Size | Notes |
|---|---|---|
| `llama3` | 8B | Good balance of speed and quality |
| `mistral` | 7B | Fast, good instruction following |
| `llama3:70b` | 70B | Best quality, requires ~40GB RAM |

---

### Option 4 — Explicit Provider Selection

If multiple keys are set, the first found is used (OpenAI → Gemini → Ollama). Override explicitly:

```env
LLM_PROVIDER=gemini   # openai | gemini | ollama
```

---

## What Changes with LLM Enabled

| Feature | Rule-based | LLM-powered |
|---|---|---|
| Symptom extraction | Regex patterns (18 symptoms) | Free-form NLP — catches any symptom |
| Medical entities | Symptoms only | + duration, severity, medications, history, allergies |
| Follow-up questions | Predefined flows per symptom | Dynamic — determined by what's missing |
| Risk assessment | Pattern-matching rules | Context-aware with confidence score |
| Explainability | Single reason string | Reasoning chain + red flags |
| Clinical summary | Plain text template | Structured SOAP-style JSON |
| Department routing | Rule lookup | LLM reasoning |

---

## LLM Response Fields

When LLM is active, the `POST /api/triage/message` response includes extra fields:

```json
{
  "aiReply": "...",
  "triageState": "FOLLOW_UP_QUESTIONS",
  "extractedSymptoms": ["Chest Pain"],
  "medicalEntities": {
    "symptoms": ["chest pain"],
    "duration": "2 hours",
    "severity": "severe",
    "medicalHistory": ["hypertension"],
    "medications": ["aspirin"],
    "allergies": [],
    "vitalSigns": {}
  },
  "triageResult": {
    "riskLevel": "high",
    "confidence": 0.87,
    "department": "Emergency / Urgent Care — Cardiology",
    "urgency": "Your symptoms suggest you should be seen urgently today.",
    "reasoning": [
      "Patient reports severe chest pain of 2-hour duration",
      "History of hypertension increases cardiac risk",
      "Severity rated 8/10"
    ],
    "redFlags": ["Severe chest pain", "Known hypertension"],
    "suggestedFollowUp": "Immediate ECG and cardiac enzyme evaluation recommended",
    "generatedBy": "llm"
  },
  "aiEngine": "llm",
  "sessionComplete": false
}
```

---

## Safety Guardrails

All LLM prompts enforce these rules via system instructions:

1. **No diagnosis** — outputs are framed as "triage recommendations only"
2. **No treatment** — no medication recommendations or prescriptions
3. **No certainty** — language uses "may indicate", "consistent with", "warrants evaluation"
4. **Escalation bias** — when uncertain, risk level is elevated for patient safety
5. **Mandatory disclaimer** — every clinical summary includes a disclaimer
6. **Fallback always available** — LLM failure never crashes the session

---

## Troubleshooting

**LLM calls timing out**
- Default timeout is 60 seconds (set in `client/src/services/api.js`)
- Ollama on first load can take 30+ seconds to load the model — this is normal
- For production, consider a faster model or pre-warming

**"No LLM provider configured" error**
- Check that your `.env` key is set correctly (no spaces, correct variable name)
- Restart the server after changing `.env`

**LLM returns garbled JSON**
- The `parseLLMJson` utility strips markdown fences and extracts embedded JSON
- If parsing still fails, the system falls back to rules automatically

**Rule-based fallback always being used despite key being set**
- Verify the key is in `server/.env` (not `client/.env`)
- Run: `node -e "require('dotenv').config(); console.log(process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET')"` from `server/`

---

## Cost Estimates (OpenAI)

A typical triage session (8–12 exchanges):

| Model | Input tokens | Output tokens | Approx. cost |
|---|---|---|---|
| `gpt-4o-mini` | ~2,000 | ~1,500 | ~$0.001 |
| `gpt-4o` | ~2,000 | ~1,500 | ~$0.02 |
| `gpt-3.5-turbo` | ~2,000 | ~1,500 | ~$0.002 |

Gemini 1.5 Flash has a generous free tier (15 RPM, 1M tokens/day).
Ollama is completely free (local compute only).

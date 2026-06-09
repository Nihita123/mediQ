# MediQ API Documentation

Base URL: `http://localhost:5000/api`

All protected endpoints require:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## Authentication

### POST /auth/register

Register a new patient account.

**Request Body**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "password": "SecurePass1"
}
```

**Response 201**
```json
{
  "message": "Account created successfully",
  "token": "eyJhbG...",
  "user": {
    "_id": "664...",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "role": "patient",
    "createdAt": "2024-06-09T10:00:00.000Z"
  }
}
```

**Error Responses**
- `400` — Validation error
- `409` — Email already in use

---

### POST /auth/login

Authenticate and receive a JWT.

**Request Body**
```json
{
  "email": "jane@example.com",
  "password": "SecurePass1"
}
```

**Response 200**
```json
{
  "message": "Login successful",
  "token": "eyJhbG...",
  "user": { ... }
}
```

**Error Responses**
- `400` — Validation error
- `401` — Invalid credentials

---

### GET /auth/me  🔒

Return the current authenticated user.

**Response 200**
```json
{
  "user": {
    "_id": "664...",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "role": "patient"
  }
}
```

---

### PUT /auth/profile  🔒

Update name or password.

**Request Body**
```json
{
  "name": "Jane Doe",
  "currentPassword": "OldPass1",
  "newPassword": "NewPass1"
}
```

---

## Sessions

### POST /session/create  🔒

Start a new triage session.

**Response 201**
```json
{
  "message": "Triage session created",
  "session": {
    "_id": "665...",
    "userId": "664...",
    "messages": [],
    "extractedSymptoms": [],
    "riskLevel": "unknown",
    "status": "active",
    "createdAt": "2024-06-09T10:05:00.000Z"
  }
}
```

---

### GET /session/history  🔒

Return paginated session history for the authenticated user.

**Query Parameters**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 10 | Results per page (max 50) |

**Response 200**
```json
{
  "sessions": [ ... ],
  "pagination": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "pages": 3
  }
}
```

---

### GET /session/:id  🔒

Fetch a single session with full message history.

**Response 200**
```json
{
  "session": {
    "_id": "665...",
    "userId": { "name": "Jane Smith", "email": "jane@example.com" },
    "messages": [
      { "role": "assistant", "content": "Hello...", "timestamp": "..." },
      { "role": "user", "content": "I have a headache", "timestamp": "..." }
    ],
    "extractedSymptoms": ["headache", "nausea"],
    "riskLevel": "medium",
    "department": "Neurology",
    "summary": "Patient presents with...",
    "status": "completed"
  }
}
```

---

### PUT /session/:id  🔒

Update a session's data (messages, status, symptoms, etc).

---

### DELETE /session/:id  🔒

Soft-cancel a session (sets status to `cancelled`).

---

## Reports

### POST /report/create  🔒

Generate a report from a completed session.

**Request Body**
```json
{
  "sessionId": "665...",
  "summary": "Patient presents with moderate headache...",
  "recommendations": [
    "Rest and hydration recommended",
    "Follow up if symptoms persist beyond 48 hours"
  ]
}
```

**Response 201**
```json
{
  "message": "Report created successfully",
  "report": {
    "_id": "666...",
    "sessionId": "665...",
    "patientId": "664...",
    "summary": "...",
    "recommendations": [...],
    "riskLevel": "medium",
    "createdAt": "..."
  }
}
```

---

### GET /report/:id  🔒

Fetch a single report by ID.

---

### GET /report/patient/:patientId  🔒

Fetch all reports for a given patient.

---

## Error Response Shape

All error responses follow this format:

```json
{
  "message": "Human-readable error description",
  "errors": [
    { "field": "email", "message": "Valid email is required" }
  ]
}
```

The `errors` array is only present on validation failures (400).

---

## Health Check

### GET /health

```json
{
  "status": "ok",
  "service": "MediQ API",
  "timestamp": "2024-06-09T10:00:00.000Z"
}
```

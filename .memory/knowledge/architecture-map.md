# GalaxyHub — Semantic Architecture Map

> **Layer:** Semantic Memory
> **Related:** [.memory/CONTEXT.md](file:///home/bah/GalaxyHub/.memory/CONTEXT.md), [Galaxy-Hub.md](file:///home/bah/GalaxyHub/Galaxy-Hub.md)

---

## 1. Contextual Retrieval Pipeline (Implemented)

```
[Document / Code File]
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│ 1. Auth & Validation (src/server.mjs, src/retrieval.mjs) │
│    - Bearer Token -> { tenant, rooms, role: 'writer' }   │
│    - Size limits: Doc <= 200k chars, Body <= 1 MiB       │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│ 2. Chunking & Line Tracking (src/retrieval.mjs)          │
│    - Word-based window (default 400 words, 80 overlap)   │
│    - Preserves original formatting, offsets, lineStart/End│
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│ 3. Contextual Enrichment (Provider: demo | codex | remote)│
│    - Generates short situational context per chunk       │
│    - Prepends context for BM25 tokens & Dense Embeddings │
│    - Stores raw original text separately for citations   │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│ 4. Hybrid Retrieval & Reranking                          │
│    - Tenant + Room scoped query                          │
│    - BM25 + Dense Cosine Similarity -> RRF Fusion        │
│    - Optional Cohere v2 Rerank -> Citation Packaging     │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Target GalaxyHub Ecosystem Architecture (Planned Concept)

```
┌───────────────────────────────────────────────────────────────────┐
│                   Browser Client (Next.js + TS)                   │
│  ┌───────────────────────────┐   ┌─────────────────────────────┐  │
│  │  Fast Web App Layer       │   │  Live Pixel World (Phaser)  │  │
│  │  - Profiles & Connections │   │  - Café Space & Avatars     │  │
│  │  - Project Rooms (Direct) │   │  - Table Voice Chat Zones   │  │
│  │  - Events & Search        │   │  - Lazy-loaded on entry     │  │
│  └─────────────┬─────────────┘   └──────────────┬──────────────┘  │
└────────────────┼────────────────────────────────┼─────────────────┘
                 │ HTTPS / REST                   │ WebSocket
                 ▼                                ▼
┌────────────────────────────────┐ ┌────────────────────────────────┐
│   Core Web Backend (Next.js)   │ │  Realtime World Server         │
│   - Auth, ACL, Moderation      │ │  - Candidate: Colyseus         │
│   - PostgreSQL (Users, Rooms)  │ │  - Avatar Presence & Proximity │
└────────────────┬───────────────┘ └────────────────────────────────┘
                 │ Server-to-Server Bearer Token (sdk/galaxy-code.mjs)
                 ▼
┌───────────────────────────────────────────────────────────────────┐
│        Contextual Retrieval Service (Implemented v0.1.0)          │
│        - Per-room isolated knowledge index & MCP Server           │
└───────────────────────────────────────────────────────────────────┘
```

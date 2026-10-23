# GalaxyHub — Domain Glossary

> **Layer:** Semantic Memory
> **Sources:** [Galaxy-Hub.md](file:///home/bah/GalaxyHub/Galaxy-Hub.md), [README.md](file:///home/bah/GalaxyHub/README.md)

| Term | Status | Definition |
| :--- | :--- | :--- |
| **Galaxy Hub** | Concept | Browser-based pixel-art social network for developers combining live presence with fast web workflows ([Galaxy-Hub.md:7-9](file:///home/bah/GalaxyHub/Galaxy-Hub.md#L7-L9)). |
| **Café** | Concept / Default Room ID | The initial live pixel-art space where users meet, text-chat, and sit at tables to activate proximity voice chat ([Galaxy-Hub.md:29](file:///home/bah/GalaxyHub/Galaxy-Hub.md#L29)). Also used as the default room ID (`cafe`) in the retrieval index. |
| **Project Rooms** | Concept + Retrieval Scope | Persistent team workspaces containing members, chat, and links to code, tasks, and materials, accessible via direct link without loading the game map ([Galaxy-Hub.md:21](file:///home/bah/GalaxyHub/Galaxy-Hub.md#L21)). In `galaxy-contextual-retrieval`, `room` is the primary isolation boundary inside a `tenant`. |
| **Skills Library** | Concept (Phase 2) | Planned catalog of developer tools, skills, and integrations for teams to discover and discuss ([Galaxy-Hub.md:23,41](file:///home/bah/GalaxyHub/Galaxy-Hub.md#L23)). |
| **GalaxyCode** | SDK Consumer | Developer tool / repository integration that indexes approved source files into a Project Room using [`GalaxyKnowledgeClient`](file:///home/bah/GalaxyHub/sdk/galaxy-code.mjs) ([README.md:148-175](file:///home/bah/GalaxyHub/README.md#L148-L175)). |
| **Contextual Retrieval** | Implemented (`v0.1.0`) | Retrieval technique where each document chunk is enriched with a document-aware situational prefix before indexing (BM25 + embeddings), while returning exact unprefixed source lines to the caller ([README.md:98-107](file:///home/bah/GalaxyHub/README.md#L98-L107)). |
| **Principal** | Implemented (`v0.1.0`) | Server-side credential entry `{ token, tenant, rooms, role }` loaded from `GALAXY_TOKENS` ([src/server.mjs:12-22](file:///home/bah/GalaxyHub/src/server.mjs#L12-L22)). |

---
name: saluddeuna-project-understanding
description: Project context skill for SaludDeUna. Use when planning or implementing features in this repo and you need validated product purpose, architecture, modules, workflows, and constraints from the Plan Maestro and backend README without changing business rules.
---

# SaludDeUna Project Understanding

Use this skill before coding when the task touches product behavior, architecture, APIs, sprint scope, or domain constraints.

## Source of truth

Use only these documents as authoritative sources for this skill:
- Plan Maestro SaludDeUna (IETI 2026-1).md
- README copy.md

If current code differs from these documents, report the discrepancy and ask for direction. Do not reinterpret rules or silently change requirements.

## Project purpose

SaludDeUna is a semester MVP for intelligent clinical communication in two specialties:
- General Medicine
- Dentistry

The MVP includes:
- Patient app (React Native)
- Doctor/Admin web panel (React + Next)
- Backend API (NestJS + MongoDB)
- AI capabilities (RAG + LLM + clinical safety rules)
- Asynchronous real-time clinical chat
- Observability and KPI tracking

Explicit non-goals this semester:
- Automatic diagnosis or prescription
- Live video consultation
- Production-grade payment gateway integration
- Certified direct production integration with hospital EHR systems

## Main technologies

- Frontend web: React + Next.js
- Frontend mobile: React Native
- Backend: NestJS 11 + TypeScript 5
- Data: MongoDB + Mongoose
- Auth/Security: JWT, RBAC, throttling, correlation id, global validation/error handling
- AI: Gemini + RAG + guardrails, with provider abstraction via IAProviderAdapter
- Realtime: WebSocket namespace consultation
- DevOps/Governance: GitHub (code), GitHub Actions (CI/CD), Azure DevOps (Wiki/Boards/sprint traceability)

## Architecture overview

- Monorepo product vision with separate client channels and backend API.
- Backend follows modular architecture with role-based access controls and global request pipeline controls.
- API uses versioned REST prefix v1.
- Cross-cutting concerns are standardized: validation, exception normalization, structured logging, metrics, and auth guards.
- AI must be encapsulated behind IAProviderAdapter to reduce provider lock-in risk.
- Multi-cloud assumption is accepted for Azure infrastructure plus Gemini usage.

## Key backend modules/components

From current backend README:
- AuthModule
- PatientsModule
- DoctorsModule
- AdminModule
- AdminsModule
- NotificationsModule
- DashboardModule
- ConsultationsModule

Key platform-level capabilities:
- Access and refresh token sessions
- REThUS verification workflow for doctors
- Doctor verification gate for consultation queue access
- Business and technical dashboard endpoints
- Health/readiness endpoints

## Important workflows

Preserve these documented flows:

1. Authentication and session lifecycle
- Patient and staff registration/login flows
- Access token for protected APIs
- Refresh token for renewal/logout session management

2. Doctor verification (REThUS)
- Admin reviews and verifies doctor credentials
- Verification state drives doctor status
- Consultation queue access for doctors is restricted by verified status

3. Clinical triage and prioritization
- Triage sessions and analysis endpoints
- Priority model: LOW, MODERATE, HIGH
- Specialty-aware red flags for General Medicine and Dentistry

4. Consultation lifecycle
- Queue retrieval
- Message creation
- Attend/close state transitions
- Summary generation and feedback
- Translation endpoints

5. Follow-up and timeline
- Follow-up creation
- Patient timeline tracking
- Re-prioritization support from symptom evolution

6. Observability and KPI reporting
- Technical dashboard metrics
- Business KPI dashboard aligned with required semester KPIs

## Product constraints to preserve

- Maintain closed in-scope and out-of-scope boundaries from the Plan Maestro.
- Respect guardrails: AI must not provide diagnosis or prescriptions.
- Keep semester sprint mapping and Must/Should/Could/Won't priorities unchanged unless user explicitly updates planning artifacts.
- Keep SLO and KPI definitions unchanged unless requested.

## How to use this skill during development

1. Before implementing a feature, map the request to in-scope capabilities and documented workflows.
2. Verify affected modules/endpoints/types against source documents.
3. If requirement ambiguity appears, present alternatives but keep current documented decision as default.
4. If implementation changes architecture or business rules, require explicit user approval before editing code.

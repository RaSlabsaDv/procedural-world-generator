# Agent Instructions — Procedural World Generator

## Project Context

This repository contains a university coursework project comparing local PWA/WebAssembly computation with traditional client-server computation.

Read `docs/PROJECT_BRIEF.md` before implementing new features or making architectural decisions.

## Technology Stack

- Frontend: Angular and TypeScript
- Local computation: C# running on .NET WebAssembly
- Backend: ASP.NET Core Web API
- Shared computation library: C#
- Visualization: Three.js
- PWA: Angular Service Worker

## Architectural Rules

- Use Angular for the frontend. Do not replace it with Blazor.
- Keep mathematical algorithms in a shared C# library.
- Both local WebAssembly and server execution must use the same mathematical core.
- Avoid duplicating mathematical algorithms in TypeScript.
- Keep visualization separate from computation.
- Maintain identical input parameters for both computation modes.
- Prefer reproducible terrain generation using deterministic seeds.

## Development Workflow

1. Inspect the existing project structure before making changes.
2. Implement features incrementally.
3. Prefer simple, maintainable solutions over unnecessary abstractions.
4. Run relevant builds and tests after changes.
5. Explain architectural changes before introducing new dependencies.
6. Do not implement optional features unless explicitly requested.

## Priorities

1. Establish Angular-to-C# WebAssembly interoperability.
2. Establish ASP.NET Core execution using the shared C# core.
3. Implement procedural terrain generation.
4. Add visualization and PWA capabilities.
5. Implement Architecture Race and performance benchmarks.

## Performance Requirements

- Measure computation separately from network transfer and rendering.
- Keep benchmark inputs identical across execution modes.
- Do not introduce optimizations that make comparisons unfair.
- Treat Adaptive Mode as an optional later feature.
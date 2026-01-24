---
title: Manual Git Control
status: accepted
date: 2024-01-15
---

# ADR-002: Manual Git Control

## Status

Accepted

## Context

AI-powered development tools can generate significant amounts of code quickly. Automated commits could lead to:
- Unwanted changes being committed
- Loss of developer oversight
- Difficulty in understanding what was changed and why
- Security vulnerabilities being committed without review

## Decision

All git operations in SpecStudio will be manual:

1. The application will NEVER automatically run `git add`, `git commit`, or `git push`
2. Developers must review all generated code before committing
3. The IDE will provide guidance on git commands but not execute them
4. This ensures full developer control over the version history

## Consequences

### Positive
- Full developer control over what gets committed
- Opportunity to review and refine AI-generated code
- Clear separation between code generation and version control
- Reduced risk of committing sensitive information or bugs

### Negative
- Extra manual steps required after code generation
- Developers must remember to commit their changes
- No automatic backup of generated code

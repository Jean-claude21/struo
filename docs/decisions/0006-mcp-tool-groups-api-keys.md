# 0006 — MCP with tool groups and company API keys

Date: 2026-11-19 · Status: accepted

## Context

The author wants every product to expose an MCP server.

## Decision

/mcp (Streamable HTTP, stateless) exposes four everyday tools (context, list_projects, get_project, list_alerts) and one family per domain called with action + args (projects, field, finance, documents, planning, expenses), pattern of Jarvis' tool groups. Access by a company API key acting as its creator with their role; a browser session never opens /mcp. OAuth for Claude.ai/ChatGPT is roadmap item 016.

## Consequences

Same rules as the pages: every tool goes through the core and RLS.

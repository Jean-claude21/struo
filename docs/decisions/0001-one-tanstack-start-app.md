# 0001 — One TanStack Start application, no separate backend

Date: 2026-11-19 · Status: accepted

## Context

The author asked for TanStack Start everywhere, a PWA instead of native apps, and no backend unless necessary.

## Decision

The whole product (site, office, field PWA, portal, console, REST, MCP, jobs) is one TanStack Start app built to a standalone Node server (Nitro) and one Docker image on Coolify. Heavy work, if it ever needs it, runs as the same image in a second container, never as a second code base.

## Consequences

One deployment, one runtime, one set of secrets. KYA-EnergyMarket proves TanStack Start can host MCP, REST and Better Auth.

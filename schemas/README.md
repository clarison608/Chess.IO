# Colyseus Schemas

This folder holds Colyseus Schema definitions used by the game's server and message synchronization.

Conventions
- Place all shared Colyseus schema classes here (TypeScript).
- Build/compile them with your project's TypeScript build step if needed.

Example
- `PlayerState.ts` provides a minimal example schema for a player.

Notes
- Requires `@colyseus/schema` as a dependency on the server and any shared build target that compiles these files.

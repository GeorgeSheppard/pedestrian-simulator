# Pedestrian Simulator

A miniature, tilt-shift-style 3D simulation of Covent Garden, with little pedestrians that follow
simple rules and an environment you can interact with.

This is the bare scaffold: a placeholder scene on a plinth, ready to deploy.

## Stack

- **React 19 + Vite + TypeScript**
- **[three.js](https://threejs.org/)** via [React Three Fiber](https://r3f.docs.pmnd.rs/) and
  [drei](https://drei.docs.pmnd.rs/)

## Development

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm lint         # typecheck + eslint
pnpm format       # prettier
pnpm build
```

### Deployment

Deployed to Cloudflare Workers as static assets (`wrangler.jsonc`), with SPA fallback routing. The
build command is `pnpm build`, and the output directory is `dist`.

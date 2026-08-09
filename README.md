# arah-api

> [![License: MIT](https://img.shields.io/badge/License-MIT-00D8A0.svg)](../arah/LICENSE) Open-source · Part of the [Arah platform](https://github.com/deanz93/arah)



Fastify API gateway for the [Arah](https://github.com/deanz93/arah) navigation platform.
Handles routing, geocoding proxying, community reports CRUD + voting, and user profiles.
Authenticates all requests via Firebase ID tokens.

## Quick start
```bash
cp .env.example .env
npm install && npm run dev   # http://localhost:3001
```

## Docker
```bash
docker build -t arah/api . && docker run -p 3001:3001 --env-file .env arah/api
```
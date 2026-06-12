# ===========================================================================
# Dockerfile — how to build a container image for the Elon Tweet web server.
# ===========================================================================
# This packages the Node app so it can run anywhere Docker runs, without the
# host needing Node installed. docker-compose.yml uses this to build the "app".
# ===========================================================================

# A small official Node image. "alpine" is a tiny Linux base.
FROM node:20-alpine

# All following commands run inside /app in the image.
WORKDIR /app

# Copy ONLY the dependency manifests first. Docker caches this layer, so
# "npm install" re-runs only when these files change — not on every code edit.
COPY package*.json ./
RUN npm install --omit=dev

# Now copy the rest of the source code into the image.
COPY . .

# Document the port the server listens on.
EXPOSE 3000

# When the container starts: first ensure the database schema exists (safe to
# re-run — it's idempotent), then launch the web server. This is why the same
# image works both locally (compose) and on Render with no manual schema step.
CMD ["npm", "run", "start:docker"]

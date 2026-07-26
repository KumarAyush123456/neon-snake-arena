# ==========================================================================
# Dockerfile for Neon Snake Multiplayer Game Server
# ==========================================================================

FROM node:20-alpine

WORKDIR /app

# Copy server dependency configuration
COPY server/package.json ./

# Install dependencies
RUN npm install --production

# Copy server code
COPY server/server.js ./

# Expose server port (default 3001)
EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

CMD ["npm", "start"]

# Use Microsoft's official Playwright image — Chromium + all system deps preinstalled.
# This avoids Buildpacks failing to install libnss3, libatk, etc. for Chromium.
FROM mcr.microsoft.com/playwright:v1.48.2-jammy

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

# Install deps first (better Docker layer caching)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy app code
COPY server.js ./

EXPOSE 8080

CMD ["node", "server.js"]

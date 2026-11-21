# =====================================================================
# Stage 1: Build React/Vite Frontend
# =====================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency specifications
COPY package.json package-lock.json* pnpm-lock.yaml* ./

# Install npm dependencies
RUN npm install

# Copy frontend source code
COPY . .

# Build static production bundle
RUN npm run build

# =====================================================================
# Stage 2: Serve via Nginx with SSE reverse proxy
# =====================================================================
FROM nginx:alpine AS runner

# Remove default nginx html
RUN rm -rf /usr/share/nginx/html/*

# Copy built production assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration with SSE buffering disabled
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

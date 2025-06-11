# ---- Base Node.js Setup ----
FROM node:20.11.1-slim AS base

# Set working directory
WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy app source code from src/
COPY src ./

# ---- Install Go ----
RUN apt-get update && apt-get install -y curl git make && \
    curl -OL https://go.dev/dl/go1.21.1.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go1.21.1.linux-amd64.tar.gz && \
    rm go1.21.1.linux-amd64.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"

# ---- Copy Go Notification Repo from push/ ----
COPY push /app/push
ENV GOFLAGS=-mod=vendor

# ---- Build Go CLI ----
WORKDIR /app/push/cmd/notification_helper
RUN go build -o /app/bin/notify

# ---- Copy Firebase Credentials (ignored from Git) ----
COPY secret.json /secrets/firebase-creds.json
ENV GOOGLE_APPLICATION_CREDENTIALS=/secrets/firebase-creds.json

# ---- Reset working directory for Node.js ----
WORKDIR /app

# ---- Expose Port & Start Server ----
EXPOSE 3000
CMD ["node", "index.js"]

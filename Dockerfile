FROM node:20.11.1-slim

WORKDIR /app

COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy the rest of the application code
COPY src ./

EXPOSE 3000

CMD ["node", "index.js"]
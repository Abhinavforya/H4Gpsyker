# Backend
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

EXPOSE 5000

ENV NODE_ENV=production

CMD ["npm", "start"]

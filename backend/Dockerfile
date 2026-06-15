# Backend
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source
COPY . .

EXPOSE 5000

ENV NODE_ENV=production

CMD ["npm", "start"]

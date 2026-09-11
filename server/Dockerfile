FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY prisma ./prisma/
COPY tsconfig.json ./
COPY src ./src/
RUN npm ci
RUN npx prisma generate
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY package.json ./
COPY tsconfig.json ./
COPY src/views ./dist/views
COPY src/public ./dist/public
COPY prisma ./prisma
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/app.js"]
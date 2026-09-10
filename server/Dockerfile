FROM node:20-alpine AS builder
WORKDIR /app
COPY server/package*.json ./
COPY server/prisma ./prisma/
COPY server/tsconfig.json ./
COPY server/src ./src/
RUN npm ci
RUN npx prisma generate
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY server/src/views ./dist/views
COPY server/src/public ./dist/public
COPY server/prisma/schema.prisma ./prisma/
COPY server/package.json ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/app.js"]

FROM mcr.microsoft.com/playwright:v1.59.1-jammy AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npx ng build --configuration=production

FROM mcr.microsoft.com/playwright:v1.59.1-jammy AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HEADLESS=1
ENV DATA_DIR=/app/data
ENV PORT=4000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm rebuild better-sqlite3 \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data/reports

EXPOSE 4000

CMD ["node", "dist/booking-app/server/server.mjs"]

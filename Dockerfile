FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# /data comes from Railway Volume mount — do NOT mkdir /data here
# If Volume not attached, runner.ts exits(2) with SQLITE_CANTOPEN message

CMD ["npx", "tsx", "src/runner.ts"]

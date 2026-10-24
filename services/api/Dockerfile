FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json nest-cli.json ./
COPY src ./src

EXPOSE 3001

CMD ["npm", "run", "start:dev"]

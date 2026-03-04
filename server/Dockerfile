FROM node:20-alpine
WORKDIR /app
COPY server/package.json .
RUN npm install --production
COPY server/server.js .
CMD ["node", "server.js"]

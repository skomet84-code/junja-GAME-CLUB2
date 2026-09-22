FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
RUN npm run check && npm run test:treasure
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["node", "slot-50pct-until-win-start.js"]

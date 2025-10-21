FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .

ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]

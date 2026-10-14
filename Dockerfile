FROM node:20-slim

WORKDIR /app

# Salin manifes dependensi
COPY package*.json ./

# Install dependensi produksi
RUN npm install --omit=dev

# Salin kode aplikasi
COPY . .

# Port default Hugging Face Spaces adalah 7860
ENV PORT=7860
EXPOSE 7860

# Jalankan server aplikasi RSUD Margono (BOKU)
CMD ["node", "server.mjs"]

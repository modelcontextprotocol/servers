FROM node:20-slim

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código fonte
COPY . .

# Compilar o projeto
RUN npm run build

# Expor porta se necessário para alguma extensão futura
# EXPOSE 3000

# Variáveis de ambiente
ENV NODE_ENV=production

# Executar o servidor
CMD ["node", "dist/index.js"] 
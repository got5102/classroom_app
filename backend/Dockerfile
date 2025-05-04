# Use an official Node image as base
FROM node:18-slim

# Install Python, Java (JDK), and C++ compiler
RUN apt-get update && \
    apt-get install -y python3 python3-pip openjdk-17-jdk g++ && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --only=prod

# Copy the application code
COPY server.js ./

# Expose port
EXPOSE 3000

# Start the server
CMD [ "node", "server.js" ]

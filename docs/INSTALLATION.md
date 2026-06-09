# MediQ — Installation Guide

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 18.x | Runtime for both client and server |
| npm | ≥ 9.x | Package manager |
| MongoDB | ≥ 6.x | Database (local or Atlas) |
| Git | any | Version control |

---

## 1. Clone the Repository

```bash
git clone https://github.com/your-org/mediq.git
cd mediq
```

---

## 2. Server Setup

### Install dependencies

```bash
cd server
npm install
```

### Configure environment

```bash
cp .env.example .env
```

Edit `server/.env`:

```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/mediq
JWT_SECRET=replace_this_with_a_long_random_secret
JWT_EXPIRES_IN=7d
ALLOWED_ORIGINS=http://localhost:5173
```

> For production, generate JWT_SECRET with:
> `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

### Start the server

```bash
# Development (auto-restarts on changes)
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:5000`.

---

## 3. Client Setup

### Install dependencies

```bash
cd ../client
npm install
```

### Configure environment

```bash
cp .env.example .env
```

Edit `client/.env`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_APP_NAME=MediQ
```

> In development, the Vite dev server proxies `/api` requests to `localhost:5000`
> automatically, so `VITE_API_URL` is only needed for direct API calls.

### Start the dev server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## 4. MongoDB Setup

### Local MongoDB

```bash
# macOS (Homebrew)
brew install mongodb-community
brew services start mongodb-community

# Ubuntu
sudo systemctl start mongod
```

### MongoDB Atlas (Cloud)

1. Create a free cluster at [mongodb.com/cloud/atlas](https://mongodb.com/cloud/atlas)
2. Add your IP to the network access list
3. Create a database user
4. Copy the connection string into `MONGO_URI`

---

## 5. Running Both Servers Simultaneously

Use two terminal windows, or install `concurrently`:

```bash
# From the root directory
npm install -g concurrently

concurrently "cd server && npm run dev" "cd client && npm run dev"
```

---

## 6. Production Build

### Build the client

```bash
cd client
npm run build
# Output: client/dist/
```

### Serve static files from Express (optional)

Add this to `server/app.js` after building:

```js
const path = require('path');
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});
```

---

## Troubleshooting

**MongoDB connection fails**
- Ensure MongoDB is running: `mongod --version`
- Check `MONGO_URI` in your `.env` file

**Port already in use**
- Change `PORT` in `server/.env`
- Change the `server.port` in `client/vite.config.js`

**CORS errors in browser**
- Ensure `ALLOWED_ORIGINS` in `server/.env` includes your client URL

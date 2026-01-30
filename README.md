# AI Usage Monitor

A web application that monitors AI service usage across multiple providers in real-time, providing a single-pane view of all your quotas.

## Features

- **Multi-Provider Support**: Monitor OpenAI, Anthropic, Google AI, Azure OpenAI, AWS Bedrock, opencode zen, AMP, z.ai, and more
- **Real-Time Updates**: WebSocket-powered live updates with automatic refresh every 5 minutes
- **Visual Dashboard**: Progress bars, pie charts, and health indicators for all services
- **Usage History**: Track quota usage over time
- **Easy Management**: Add, edit, and remove services through the web interface

## Architecture

```
ai-usage-quota/
├── backend/          # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── database/    # SQLite database
│   │   ├── routes/      # API endpoints
│   │   ├── services/    # AI provider integrations
│   │   └── types/       # TypeScript types
│   └── data/            # SQLite database files
└── frontend/         # React + TypeScript + Tailwind CSS
    └── src/
        ├── components/    # React components
        ├── hooks/         # Custom React hooks
        └── types/         # TypeScript types
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- API keys for the AI services you want to monitor

### Setup

1. **Install Backend Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env to adjust port and refresh interval if needed
   ```

3. **Start the Backend**
   ```bash
   npm run dev
   ```
   The backend will start on http://localhost:3001

4. **Install Frontend Dependencies** (in a new terminal)
   ```bash
   cd frontend
   npm install
   ```

5. **Start the Frontend**
   ```bash
   npm run dev
   ```
   The frontend will start on http://localhost:3000

6. **Open the Dashboard**
   Navigate to http://localhost:3000 in your browser

### Adding AI Services

1. Click "Add Service" in the dashboard
2. Enter a name for the service (e.g., "Production OpenAI")
3. Select the provider from the dropdown
4. Enter your API key
5. (Optional) Enter a custom base URL if using a proxy or custom endpoint
6. Click "Add Service"

The dashboard will automatically fetch and display your quotas.

## Supported Providers

### OpenAI
- Monthly spend limits
- Soft and hard billing limits
- Usage tracking

### Anthropic
- Rate limits (requests/minute, tokens/minute)
- Real-time quota extraction from headers

### Google AI (Gemini)
- Request quotas
- Token quotas
- Daily limits

### AWS Bedrock
- Model-specific quotas
- Regional limits

### opencode zen
**Special Configuration Required**: opencode zen uses SolidJS SSR, so the usage data is embedded in the HTML page rather than exposed via a REST API. **Authentication is required** via session cookies.

To configure:
1. Set the **Base URL** to your workspace billing page: `https://opencode.ai/workspace/WRK_YOUR_WORKSPACE_ID`
2. The workspace ID can be found in your opencode dashboard URL
3. **API Key (Required)**: You must provide your session cookie:
   - Open opencode.ai in your browser
   - Open DevTools (F12) → Application/Storage → Cookies
   - Find the session cookie (usually named `session` or similar)
   - Copy the cookie value and paste it as the API Key
   - Note: Session cookies expire, so you may need to update this periodically

**Monitored Quotas:**
- 5-hour rolling usage percentage and reset time
- Weekly usage percentage and reset time  
- Monthly usage (if limit is set)
- Account balance
- Subscription plan details

### AMP (ampcode.com)
**Special Configuration Required**: AMP uses SvelteKit remote commands for API access. **Authentication is required** via session cookies.

To configure:
1. **API Key (Required)**: You must provide your session cookie:
   - Open ampcode.com in your browser
   - Log in to your account
   - Open DevTools (F12) → Application/Storage → Cookies
   - Find the session cookie
   - Copy the cookie value and paste it as the API Key
   - Note: Session cookies expire, so you may need to update this periodically
2. **Base URL**: Defaults to `https://ampcode.com` (optional)

**Monitored Quotas:**
- Free tier quota (default: 2000 credits)
- Current usage
- Hourly replenishment rate (default: 83 credits/hour)
- 24-hour window tracking
- Remaining credits

### z.ai
**REST API with Bearer Token Authentication**: z.ai uses a standard REST API architecture with Bearer token authentication.

To configure:
1. **API Key (Required)**: You must provide your Bearer token:
   - Open z.ai in your browser
   - Log in to your account
   - Open DevTools (F12) → Application → Local Storage
   - Find the token (key: `z-ai-open-platform-token-production` or `z-ai-website-token`)
   - Copy the token value and paste it as the API Key
   - Note: Tokens expire, so you may need to update this periodically
2. **Base URL**: Defaults to `https://api.z.ai` (optional)

**Monitored Quotas:**
- Time-based limits (requests per time window)
- Token consumption limits
- Model-specific usage (search-prime, web-reader, zread)
- Active subscriptions (GLM Coding Max, etc.)
- Remaining credits and percentages

## API Endpoints

### Services
- `GET /api/services` - List all services
- `POST /api/services` - Add a new service
- `PUT /api/services/:id` - Update a service
- `DELETE /api/services/:id` - Delete a service

### Quotas
- `GET /api/quotas` - Get all quotas
- `POST /api/quotas/refresh` - Refresh all quotas
- `GET /api/status` - Get service statuses

### Usage History
- `GET /api/usage/history?serviceId=&hours=` - Get usage history

## Configuration

### Environment Variables (Backend)

```env
PORT=3001                    # Server port
REFRESH_INTERVAL=*/5 * * * * # Cron schedule for auto-refresh (default: every 5 min)
```

### Database

The application uses SQLite for data storage. The database file is created automatically at `backend/data/ai-usage.db`.

## Development

### Backend Development

```bash
cd backend
npm run dev
```

The backend uses:
- TypeScript with hot reload (nodemon)
- SQLite with better-sqlite3
- Express for REST API
- WebSocket for real-time updates
- node-cron for scheduled tasks

### Frontend Development

```bash
cd frontend
npm run dev
```

The frontend uses:
- React 19 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Recharts for data visualization
- Lucide React for icons

### Building for Production

**Backend:**
```bash
cd backend
npm run build
npm start
```

**Frontend:**
```bash
cd frontend
npm run build
```

The frontend build will be in `frontend/dist/`.

### Docker Deployment

Build and run the application using Docker:

```bash
# Build the Docker image
docker build -t ai-usage-quota .

# Run the container
docker run -d \
  --name ai-usage-quota \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  ai-usage-quota
```

The application will be available at http://localhost:3001. Both the frontend and backend are served from the same port, making it easy to deploy behind a reverse proxy.

**Environment Variables:**
You can customize the configuration by passing environment variables:

```bash
docker run -d \
  --name ai-usage-quota \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  -e PORT=3001 \
  -e REFRESH_INTERVAL=*/5 * * * * \
  ai-usage-quota
```

**Using Docker Compose:**

Create a `docker-compose.yml` file:

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=3001
      - REFRESH_INTERVAL=*/5 * * * *
    restart: unless-stopped
```

Run with:

```bash
docker-compose up -d
```

## Security Considerations

- API keys are stored in the SQLite database
- Use environment variables for sensitive configuration
- Consider implementing authentication for production use
- API keys are masked in the UI (password input type)
- Database file should have restricted permissions

## Troubleshooting

### Services show "Error" status
- Verify API keys are correct
- Check that the service is enabled
- Review backend logs for specific error messages
- Some providers may require specific headers or authentication methods

### WebSocket not connecting
- Ensure backend is running on the correct port
- Check firewall settings
- Verify CORS configuration if accessing from a different origin

### Quotas not updating
- Check the refresh interval in your `.env` file
- Manually refresh using the "Refresh All" button
- Verify API keys have the necessary permissions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT

# @mcp-planner/config

Shared configuration package for MCP Planning monorepo.

## 📦 Single Source of Truth

All port numbers and API URLs are centralized in this package.

## 🔧 Configuration

### Default Ports

- **Web Server (REST API)**: `8790`
- **Web Dashboard (Angular)**: `8791`

### Environment Variables

Override ports using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_PLANNER_SERVER_PORT` | REST API server port | 8790 |
| `MCP_PLANNER_DASHBOARD_PORT` | Angular dashboard port | 8791 |

## 💻 Usage Examples

### Server-side (Node.js)

```typescript
import { getWebServerPort, getServerConfig } from '@mcp-planner/config/server';

// Get port with env override support
const port = getWebServerPort(); // Returns 8790 or MCP_PLANNER_SERVER_PORT

// Get full server configuration
const config = getServerConfig();
console.log(config.port); // 8790
console.log(config.corsOrigins); // ['http://localhost:8791']
```

### Client-side (Angular)

```typescript
import { WEB_SERVER_PORT, CLIENT_API_BASE_URL } from '@mcp-planner/config/client';

// Compile-time constants (no process.env)
const apiUrl = CLIENT_API_BASE_URL; // 'http://localhost:8790/api/v1'
```

### Playwright Tests

```typescript
import { WEB_SERVER_PORT, WEB_DASHBOARD_PORT } from '@mcp-planner/config/client';

export default defineConfig({
  use: {
    baseURL: `http://localhost:${WEB_DASHBOARD_PORT}`
  }
});
```

## 🌍 Environment Variable Examples

### Windows CMD

```cmd
set MCP_PLANNER_SERVER_PORT=9500
set MCP_PLANNER_DASHBOARD_PORT=9501
npm run dev:web
```

### Windows PowerShell

```powershell
$env:MCP_PLANNER_SERVER_PORT=9500
$env:MCP_PLANNER_DASHBOARD_PORT=9501
npm run dev:web
```

### Linux / macOS

```bash
export MCP_PLANNER_SERVER_PORT=9500
export MCP_PLANNER_DASHBOARD_PORT=9501
npm run dev:web

# Or inline
MCP_PLANNER_SERVER_PORT=9500 MCP_PLANNER_DASHBOARD_PORT=9501 npm run dev:web
```

### .env file

Create `.env` in project root:

```env
MCP_PLANNER_SERVER_PORT=9500
MCP_PLANNER_DASHBOARD_PORT=9501
```

Then use with `dotenv`:

```bash
node -r dotenv/config packages/web-server/dist/main.js
```

## 📁 Package Structure

```
packages/config/
├── src/
│   ├── constants.ts    # Single source of truth
│   ├── server.ts       # Node.js runtime config (process.env)
│   ├── client.ts       # Angular compile-time config
│   └── index.ts        # Main export
└── README.md
```

## 🔍 Testing

Run the test script to verify environment variable support:

```bash
# From project root
node test-env-vars.mjs

# With custom ports (Windows)
test-env-override.bat
```

## 📝 Architecture

### Dual Export Strategy

- **`config/server`**: Runtime configuration with `process.env` support (Node.js only)
- **`config/client`**: Compile-time constants for Angular (no Node.js APIs)
- **`config/constants`**: Shared constants used by both

This separation ensures Angular can import config without Node.js dependencies.

## 🎯 Key Benefits

1. **Single Source of Truth** - Change ports in one place (`constants.ts`)
2. **Environment Override** - Support for different environments (dev, staging, prod)
3. **Type Safety** - Full TypeScript support with proper types
4. **No Hardcoding** - All code imports from this package
5. **Unique Names** - `MCP_PLANNER_*` prefix prevents conflicts with other projects

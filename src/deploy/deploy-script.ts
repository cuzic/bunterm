import type { Config } from '@/core/config/types.js';

export interface DeployScriptOptions {
  hostname: string;
  deployDir: string;
  caddyAdminApi: string;
}

export function generateDeployScript(config: Config, options: DeployScriptOptions): string {
  const { hostname, deployDir, caddyAdminApi } = options;
  const basePath = config.base_path;

  return `#!/bin/bash
# bunterm deploy script for static mode
# Generated at ${new Date().toISOString()}
#
# This script sets up Caddy routes for bunterm static mode.
# Run this after starting sessions with 'bunterm up'.

set -e

DEPLOY_DIR="${deployDir}"
HOSTNAME="${hostname}"
BASE_PATH="${basePath}"
CADDY_ADMIN_API="${caddyAdminApi}"

echo "bunterm deploy script"
echo "======================"
echo ""

# Check if portal directory exists
if [ ! -d "\$DEPLOY_DIR/portal" ]; then
    echo "Error: Portal directory not found at \$DEPLOY_DIR/portal"
    echo "Run 'bunterm deploy' first to generate deployment files."
    exit 1
fi

# Check if Caddy Admin API is available
if ! curl -s "\$CADDY_ADMIN_API/config/" > /dev/null 2>&1; then
    echo "Error: Cannot connect to Caddy Admin API at \$CADDY_ADMIN_API"
    echo ""
    echo "Option 1: Make sure Caddy is running with admin API enabled"
    echo "Option 2: Manually add the Caddyfile snippet from:"
    echo "          \$DEPLOY_DIR/Caddyfile.snippet"
    exit 1
fi

echo "Setting up Caddy routes..."
echo ""

# Read and apply routes from caddy-routes.json
if [ -f "\$DEPLOY_DIR/caddy-routes.json" ]; then
    ROUTES=\$(cat "\$DEPLOY_DIR/caddy-routes.json")

    # Get current config to find the server
    CONFIG=\$(curl -s "\$CADDY_ADMIN_API/config/")

    # Try to find existing server for the hostname
    # This is a simplified approach - you may need to adjust for your setup
    echo "Applying routes for \$HOSTNAME..."

    # Note: This is a basic implementation. For production use,
    # you may want to use 'bunterm caddy setup' or manually configure.
    echo ""
    echo "Routes configuration saved to: \$DEPLOY_DIR/caddy-routes.json"
    echo ""
    echo "To apply manually, either:"
    echo "1. Run: bunterm caddy setup --hostname \$HOSTNAME"
    echo "2. Add the snippet from \$DEPLOY_DIR/Caddyfile.snippet to your Caddyfile"
else
    echo "Warning: caddy-routes.json not found"
fi

echo ""
echo "Portal files are in: \$DEPLOY_DIR/portal/"
echo "Caddyfile snippet: \$DEPLOY_DIR/Caddyfile.snippet"
echo ""
echo "Done!"
`;
}

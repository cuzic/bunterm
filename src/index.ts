#!/usr/bin/env node

import { program } from 'commander';
import { wrapCommand } from '@/core/cli/command-runner.js';
import {
  caddyRemoveCommand,
  caddySetupCommand,
  caddySnippetCommand,
  caddyStatusCommand,
  caddySyncCommand
} from '@/core/cli/commands/caddy.js';
import { connectionsCommand, connectionsRevokeCommand } from '@/core/cli/commands/connections.js';
import { daemonCommand } from '@/core/cli/commands/daemon.js';
import { deployCommand } from '@/core/cli/commands/deploy.js';
import { doctorCommand } from '@/core/cli/commands/doctor.js';
import { downCommand } from '@/core/cli/commands/down.js';
import { listCommand } from '@/core/cli/commands/list.js';
import { reloadCommand } from '@/core/cli/commands/reload.js';
import { restartCommand } from '@/core/cli/commands/restart.js';
import { shareCommand, shareListCommand, shareRevokeCommand } from '@/core/cli/commands/share.js';
import { shutdownCommand } from '@/core/cli/commands/shutdown.js';
import { statusCommand } from '@/core/cli/commands/status.js';
import { upCommand } from '@/core/cli/commands/up.js';
import { NAME, VERSION } from './version.js';

program
  .name(NAME)
  .description('Browser-based terminal manager')
  .version(VERSION)
  .addHelpText(
    'after',
    `
Usage Patterns:

  Dynamic (ad-hoc sessions for development):
    $ cd ~/my-project && bunterm up
    $ bunterm down

  Static (server deployment with predefined sessions):
    $ bunterm start --sessions    # Start daemon + all sessions
    $ bunterm start -s            # Start daemon + select sessions
    $ bunterm stop --stop-sessions
`
  );

// === Session commands (dynamic usage) ===

program
  .command('up')
  .description('Start session for current directory')
  .option('-n, --name <name>', 'Override session name')
  .option('-c, --config <path>', 'Config file path')
  .action(wrapCommand((options) => upCommand(options)));

program
  .command('down')
  .description('Stop session for current directory')
  .option('-c, --config <path>', 'Config file path')
  .action(wrapCommand((options) => downCommand(options)));

program
  .command('status')
  .description('Show daemon and session status')
  .option('-c, --config <path>', 'Config file path')
  .option('--json', 'Output as JSON')
  .action(wrapCommand((options) => statusCommand(options)));

program
  .command('list')
  .alias('ls')
  .description('List active sessions')
  .option('-c, --config <path>', 'Config file path')
  .option('-l, --long', 'Show detailed information')
  .option('--url', 'Show access URLs')
  .option('--json', 'Output as JSON')
  .action(wrapCommand((options) => listCommand(options)));

// === Daemon control ===

program
  .command('start')
  .description('Start the daemon')
  .option('-f, --foreground', 'Run in foreground')
  .option('-c, --config <path>', 'Config file path')
  .option('--sessions', 'Start all predefined sessions after daemon starts')
  .option('-s, --select', 'Interactively select sessions to start')
  .action(wrapCommand((options) => daemonCommand(options)));

program
  .command('stop')
  .alias('shutdown')
  .description('Stop the daemon')
  .option('-c, --config <path>', 'Config file path')
  .option('-s, --stop-sessions', 'Stop all sessions before shutting down')
  .action(wrapCommand((options) => shutdownCommand(options)));

program
  .command('reload')
  .description('Reload configuration without restart')
  .option('-c, --config <path>', 'Config file path')
  .action(wrapCommand((options) => reloadCommand(options)));

program
  .command('restart')
  .description('Restart the daemon (apply code updates)')
  .option('-c, --config <path>', 'Config file path')
  .action(wrapCommand((options) => restartCommand(options)));

// === Utilities ===

program
  .command('doctor')
  .description('Check dependencies and configuration')
  .option('-c, --config <path>', 'Config file path')
  .option('--json', 'Output as JSON')
  .action(wrapCommand((options) => doctorCommand(options)));

program
  .command('deploy')
  .description('Generate static files for static proxy mode')
  .option('--hostname <hostname>', 'Server hostname (or set in config.yaml)')
  .option('-o, --output <dir>', 'Output directory')
  .option('-c, --config <path>', 'Config file path')
  .action(wrapCommand((options) => deployCommand(options)));

// === Connection management ===

const connections = program.command('connections').description('Manage authenticated connections');

connections
  .command('list')
  .alias('ls')
  .description('List active authenticated sessions')
  .option('-c, --config <path>', 'Config file path')
  .option('--json', 'Output as JSON')
  .action(wrapCommand((options) => connectionsCommand(options)));

connections
  .command('revoke <id>')
  .description('Revoke an authenticated session')
  .option('-c, --config <path>', 'Config file path')
  .action(wrapCommand((id, options) => connectionsRevokeCommand(id, options)));

// Also register 'connections' without subcommand as alias for 'connections list'
connections.action(wrapCommand((options) => connectionsCommand(options)));

// === Caddy integration ===

const caddy = program.command('caddy').description('Caddy reverse proxy integration');

caddy
  .command('snippet')
  .description('Show Caddyfile snippet for copy-paste')
  .option('-c, --config <path>', 'Config file path')
  .action(wrapCommand((options) => caddySnippetCommand(options)));

caddy
  .command('setup')
  .description('Add bunterm route via Caddy Admin API')
  .option('--hostname <hostname>', 'Server hostname (or set in config.yaml)')
  .option('--admin-api <url>', 'Caddy Admin API URL')
  .option('-c, --config <path>', 'Config file path')
  .action(wrapCommand((options) => caddySetupCommand(options)));

caddy
  .command('remove')
  .description('Remove bunterm route via Caddy Admin API')
  .option('--hostname <hostname>', 'Server hostname (or set in config.yaml)')
  .option('--admin-api <url>', 'Caddy Admin API URL')
  .option('-c, --config <path>', 'Config file path')
  .action(wrapCommand((options) => caddyRemoveCommand(options)));

caddy
  .command('sync')
  .description('Sync session routes with Caddy (static proxy mode)')
  .option('--hostname <hostname>', 'Server hostname (or set in config.yaml)')
  .option('--admin-api <url>', 'Caddy Admin API URL')
  .option('-c, --config <path>', 'Config file path')
  .action(wrapCommand((options) => caddySyncCommand(options)));

caddy
  .command('status')
  .description('Show bunterm routes in Caddy')
  .option('--admin-api <url>', 'Caddy Admin API URL')
  .option('-c, --config <path>', 'Config file path')
  .action(wrapCommand((options) => caddyStatusCommand(options)));

// === Session sharing ===

const share = program.command('share').description('Session sharing (read-only)');

share
  .command('create <session>')
  .description('Create a read-only share link for a session')
  .option('-c, --config <path>', 'Config file path')
  .option('-e, --expires <duration>', 'Expiration time (e.g., 1h, 30m, 7d)', '1h')
  .action(
    wrapCommand((session, options) =>
      shareCommand(session, { config: options.config, expires: options.expires })
    )
  );

share
  .command('list')
  .alias('ls')
  .description('List active share links')
  .option('--json', 'Output as JSON')
  .action(wrapCommand((options) => shareListCommand(options)));

share
  .command('revoke <token>')
  .description('Revoke a share link')
  .action(wrapCommand((token, options) => shareRevokeCommand(token, options)));

// Parse arguments
program.parse();

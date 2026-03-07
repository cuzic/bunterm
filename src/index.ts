#!/usr/bin/env node

import { attachCommand } from '@/core/cli/commands/attach.js';
import {
  caddyRemoveCommand,
  caddySetupCommand,
  caddySnippetCommand,
  caddyStatusCommand,
  caddySyncCommand
} from '@/core/cli/commands/caddy.js';
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
import { program } from 'commander';
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
  .option('-a, --attach', 'Attach to tmux session after starting')
  .option('-d, --detach', 'Do not attach to tmux session')
  .action((options) => upCommand(options));

program
  .command('down')
  .description('Stop session for current directory')
  .option('-c, --config <path>', 'Config file path')
  .option('--kill-tmux', 'Also terminate the tmux session')
  .action((options) => downCommand(options));

program
  .command('status')
  .description('Show daemon and session status')
  .option('-c, --config <path>', 'Config file path')
  .action((options) => statusCommand(options));

program
  .command('list')
  .alias('ls')
  .description('List active sessions')
  .option('-c, --config <path>', 'Config file path')
  .option('-l, --long', 'Show detailed information')
  .option('--url', 'Show access URLs')
  .action((options) => listCommand(options));

program
  .command('attach [name]')
  .description('Attach to a tmux session directly')
  .option('-c, --config <path>', 'Config file path')
  .action((name, options) => attachCommand(name, options));

// === Daemon control ===

program
  .command('start')
  .description('Start the daemon')
  .option('-f, --foreground', 'Run in foreground')
  .option('-c, --config <path>', 'Config file path')
  .option('--sessions', 'Start all predefined sessions after daemon starts')
  .option('-s, --select', 'Interactively select sessions to start')
  .action((options) => daemonCommand(options));

program
  .command('stop')
  .alias('shutdown')
  .description('Stop the daemon')
  .option('-c, --config <path>', 'Config file path')
  .option('-s, --stop-sessions', 'Stop all sessions before shutting down')
  .option('--kill-tmux', 'Also terminate tmux sessions (requires -s)')
  .action((options) => shutdownCommand(options));

program
  .command('reload')
  .description('Reload configuration without restart')
  .option('-c, --config <path>', 'Config file path')
  .action((options) => reloadCommand(options));

program
  .command('restart')
  .description('Restart the daemon (apply code updates)')
  .option('-c, --config <path>', 'Config file path')
  .action((options) => restartCommand(options));

// === Utilities ===

program
  .command('doctor')
  .description('Check dependencies and configuration')
  .option('-c, --config <path>', 'Config file path')
  .action((options) => doctorCommand(options));

program
  .command('deploy')
  .description('Generate static files for static proxy mode')
  .option('--hostname <hostname>', 'Server hostname (or set in config.yaml)')
  .option('-o, --output <dir>', 'Output directory')
  .option('-c, --config <path>', 'Config file path')
  .action((options) => deployCommand(options));

// === Caddy integration ===

const caddy = program.command('caddy').description('Caddy reverse proxy integration');

caddy
  .command('snippet')
  .description('Show Caddyfile snippet for copy-paste')
  .option('-c, --config <path>', 'Config file path')
  .action((options) => caddySnippetCommand(options));

caddy
  .command('setup')
  .description('Add bunterm route via Caddy Admin API')
  .option('--hostname <hostname>', 'Server hostname (or set in config.yaml)')
  .option('--admin-api <url>', 'Caddy Admin API URL')
  .option('-c, --config <path>', 'Config file path')
  .action((options) => caddySetupCommand(options));

caddy
  .command('remove')
  .description('Remove bunterm route via Caddy Admin API')
  .option('--hostname <hostname>', 'Server hostname (or set in config.yaml)')
  .option('--admin-api <url>', 'Caddy Admin API URL')
  .option('-c, --config <path>', 'Config file path')
  .action((options) => caddyRemoveCommand(options));

caddy
  .command('sync')
  .description('Sync session routes with Caddy (static proxy mode)')
  .option('--hostname <hostname>', 'Server hostname (or set in config.yaml)')
  .option('--admin-api <url>', 'Caddy Admin API URL')
  .option('-c, --config <path>', 'Config file path')
  .action((options) => caddySyncCommand(options));

caddy
  .command('status')
  .description('Show bunterm routes in Caddy')
  .option('--admin-api <url>', 'Caddy Admin API URL')
  .option('-c, --config <path>', 'Config file path')
  .action((options) => caddyStatusCommand(options));

// === Session sharing ===

const share = program.command('share').description('Session sharing (read-only)');

share
  .command('create <session>')
  .description('Create a read-only share link for a session')
  .option('-e, --expires <duration>', 'Expiration time (e.g., 1h, 30m, 7d)', '1h')
  .action((session, options) => shareCommand(session, { expires: options.expires }));

share
  .command('list')
  .alias('ls')
  .description('List active share links')
  .option('--json', 'Output as JSON')
  .action((options) => shareListCommand(options));

share
  .command('revoke <token>')
  .description('Revoke a share link')
  .action((token, options) => shareRevokeCommand(token, options));

// Parse arguments
program.parse();

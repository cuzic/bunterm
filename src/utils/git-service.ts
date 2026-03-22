/**
 * Git Service
 *
 * Centralized git operations for diff, status, and repository checks.
 */

import { spawn } from 'node:child_process';

/**
 * Git file status in diff
 */
export interface GitDiffFile {
  path: string;
  status: 'M' | 'A' | 'D' | 'R';
  additions: number;
  deletions: number;
}

/**
 * Git diff response
 */
export interface GitDiffResponse {
  files: GitDiffFile[];
  fullDiff: string;
  summary: string;
}

/**
 * Maximum diff size in bytes (50KB)
 */
const MAX_DIFF_SIZE = 50 * 1024;

/**
 * Run a git command and collect output
 */
function runGitCommand(cwd: string, args: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd });

    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, code: code ?? 0 });
    });

    proc.on('error', () => {
      resolve({ stdout: '', code: -1 });
    });
  });
}

/**
 * Check if a directory is a git repository
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  const { code } = await runGitCommand(cwd, ['rev-parse', '--git-dir']);
  return code === 0;
}

/**
 * Get git diff information for a repository
 */
export async function getGitDiff(cwd: string): Promise<GitDiffResponse> {
  // Get numstat for file-level stats
  const { stdout: numstat, code } = await runGitCommand(cwd, ['diff', '--numstat', 'HEAD']);

  if (code !== 0) {
    return { files: [], fullDiff: '', summary: 'No git repository' };
  }

  // Parse numstat output
  const files: GitDiffFile[] = [];
  const lines = numstat
    .trim()
    .split('\n')
    .filter((l) => l.trim());

  for (const line of lines) {
    const [additions, deletions, path] = line.split('\t');
    if (path) {
      files.push({
        path,
        status: 'M' as const,
        additions: Number.parseInt(additions ?? '0', 10) || 0,
        deletions: Number.parseInt(deletions ?? '0', 10) || 0
      });
    }
  }

  // Get full diff (both staged and unstaged)
  const fullDiff = await getFullDiff(cwd);

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
  const summary = `${files.length} files, +${totalAdditions}/-${totalDeletions}`;

  return { files, fullDiff, summary };
}

/**
 * Get full git diff (limited to MAX_DIFF_SIZE)
 */
async function getFullDiff(cwd: string): Promise<string> {
  // Get both staged and unstaged changes in parallel
  const [staged, unstaged] = await Promise.all([
    runGitCommand(cwd, ['diff', '--staged']),
    runGitCommand(cwd, ['diff'])
  ]);

  const combined = staged.stdout + unstaged.stdout;

  // Limit to MAX_DIFF_SIZE
  return combined.slice(0, MAX_DIFF_SIZE);
}

/**
 * Get diff for a specific file
 */
export async function getFileDiff(cwd: string, filePath: string): Promise<string> {
  const { stdout } = await runGitCommand(cwd, ['diff', 'HEAD', '--', filePath]);
  return stdout.trim();
}

/**
 * Get list of changed files
 */
export async function getChangedFiles(cwd: string): Promise<string[]> {
  const { stdout, code } = await runGitCommand(cwd, ['diff', '--name-only', 'HEAD']);

  if (code !== 0) {
    return [];
  }

  return stdout
    .trim()
    .split('\n')
    .filter((f) => f.trim());
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(cwd: string): Promise<string | null> {
  const { stdout, code } = await runGitCommand(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);

  if (code !== 0) {
    return null;
  }

  return stdout.trim() || null;
}

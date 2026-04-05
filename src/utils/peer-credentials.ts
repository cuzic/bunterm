/**
 * Unix domain socket credential passing via SO_PEERCRED / LOCAL_PEERCRED.
 *
 * Extracts the peer process's UID/GID/PID from the kernel using getsockopt().
 * This provides tamper-proof authentication for Unix socket connections —
 * only the kernel can set these values.
 *
 * - Linux: SO_PEERCRED returns struct ucred { pid, uid, gid } (12 bytes)
 * - macOS: LOCAL_PEERCRED returns struct xucred { cr_version, cr_uid, ... } (76 bytes)
 */
import { dlopen, FFIType } from 'bun:ffi';

const IS_DARWIN = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

// Socket option constants
const SOL_SOCKET = IS_DARWIN ? 0xffff : 1;
const SOL_LOCAL = 0;

// Linux: SO_PEERCRED = 17
// macOS: LOCAL_PEERCRED = 0x001
const SO_PEERCRED = 17;
const LOCAL_PEERCRED = 0x001;

/**
 * Linux struct ucred layout (12 bytes):
 *   pid_t  pid  (i32, offset 0)
 *   uid_t  uid  (u32, offset 4)
 *   gid_t  gid  (u32, offset 8)
 */
const UCRED_SIZE = 12;

/**
 * macOS struct xucred layout (76 bytes):
 *   u_int   cr_version  (u32, offset 0)  — must be XUCRED_VERSION (0)
 *   uid_t   cr_uid      (u32, offset 4)
 *   short   cr_ngroups  (i16, offset 8)
 *   short   padding     (i16, offset 10)
 *   gid_t   cr_groups[16] (u32 × 16, offset 12)
 *
 * Note: macOS LOCAL_PEERCRED does not provide PID.
 */
const XUCRED_SIZE = 76;
const XUCRED_VERSION = 0;

// Load libc
const LIBC_NAME = IS_DARWIN ? 'libSystem.B.dylib' : 'libc.so.6';

interface LibC {
  symbols: {
    getsockopt: (
      fd: number,
      level: number,
      optname: number,
      optval: Uint8Array,
      optlen: Uint8Array
    ) => number;
  };
}

let libc: LibC | null = null;
try {
  if (IS_LINUX || IS_DARWIN) {
    libc = dlopen(LIBC_NAME, {
      getsockopt: {
        args: [FFIType.i32, FFIType.i32, FFIType.i32, FFIType.ptr, FFIType.ptr],
        returns: FFIType.i32
      }
    }) as unknown as LibC;
  }
} catch {
  libc = null;
}

/** Peer process credentials extracted from the kernel. */
export interface PeerCredentials {
  /** Effective user ID of the peer process */
  uid: number;
  /** Effective group ID of the peer process */
  gid: number;
  /** Process ID of the peer process (0 on macOS — not available via LOCAL_PEERCRED) */
  pid: number;
}

/** Check if peer credential retrieval is supported on this platform. */
export function isPeerCredentialSupported(): boolean {
  return libc !== null && (IS_LINUX || IS_DARWIN);
}

/**
 * Get peer credentials from a Unix domain socket fd.
 *
 * Uses getsockopt(SO_PEERCRED) on Linux or getsockopt(LOCAL_PEERCRED) on macOS
 * to retrieve the UID/GID/PID of the connected peer process.
 *
 * @param socketFd - The file descriptor of a connected Unix domain socket
 * @returns PeerCredentials or null if retrieval fails
 */
export function getPeerCredentials(socketFd: number): PeerCredentials | null {
  try {
    if (!libc || socketFd < 0) return null;

    if (IS_LINUX) {
      return getLinuxPeerCredentials(socketFd);
    }
    if (IS_DARWIN) {
      return getDarwinPeerCredentials(socketFd);
    }
    return null;
  } catch {
    return null;
  }
}

function getLinuxPeerCredentials(socketFd: number): PeerCredentials | null {
  if (!libc) return null;

  const optval = new Uint8Array(UCRED_SIZE);
  // optlen is a u32 pointer (4 bytes)
  const optlen = new Uint8Array(4);
  new DataView(optlen.buffer).setUint32(0, UCRED_SIZE, true);

  const result = libc.symbols.getsockopt(socketFd, SOL_SOCKET, SO_PEERCRED, optval, optlen);
  if (result !== 0) return null;

  const view = new DataView(optval.buffer);
  return {
    pid: view.getInt32(0, true),
    uid: view.getUint32(4, true),
    gid: view.getUint32(8, true)
  };
}

function getDarwinPeerCredentials(socketFd: number): PeerCredentials | null {
  if (!libc) return null;

  const optval = new Uint8Array(XUCRED_SIZE);
  const optlen = new Uint8Array(4);
  new DataView(optlen.buffer).setUint32(0, XUCRED_SIZE, true);

  const result = libc.symbols.getsockopt(socketFd, SOL_LOCAL, LOCAL_PEERCRED, optval, optlen);
  if (result !== 0) return null;

  const view = new DataView(optval.buffer);

  // Validate cr_version
  const version = view.getUint32(0, true);
  if (version !== XUCRED_VERSION) return null;

  const uid = view.getUint32(4, true);
  const ngroups = view.getInt16(8, true);
  const gid = ngroups > 0 ? view.getUint32(12, true) : 0;

  return {
    uid,
    gid,
    pid: 0 // macOS LOCAL_PEERCRED does not provide PID
  };
}

/** Result of a same-user validation check. */
export interface ValidationResult {
  allowed: boolean;
  reason: string;
}

/**
 * Validate that the peer process belongs to the same user as the current process.
 *
 * Compares the peer's UID (from SO_PEERCRED) against process.getuid().
 * If credential retrieval is not supported or fails, returns allowed=true
 * (fail-open) to avoid breaking functionality on unsupported platforms.
 *
 * @param socketFd - The file descriptor of a connected Unix domain socket
 * @returns ValidationResult indicating whether the connection is allowed
 */
export function validateSameUser(socketFd: number): ValidationResult {
  if (!isPeerCredentialSupported()) {
    return { allowed: true, reason: 'peer credential not supported on this platform' };
  }

  const cred = getPeerCredentials(socketFd);
  if (!cred) {
    return { allowed: true, reason: 'could not retrieve peer credentials' };
  }

  const myUid = process.getuid?.();
  if (myUid === undefined) {
    return { allowed: true, reason: 'process.getuid() not available' };
  }

  if (cred.uid !== myUid) {
    return {
      allowed: false,
      reason: `uid mismatch: peer=${cred.uid}, self=${myUid}`
    };
  }

  return { allowed: true, reason: 'same user' };
}

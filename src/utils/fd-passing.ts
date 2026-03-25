/**
 * fd passing via SCM_RIGHTS (Bun FFI)
 * Sends/receives file descriptors over Unix domain sockets.
 */
import { dlopen, FFIType, ptr } from 'bun:ffi';

const IS_DARWIN = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

// Struct sizes differ between Linux and macOS
// On Linux 64-bit: cmsg_len is size_t (8 bytes), cmsg_level (4), cmsg_type (4) = 16
// On macOS: cmsg_len is socklen_t (4 bytes), cmsg_level (4), cmsg_type (4) = 12
const CMSG_HEADER_SIZE = IS_DARWIN ? 12 : 16;
const CMSG_ALIGN_SIZE = IS_DARWIN ? 4 : 8;
const CMSG_ALIGN = (len: number): number => (len + CMSG_ALIGN_SIZE - 1) & ~(CMSG_ALIGN_SIZE - 1);
const CMSG_SPACE = (dataLen: number): number => CMSG_ALIGN(CMSG_HEADER_SIZE + dataLen);

const SOL_SOCKET = IS_DARWIN ? 0xffff : 1;
const SCM_RIGHTS = 0x01;
const POLLIN = 0x0001;

// iovec: iov_base (pointer, 8 bytes) + iov_len (size_t, 8 bytes) = 16 bytes
const IOVEC_SIZE = 16;

// msghdr size: enough for both Linux and macOS 64-bit
const MSGHDR_SIZE = 64;

// Default timeout for poll() in milliseconds
const RECV_POLL_TIMEOUT_MS = 1000;

// Load libc
const LIBC_NAME = IS_DARWIN ? 'libSystem.B.dylib' : 'libc.so.6';

const AF_UNIX = 1;
const SOCK_STREAM = 1;

interface LibC {
  symbols: {
    sendmsg: (sockfd: number, msg: Uint8Array, flags: number) => number;
    recvmsg: (sockfd: number, msg: Uint8Array, flags: number) => number;
    poll: (fds: Uint8Array, nfds: number, timeout: number) => number;
    socketpair: (domain: number, type: number, protocol: number, sv: Int32Array) => number;
    close: (fd: number) => number;
  };
}

let libc: LibC | null = null;
try {
  if (IS_LINUX || IS_DARWIN) {
    libc = dlopen(LIBC_NAME, {
      sendmsg: {
        args: [FFIType.i32, FFIType.ptr, FFIType.i32],
        returns: FFIType.i64
      },
      recvmsg: {
        args: [FFIType.i32, FFIType.ptr, FFIType.i32],
        returns: FFIType.i64
      },
      poll: {
        args: [FFIType.ptr, FFIType.u32, FFIType.i32],
        returns: FFIType.i32
      },
      socketpair: {
        args: [FFIType.i32, FFIType.i32, FFIType.i32, FFIType.ptr],
        returns: FFIType.i32
      },
      close: {
        args: [FFIType.i32],
        returns: FFIType.i32
      }
    }) as unknown as LibC;
  }
} catch {
  libc = null;
}

/** Check if fd passing is supported on this platform. */
export function isFdPassingSupported(): boolean {
  return libc !== null && (IS_LINUX || IS_DARWIN);
}

/**
 * Create a Unix domain socket pair suitable for fd passing.
 * Returns [fd0, fd1] or null on failure.
 * These raw fds are NOT managed by the event loop, avoiding data consumption issues.
 */
export function createSocketPair(): [number, number] | null {
  try {
    if (!libc) return null;
    const fds = new Int32Array(2);
    const result = libc.symbols.socketpair(AF_UNIX, SOCK_STREAM, 0, fds);
    if (result !== 0) return null;
    return [fds[0], fds[1]];
  } catch {
    return null;
  }
}

/**
 * Close a raw file descriptor opened via FFI (e.g., from createSocketPair).
 */
export function closeFd(fd: number): boolean {
  try {
    if (!libc || fd < 0) return false;
    return libc.symbols.close(fd) === 0;
  } catch {
    return false;
  }
}

/**
 * Build an iovec struct pointing to a buffer.
 */
function buildIovec(dataBuf: Uint8Array): Uint8Array {
  const iovec = new Uint8Array(IOVEC_SIZE);
  const view = new DataView(iovec.buffer);
  view.setBigUint64(0, BigInt(ptr(dataBuf)), true);
  view.setBigUint64(8, BigInt(dataBuf.length), true);
  return iovec;
}

/**
 * Build a cmsghdr with SCM_RIGHTS containing one fd.
 */
function buildCmsghdr(fd: number): Uint8Array {
  const cmsgSpace = CMSG_SPACE(4);
  const cmsg = new Uint8Array(cmsgSpace);
  const view = new DataView(cmsg.buffer);

  let offset = 0;
  const cmsgLen = CMSG_HEADER_SIZE + 4;

  if (IS_DARWIN) {
    view.setUint32(offset, cmsgLen, true);
    offset += 4;
  } else {
    view.setBigUint64(offset, BigInt(cmsgLen), true);
    offset += 8;
  }

  view.setInt32(offset, SOL_SOCKET, true);
  offset += 4;
  view.setInt32(offset, SCM_RIGHTS, true);
  offset += 4;
  view.setInt32(offset, fd, true);

  return cmsg;
}

/**
 * Build a msghdr struct.
 *
 * Linux 64-bit layout:
 *   0:  msg_name      (ptr, 8)
 *   8:  msg_namelen   (socklen_t, 4) + padding(4)
 *  16:  msg_iov       (ptr, 8)
 *  24:  msg_iovlen    (size_t, 8)
 *  32:  msg_control   (ptr, 8)
 *  40:  msg_controllen(size_t, 8)
 *  48:  msg_flags     (int, 4)
 *
 * macOS 64-bit layout:
 *   0:  msg_name      (ptr, 8)
 *   8:  msg_namelen   (socklen_t, 4) + padding(4)
 *  16:  msg_iov       (ptr, 8)
 *  24:  msg_iovlen    (int, 4) + padding(4)
 *  32:  msg_control   (ptr, 8)
 *  40:  msg_controllen(socklen_t, 4) + padding(4)
 *  48:  msg_flags     (int, 4)
 */
function buildMsghdr(iovecBuf: Uint8Array, cmsgBuf: Uint8Array | null): Uint8Array {
  const msghdr = new Uint8Array(MSGHDR_SIZE);
  const view = new DataView(msghdr.buffer);

  // msg_iov (offset 16)
  view.setBigUint64(16, BigInt(ptr(iovecBuf)), true);

  // msg_iovlen (offset 24)
  if (IS_DARWIN) {
    view.setInt32(24, 1, true);
  } else {
    view.setBigUint64(24, 1n, true);
  }

  // msg_control (offset 32)
  if (cmsgBuf) {
    view.setBigUint64(32, BigInt(ptr(cmsgBuf)), true);
  }

  // msg_controllen (offset 40)
  if (cmsgBuf) {
    if (IS_DARWIN) {
      view.setUint32(40, cmsgBuf.length, true);
    } else {
      view.setBigUint64(40, BigInt(cmsgBuf.length), true);
    }
  }

  return msghdr;
}

/**
 * Wait for a socket to become readable using poll().
 * Needed for non-blocking sockets.
 */
function waitReadable(socketFd: number, timeoutMs: number): boolean {
  if (!libc) return false;
  // struct pollfd: fd (int32) + events (int16) + revents (int16) = 8 bytes
  const pollfd = new Uint8Array(8);
  const view = new DataView(pollfd.buffer);
  view.setInt32(0, socketFd, true);
  view.setInt16(4, POLLIN, true);

  const result = libc.symbols.poll(pollfd, 1, timeoutMs);
  if (result <= 0) return false;

  const revents = view.getInt16(6, true);
  return (revents & POLLIN) !== 0;
}

/** Send a file descriptor over a Unix socket. Returns true on success. */
export function sendFd(socketFd: number, fd: number): boolean {
  try {
    if (!libc || socketFd < 0 || fd < 0) return false;

    const dataBuf = new Uint8Array([0]);
    const iovecBuf = buildIovec(dataBuf);
    const cmsgBuf = buildCmsghdr(fd);
    const msghdrBuf = buildMsghdr(iovecBuf, cmsgBuf);

    const result = libc.symbols.sendmsg(socketFd, msghdrBuf, 0);
    return Number(result) > 0;
  } catch {
    return false;
  }
}

/** Receive a file descriptor from a Unix socket. Returns fd or null on failure. */
export function recvFd(socketFd: number): number | null {
  try {
    if (!libc || socketFd < 0) return null;

    // Wait for data to be available (handles non-blocking sockets)
    if (!waitReadable(socketFd, RECV_POLL_TIMEOUT_MS)) return null;

    const dataBuf = new Uint8Array(1);
    const iovecBuf = buildIovec(dataBuf);

    const cmsgSpace = CMSG_SPACE(4);
    const cmsgBuf = new Uint8Array(cmsgSpace);
    const msghdrBuf = buildMsghdr(iovecBuf, cmsgBuf);

    const result = libc.symbols.recvmsg(socketFd, msghdrBuf, 0);
    if (Number(result) <= 0) return null;

    // Parse received cmsghdr to extract fd
    const cmsgView = new DataView(cmsgBuf.buffer);

    let offset = 0;
    let cmsgLen: number;

    if (IS_DARWIN) {
      cmsgLen = cmsgView.getUint32(offset, true);
      offset += 4;
    } else {
      cmsgLen = Number(cmsgView.getBigUint64(offset, true));
      offset += 8;
    }

    if (cmsgLen < CMSG_HEADER_SIZE + 4) return null;

    const cmsgLevel = cmsgView.getInt32(offset, true);
    offset += 4;
    const cmsgType = cmsgView.getInt32(offset, true);
    offset += 4;

    if (cmsgLevel !== SOL_SOCKET || cmsgType !== SCM_RIGHTS) return null;

    const receivedFd = cmsgView.getInt32(offset, true);
    if (receivedFd < 0) return null;

    return receivedFd;
  } catch {
    return null;
  }
}

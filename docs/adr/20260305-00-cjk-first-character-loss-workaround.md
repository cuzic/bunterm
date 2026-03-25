# ADR 054: CJK First-Character Loss Workaround

## Status

Accepted

## Context

On mobile devices using bunterm with native terminal (Bun.Terminal), Japanese (CJK) text input via the toolbar would lose the first character. For example:

- User inputs: "あいうえお" (5 characters)
- Terminal receives: "いうえお" (4 characters, missing first "あ")

Through extensive debugging, we confirmed:
1. Client correctly sends "あいうえお" (15 bytes in UTF-8)
2. Server correctly receives the 15 bytes
3. `terminal.write("あいうえお")` is called correctly
4. BUT the PTY echo returns only "いうえお"

This indicates the issue is in the Bun.Terminal/PTY layer or downstream (tmux/claude code), not in bunterm code.

## Investigation

Several approaches were tried:

1. **NUL character prefix**: Sending a NUL character (0x00) before the input
   - Result: Newlines stopped being recognized as newlines

2. **Space + Backspace**: Sending a space followed by backspace before input
   - Result: The space was lost, only backspace was input

3. **Echo verification**: Sending one character at a time and verifying echo
   - Result: Input completely broken, nothing could be typed

4. **Space prefix with delay**: Sending a space first, then the actual text after a delay
   - Result: Works correctly

## Decision

Implement a server-side workaround in `terminal-session.ts`:

1. Detect CJK characters in the input using regex: `/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/` (includes Hiragana, Katakana, CJK Unified Ideographs, and Hangul Syllables)
2. If CJK is detected and the input is not newline-only:
   - First send a space character to "wake up" the PTY
   - After a 50ms delay, send the actual text
3. Skip the workaround for newline-only input to preserve normal Enter key behavior

```typescript
// Constants defined at module level for performance
const CJK_PATTERN = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;
const NEWLINE_ONLY_PATTERN = /^[\r\n]+$/;

// In writeBytes method:
const hasCJK = CJK_PATTERN.test(text);
const isNewlineOnly = NEWLINE_ONLY_PATTERN.test(text);

if (hasCJK && !isNewlineOnly) {
  this.terminal.write(' ');
  setTimeout(() => {
    if (this.terminal && !this.terminal.closed) {
      this.terminal.write(text);
    }
  }, 50);
  return;
}
```

## Consequences

### Positive
- CJK text input works correctly on mobile devices
- No changes required to client-side code
- Minimal latency impact (50ms delay)

### Negative
- Input will be prefixed with a space character (user must manually delete it)
- Not a proper fix - it's a workaround for an upstream issue in Bun.Terminal/PTY

### Neutral
- The space prefix is a visible side effect, but acceptable given the alternative of lost characters
- A proper fix would require changes to Bun.Terminal or further investigation of PTY behavior

## References

- Bun.Terminal API: https://bun.sh/docs/api/spawn#terminal
- Issue identified through mobile testing with Japanese IME input

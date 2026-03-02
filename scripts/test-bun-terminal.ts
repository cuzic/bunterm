#!/usr/bin/env bun
/**
 * Bun.Terminal 最小テストコード
 *
 * 使い方: bun run scripts/test-bun-terminal.ts
 */

console.log("Bun version:", Bun.version);
console.log("Platform:", process.platform);

async function testBunTerminal() {
  console.log("\n=== Bun.Terminal Test ===\n");

  try {
    // PTY を使用してシェルを起動
    const proc = Bun.spawn(["bash", "-c", "echo 'Hello from PTY'; sleep 1; echo 'Done'"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
      terminal: {
        cols: 80,
        rows: 24,
      },
    });

    console.log("Process started, PID:", proc.pid);

    // stdout を読み取る
    if (proc.stdout) {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();

      console.log("\n--- Output ---");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        process.stdout.write(decoder.decode(value));
      }
      console.log("\n--- End ---");
    }

    // プロセス終了を待つ
    const exitCode = await proc.exited;
    console.log("\nExit code:", exitCode);

  } catch (error) {
    console.error("Error:", error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
    }
  }
}

testBunTerminal();

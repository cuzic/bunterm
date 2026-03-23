/**
 * OTP Verification Page
 *
 * Inline HTML page for 6-digit OTP input.
 * Follows portal.ts pattern of generating HTML as a string.
 */

export function generateOtpPage(basePath: string, nonce = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>bunterm - Authentication</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0f1a;
      color: #e0e0e0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .container {
      background: #141b2d;
      border: 1px solid #2a3a5e;
      border-radius: 16px;
      padding: 2.5rem;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    h1 {
      font-size: 1.5rem;
      color: #00d9ff;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      color: #888;
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }
    .otp-input-wrapper {
      margin-bottom: 1.5rem;
    }
    .otp-input {
      width: 100%;
      padding: 1rem;
      font-size: 2rem;
      font-family: 'SF Mono', 'Fira Code', monospace;
      letter-spacing: 0.5em;
      text-align: center;
      background: #0a0f1a;
      border: 2px solid #2a3a5e;
      border-radius: 8px;
      color: #fff;
      outline: none;
      transition: border-color 0.2s;
    }
    .otp-input:focus {
      border-color: #00d9ff;
    }
    .otp-input::placeholder {
      letter-spacing: 0.3em;
      color: #444;
    }
    .submit-btn {
      width: 100%;
      padding: 0.875rem;
      font-size: 1rem;
      font-weight: 600;
      background: #00d9ff;
      color: #000;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s, opacity 0.2s;
    }
    .submit-btn:hover { background: #00b8d4; }
    .submit-btn:disabled {
      background: #333;
      color: #666;
      cursor: not-allowed;
    }
    .message {
      margin-top: 1rem;
      font-size: 0.9rem;
      min-height: 1.4em;
    }
    .message.error { color: #ff5252; }
    .message.success { color: #4caf50; }
    .instructions {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid #1e2a45;
      color: #666;
      font-size: 0.8rem;
      line-height: 1.5;
    }
    .instructions code {
      background: #0a0f1a;
      padding: 0.15em 0.4em;
      border-radius: 4px;
      color: #00d9ff;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>bunterm</h1>
    <p class="subtitle">Enter the 6-digit code shown in your terminal</p>
    <form id="otpForm" onsubmit="return handleSubmit(event)">
      <div class="otp-input-wrapper">
        <input
          id="otpInput"
          class="otp-input"
          type="text"
          inputmode="numeric"
          pattern="[0-9]{6}"
          maxlength="6"
          placeholder="000000"
          autocomplete="one-time-code"
          autofocus
          required
        />
      </div>
      <button id="submitBtn" class="submit-btn" type="submit">Verify</button>
    </form>
    <div id="message" class="message"></div>
    <div class="instructions">
      Run <code>bunterm otp</code> in your terminal to generate a code.
    </div>
  </div>

  <script${nonce ? ` nonce="${nonce}"` : ''}>
    const BASE = ${JSON.stringify(basePath)};
    const input = document.getElementById('otpInput');
    const btn = document.getElementById('submitBtn');
    const msg = document.getElementById('message');

    // Only allow digits
    input.addEventListener('input', function() {
      this.value = this.value.replace(/[^0-9]/g, '');
      btn.disabled = this.value.length !== 6;
    });

    // Auto-submit when 6 digits entered
    input.addEventListener('input', function() {
      if (this.value.length === 6) {
        document.getElementById('otpForm').requestSubmit();
      }
    });

    async function handleSubmit(e) {
      e.preventDefault();
      const code = input.value.trim();
      if (code.length !== 6) return false;

      btn.disabled = true;
      btn.textContent = 'Verifying...';
      msg.textContent = '';
      msg.className = 'message';

      try {
        const res = await fetch(BASE + '/api/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          msg.textContent = 'Authenticated! Redirecting...';
          msg.className = 'message success';
          setTimeout(function() {
            window.location.href = BASE + '/';
          }, 500);
        } else {
          const reason = data.error?.message || 'Invalid code';
          msg.textContent = reason;
          msg.className = 'message error';
          input.value = '';
          input.focus();
          btn.disabled = true;
          btn.textContent = 'Verify';
        }
      } catch (err) {
        msg.textContent = 'Connection error. Please try again.';
        msg.className = 'message error';
        btn.disabled = false;
        btn.textContent = 'Verify';
      }

      return false;
    }

    // Init
    btn.disabled = true;
    input.focus();
  </script>
</body>
</html>`;
}

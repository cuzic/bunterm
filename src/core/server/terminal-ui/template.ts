/**
 * Terminal UI HTML Template
 *
 * Note: HTML IDs use "tui" prefix for backward compatibility.
 */

export const terminalUiHtml = `
<div id="tui">
  <div id="tui-buttons">
    <div class="tui-group" data-label="修飾">
      <button id="tui-ctrl" class="modifier">Ctrl</button>
      <button id="tui-alt" class="modifier">Alt</button>
      <button id="tui-shift" class="modifier">Shift</button>
    </div>
    <div class="tui-group" data-label="キー">
      <button id="tui-esc">Esc</button>
      <button id="tui-tab">Tab</button>
      <button id="tui-enter">Enter</button>
    </div>
    <div class="tui-group" data-label="移動">
      <button id="tui-up">↑</button>
      <button id="tui-down">↓</button>
    </div>
    <div class="tui-group" data-label="文字">
      <button id="tui-zoomout">A-</button>
      <button id="tui-zoomin">A+</button>
    </div>
    <div class="tui-group" data-label="コピペ">
      <button id="tui-copyall">All</button>
      <button id="tui-paste" title="スマートペースト（テキスト/画像を自動判別） Alt+V">📋</button>
    </div>
    <div class="tui-group" data-label="ツール">
      <button id="tui-search">🔍</button>
      <button id="tui-session" title="セッション切り替え (Ctrl+K)">📂</button>
      <button id="tui-snippet" title="スニペット">📌</button>
      <button id="tui-download" title="ダウンロード">📥</button>
      <button id="tui-upload" title="アップロード">📤</button>
      <button id="tui-preview" title="HTMLプレビュー">👁</button>
      <button id="tui-notify" title="Push通知">🔔</button>
      <button id="tui-share" title="共有リンク">🔗</button>
      <button id="tui-quote" title="引用コピー (Ctrl+Shift+Q)">📋</button>
    </div>
    <div class="tui-group" data-label="実行">
      <button id="tui-send">Send</button>
      <button id="tui-run">Run</button>
      <button id="tui-auto" class="modifier">Auto</button>
    </div>
    <div class="tui-group tui-group-end">
      <button id="tui-minimize" title="コンパクト表示"><span class="tui-minimize-icon">▼</span></button>
    </div>
  </div>
  <div id="tui-input-row">
    <textarea id="tui-input" rows="1" placeholder="日本語入力 (Enter: 送信)"></textarea>
  </div>
</div>
<div id="tui-search-bar" class="hidden">
  <input id="tui-search-input" type="text" placeholder="検索..." />
  <span id="tui-search-count">0/0</span>
  <button id="tui-search-prev" title="前へ (Shift+Enter)">◀</button>
  <button id="tui-search-next" title="次へ (Enter)">▶</button>
  <button id="tui-search-case" class="modifier" title="大文字小文字を区別">Aa</button>
  <button id="tui-search-regex" class="modifier" title="正規表現">.*</button>
  <button id="tui-search-close" title="閉じる (Esc)">✕</button>
</div>
<button id="tui-toggle" title="ツールバーを表示 (Ctrl+J)">
  <span class="tui-toggle-icon">⌨</span>
  <span class="tui-toggle-badge">入力</span>
</button>
<div id="tui-share-modal" class="hidden">
  <div id="tui-share-modal-content">
    <div id="tui-share-modal-header">
      <span>読み取り専用リンクを作成</span>
      <button id="tui-share-modal-close">×</button>
    </div>
    <div id="tui-share-modal-body">
      <div id="tui-share-expiry">
        <label>有効期限:</label>
        <div id="tui-share-expiry-options">
          <label><input type="radio" name="tui-share-expiry" value="1h"> 1時間</label>
          <label><input type="radio" name="tui-share-expiry" value="24h" checked> 24時間</label>
          <label><input type="radio" name="tui-share-expiry" value="7d"> 7日</label>
        </div>
      </div>
      <button id="tui-share-create">リンクを作成</button>
      <div id="tui-share-result" class="hidden">
        <input id="tui-share-url" type="text" readonly>
        <div id="tui-share-actions">
          <button id="tui-share-copy">コピー</button>
          <button id="tui-share-qr">QRコード</button>
        </div>
        <div id="tui-share-warning">
          ⚠ このリンクを知っている人は誰でもこの端末を閲覧できます
        </div>
      </div>
    </div>
  </div>
</div>
<div id="tui-snippet-modal" class="hidden">
  <div id="tui-snippet-modal-content">
    <div id="tui-snippet-modal-header">
      <span>📌 スニペット</span>
      <div id="tui-snippet-modal-actions">
        <button id="tui-snippet-import" title="インポート">📥</button>
        <button id="tui-snippet-export" title="エクスポート">📤</button>
        <button id="tui-snippet-add" title="追加">+</button>
        <button id="tui-snippet-modal-close">×</button>
      </div>
    </div>
    <div id="tui-snippet-modal-body">
      <input id="tui-snippet-search" type="text" placeholder="スニペットを検索..." />
      <div id="tui-snippet-add-form" class="hidden">
        <input id="tui-snippet-add-name" type="text" placeholder="名前（例: Docker Node）" />
        <textarea id="tui-snippet-add-command" rows="2" placeholder="コマンド（例: docker run -it node:latest bash）"></textarea>
        <div id="tui-snippet-add-buttons">
          <button id="tui-snippet-add-save">保存</button>
          <button id="tui-snippet-add-cancel">キャンセル</button>
        </div>
      </div>
      <div id="tui-snippet-list"></div>
      <div id="tui-snippet-empty">
        スニペットがありません。<br>
        「+」ボタンで追加できます。
      </div>
    </div>
  </div>
</div>
<div id="tui-file-modal" class="hidden">
  <div id="tui-file-modal-content">
    <div id="tui-file-modal-header">
      <span id="tui-file-modal-title">ファイルブラウザ</span>
      <div id="tui-file-modal-actions">
        <button id="tui-file-upload-btn" title="アップロード">📤</button>
        <button id="tui-file-modal-close">×</button>
      </div>
    </div>
    <div id="tui-file-modal-body">
      <div id="tui-file-breadcrumb"></div>
      <div id="tui-file-list"></div>
    </div>
  </div>
</div>
<input type="file" id="tui-file-upload-input" multiple style="display: none;" />
<div id="tui-image-preview-modal" class="hidden">
  <div id="tui-image-preview-content">
    <div id="tui-image-preview-header">
      <span>画像プレビュー</span>
      <button id="tui-image-preview-close">×</button>
    </div>
    <div id="tui-image-preview-body">
      <img id="tui-image-preview-img" alt="Preview" />
      <div id="tui-image-preview-nav">
        <button id="tui-image-preview-prev">◀</button>
        <span id="tui-image-preview-counter">1/1</span>
        <button id="tui-image-preview-next">▶</button>
      </div>
      <div id="tui-image-preview-dots"></div>
    </div>
    <div id="tui-image-preview-footer">
      <button id="tui-image-preview-remove">削除</button>
      <button id="tui-image-preview-cancel">キャンセル</button>
      <button id="tui-image-preview-submit">送信</button>
    </div>
  </div>
</div>
<div id="tui-drop-zone" class="hidden">
  <div id="tui-drop-zone-content">
    📁 ここに画像をドロップ
  </div>
</div>
<div id="tui-preview-pane" class="hidden">
  <div id="tui-preview-header">
    <span id="tui-preview-title">プレビュー</span>
    <div id="tui-preview-actions">
      <button id="tui-preview-refresh" title="更新">🔄</button>
      <button id="tui-preview-select" title="ファイル選択">📁</button>
      <button id="tui-preview-close" title="閉じる">×</button>
    </div>
  </div>
  <iframe id="tui-preview-iframe" sandbox="allow-scripts allow-same-origin"></iframe>
  <div id="tui-preview-resizer"></div>
</div>
<div id="tui-session-modal" class="hidden">
  <div id="tui-session-modal-content">
    <div id="tui-session-modal-header">
      <span>セッション切り替え</span>
      <div id="tui-session-modal-actions">
        <button id="tui-session-refresh" title="更新">🔄</button>
        <button id="tui-session-modal-close">×</button>
      </div>
    </div>
    <div id="tui-session-modal-body">
      <input id="tui-session-search" type="text" placeholder="セッション名で検索..." />
      <div id="tui-session-list"></div>
    </div>
  </div>
</div>
<div id="tui-quote-modal" class="hidden">
  <div id="tui-quote-modal-content">
    <div id="tui-quote-modal-header">
      <span>📋 引用コピー</span>
      <button id="tui-quote-modal-close">×</button>
    </div>
    <div id="tui-quote-tabs">
      <button class="tui-quote-tab active" data-tab="turns">Claude</button>
      <button class="tui-quote-tab" data-tab="projectMd">Project *.md</button>
      <button class="tui-quote-tab" data-tab="plans">Plans</button>
      <button class="tui-quote-tab" data-tab="gitDiff">Git Diff</button>
    </div>
    <div id="tui-quote-controls">
      <button id="tui-quote-select-all">全選択</button>
      <button id="tui-quote-clear">クリア</button>
    </div>
    <div id="tui-quote-list"></div>
    <div id="tui-quote-footer">
      <span id="tui-quote-selection-info"></span>
      <button id="tui-quote-copy">コピー</button>
    </div>
  </div>
</div>
`;

export const onboardingHtml = `
<div id="tui-onboarding">
  <button id="tui-onboarding-close">×</button>
  <strong>Toolbar Tips</strong>
  <ul>
    <li><code>Ctrl+J</code> でツールバー表示/非表示</li>
    <li>ピンチ操作でフォントサイズ変更</li>
    <li>ダブルタップで Enter 送信</li>
    <li><code>▼</code> でコンパクト表示</li>
  </ul>
</div>
`;

# セットアップ手順

## 1. Google Cloud でOAuth クライアントIDを取得

1. https://console.cloud.google.com/ を開く
2. プロジェクトを新規作成（または既存を選択）
3. **APIとサービス → ライブラリ** で「Google Drive API」を有効化
4. **APIとサービス → 認証情報 → 認証情報を作成 → OAuthクライアントID**
   - アプリの種類: **Chrome 拡張機能**
   - アプリケーションID: `chrome-extension://` のあとに続くID（後述）
5. 発行された **クライアントID** をコピー

## 2. manifest.json にクライアントIDを設定

`manifest.json` の以下の行を書き換える：

```json
"client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
```

↓ 例

```json
"client_id": "123456789012-abcdefghijklmnop.apps.googleusercontent.com",
```

## 3. アイコン画像を用意（省略可）

`icon16.png`, `icon48.png`, `icon128.png` を拡張フォルダに置く。  
なければ manifest.json の `icons` セクションを削除してもOK。

## 4. Chrome に読み込む

1. Chrome で `chrome://extensions/` を開く
2. 右上の「**デベロッパーモード**」をON
3. 「**パッケージ化されていない拡張機能を読み込む**」をクリック
4. この `chrome-extension` フォルダを選択
5. 拡張IDが表示されるのでコピーし、Google Cloud Console のOAuth設定に入力

## 5. 使い方

1. Chromeツールバーのアイコンをクリック
2. **「プレビュー確認」** → リネーム前後の一覧が表示される
3. 内容を確認して **「一括リネーム実行」** → 完了！

## 動作例

| 変更前 | 変更後 |
|--------|--------|
| 資料のコピー.260630 | 資料.260630 |
| 資料のコピー.のコピー_0630 | 資料._0630 |
| Aのコピー_Bのコピー_資料 | A_B_資料 |

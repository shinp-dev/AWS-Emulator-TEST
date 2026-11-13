# 学び舎 — 学生管理

AWS Emulator と DynamoDB API を使う学生管理サイトです。アプリは Node.js のバックエンドから Emulator に接続します。デモ学生 8 名は Emulator 上に作成する `Students` テーブルへ初回だけ登録します。

## Windows で起動

前提: Docker Desktop が起動していること。

1. AWS Emulator の Docker イメージをビルドします（初回のみ）。

   ```powershell
   docker build -t aws-emulator .
   ```

2. Emulator を起動します。ターミナルはそのまま開いておきます。

   ```powershell
   $port = 9297
   New-Item -ItemType Directory -Force ".\runtime\aws-emulator" | Out-Null
   docker run --rm --memory=2g --memory-swap=2g -p "127.0.0.1:${port}:${port}" `
     -e EMULATOR_TELEMETRY=off `
     -v "${PWD}\runtime\aws-emulator:/home/emulator/.aws/emulator" `
     aws-emulator -p $port
   ```

3. 別の PowerShell で依存パッケージを入れて、Web アプリを起動します。

   ```powershell
   npm install
   .\start.ps1
   ```

4. `http://127.0.0.1:4173` を開きます。終了時は両方のターミナルで `Ctrl+C` を押します。Emulator を停止すると、DynamoDB のデータは消えます。

## Emulator で試せる操作

- 学生一覧の取得: DynamoDB `Scan`
- 学生の追加: DynamoDB `PutItem`（学籍番号の重複条件付き）
- 学生情報の更新: DynamoDB `GetItem` と `PutItem`
- 学生の削除: DynamoDB `DeleteItem`
- 接続表示: DynamoDB `DescribeTable` を使う `/api/health`

サーバーは Emulator の発行したアクセスキーと CA 証明書を読み、`https://127.0.0.1:9297` に SigV4 署名付きの AWS SDK v3 リクエストを送ります。起動時には Emulator 用の認証ファイルを指定し、環境変数に残った実 AWS のキーは除外します。

## 今回の動作確認

AWS Emulator 上でテーブル作成、サンプル8件の取得、学生の追加・更新・削除、重複IDを条件式で拒否する動作を確認済みです。確認用の学生レコードは削除済みです。`/api/health` は DynamoDB の `DescribeTable` を実行し、Emulator 接続とテーブル状態を返します。

## ファイル

- `Dockerfile`: AWS 公式手順に沿って Emulator イメージを作成
- `server.js`: Web API と DynamoDB 操作
- `start.ps1`: Emulator の認証情報・証明書・接続先を設定してサイトを起動
- `index.html`, `styles.css`, `app.js`: 学生管理画面

この Emulator は開発・テスト用で、実 AWS へのデプロイや本番データ保存には使いません。

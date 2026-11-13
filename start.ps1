$ErrorActionPreference = "Stop"
$port = 9297
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$emulatorDirectory = Join-Path $projectRoot "runtime\aws-emulator\$port"
$credentialsPath = Join-Path $emulatorDirectory "emulator_credentials"
$configPath = Join-Path $emulatorDirectory "config"
$certificatePath = Join-Path $emulatorDirectory "ca.pem"

if (-not (Test-Path -LiteralPath $credentialsPath) -or -not (Test-Path -LiteralPath $certificatePath)) {
    throw "AWS Emulator が起動していません。先に npm run emulator を実行してください。"
}

Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN, Env:AWS_PROFILE -ErrorAction SilentlyContinue
$env:AWS_ENDPOINT_URL = "https://127.0.0.1:$port"
$env:AWS_SHARED_CREDENTIALS_FILE = $credentialsPath
$env:AWS_CONFIG_FILE = $configPath
$env:AWS_REGION = "us-east-1"
$env:AWS_DEFAULT_REGION = "us-east-1"
$env:AWS_EC2_METADATA_DISABLED = "true"
$env:NODE_EXTRA_CA_CERTS = $certificatePath

npm start

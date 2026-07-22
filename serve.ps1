param(
  [int]$Port = 8091,
  [string]$Root = $PSScriptRoot
)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "Serving $Root on http://127.0.0.1:$Port/"

$mime = @{
  '.html' = 'text/html'; '.js' = 'application/javascript'; '.css' = 'text/css';
  '.json' = 'application/json'; '.png' = 'image/png'; '.svg' = 'image/svg+xml'
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $req = $context.Request
  $res = $context.Response
  $path = $req.Url.AbsolutePath.TrimStart('/')
  if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }
  $filePath = Join-Path $Root $path

  if (Test-Path $filePath -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($filePath)
    $contentType = $mime[$ext]
    if (-not $contentType) { $contentType = 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $res.ContentType = $contentType
    $res.SendChunked = $false
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.OutputStream.Flush()
  } else {
    $res.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
    $res.SendChunked = $false
    $res.ContentLength64 = $msg.Length
    $res.OutputStream.Write($msg, 0, $msg.Length)
    $res.OutputStream.Flush()
  }
  $res.Close()
}

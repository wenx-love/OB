# 批量下载 JS Deobfuscator 真实样本
$samples = @(
    @{ name = "sample-02-maoyan"; dir = "maoyan"; desc = "Maoyan (猫眼) movie site obfuscation" },
    @{ name = "sample-03-pdd"; dir = "pdd"; desc = "Pinduoduo (拼多多) e-commerce obfuscation" },
    @{ name = "sample-04-gk"; dir = "gk"; desc = "GK site obfuscation with hex encoding" },
    @{ name = "sample-05-cx"; dir = "cx"; desc = "CX site obfuscation" }
)

$baseUrl = "https://raw.githubusercontent.com/kuizuo/js-deobfuscator/main/example"
$targetDir = "D:\Projects\ob-recover\test\fixtures\real-samples"

foreach ($sample in $samples) {
    Write-Host "Downloading $($sample.name)..." -ForegroundColor Cyan
    
    $samplePath = Join-Path $targetDir $sample.name
    New-Item -ItemType Directory -Force -Path $samplePath | Out-Null
    
    $inputUrl = "$baseUrl/$($sample.dir)/input.js"
    $outputUrl = "$baseUrl/$($sample.dir)/output.js"
    
    curl.exe -s -o "$samplePath\input.js" $inputUrl
    curl.exe -s -o "$samplePath\expected.js" $outputUrl
    
    Write-Host "✓ Downloaded $($sample.name)" -ForegroundColor Green
}

Write-Host "`nAll samples downloaded successfully!" -ForegroundColor Green

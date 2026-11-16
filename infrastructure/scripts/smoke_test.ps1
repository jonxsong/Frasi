param(
    [string] $ApiUrl = "http://localhost:8000"
)

$ErrorActionPreference = "Stop"
$audioPath = Join-Path ([System.IO.Path]::GetTempPath()) "frasi-e2e-smoke.wav"

try {
    $ffmpegExecutable = "ffmpeg"
    $ffmpegPrefix = @()
    $fixtureTarget = $audioPath
    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
        $ffmpegExecutable = "docker"
        $ffmpegPrefix = @("compose", "exec", "-T", "worker", "ffmpeg")
        $fixtureTarget = "/tmp/frasi-e2e-smoke.wav"
    }
    & $ffmpegExecutable @ffmpegPrefix -hide_banner -loglevel error -y `
        -f lavfi -i "sine=frequency=440:duration=0.7:sample_rate=22050" `
        -f lavfi -i "anullsrc=r=22050:cl=mono:d=0.15" `
        -f lavfi -i "sine=frequency=493.88:duration=0.7:sample_rate=22050" `
        -f lavfi -i "anullsrc=r=22050:cl=mono:d=0.15" `
        -f lavfi -i "sine=frequency=523.25:duration=0.7:sample_rate=22050" `
        -f lavfi -i "anullsrc=r=22050:cl=mono:d=0.15" `
        -f lavfi -i "sine=frequency=587.33:duration=0.7:sample_rate=22050" `
        -f lavfi -i "anullsrc=r=22050:cl=mono:d=0.15" `
        -filter_complex "[0:a][1:a][2:a][3:a][4:a][5:a][6:a][7:a]concat=n=8:v=0:a=1[out]" `
        -map "[out]" -c:a pcm_s16le $fixtureTarget
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed to create the smoke-test fixture" }
    if ($ffmpegPrefix.Count) {
        & docker compose cp "worker:$fixtureTarget" $audioPath | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not copy the smoke-test fixture" }
    }

    $email = "frasi-smoke+$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())@example.com"
    $authBody = @{
        email = $email
        password = "frasi-smoke-password"
        display_name = "Smoke Test"
    } | ConvertTo-Json
    $auth = Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/v1/auth/register" `
        -ContentType "application/json" -Body $authBody
    $headers = @{ Authorization = "Bearer $($auth.access_token)" }

    $recording = Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/v1/recordings" `
        -Headers $headers -Form @{
            file = Get-Item -LiteralPath $audioPath
            title = "Synthetic four-note phrase"
            artist = "Frasi smoke test"
        }
    $projectBody = @{
        recording_id = $recording.id
        title = "End-to-end smoke phrase"
        instrument_id = "tenor_saxophone"
        segment_start_seconds = 0
        segment_end_seconds = $recording.duration_seconds
    } | ConvertTo-Json
    $project = Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/v1/transcriptions" `
        -Headers $headers -ContentType "application/json" -Body $projectBody
    $jobHeaders = @{
        Authorization = $headers.Authorization
        "Idempotency-Key" = "smoke-$([guid]::NewGuid().ToString('N'))"
    }
    $job = Invoke-RestMethod -Method Post `
        -Uri "$ApiUrl/api/v1/transcriptions/$($project.id)/process" -Headers $jobHeaders

    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        $job = Invoke-RestMethod -Method Get -Uri "$ApiUrl/api/v1/jobs/$($job.id)" `
            -Headers $headers
        if ($job.status -in @("succeeded", "failed", "cancelled")) { break }
        Start-Sleep -Seconds 2
    }
    if ($job.status -ne "succeeded") {
        throw "Transcription ended with status '$($job.status)': $($job.error_message)"
    }

    $score = Invoke-RestMethod -Method Get `
        -Uri "$ApiUrl/api/v1/transcriptions/$($project.id)/score" -Headers $headers
    $noteCount = ($score.measures | ForEach-Object {
        $_.voices | ForEach-Object { $_.notes.Count }
    } | Measure-Object -Sum).Sum
    [pscustomobject]@{
        recording_id = $recording.id
        duration_seconds = $recording.duration_seconds
        project_id = $project.id
        job_status = $job.status
        job_stage = $job.stage
        progress = $job.progress
        revision_id = $score.id
        note_count = $noteCount
        measure_count = @($score.measures).Count
        musicxml_bytes = [Text.Encoding]::UTF8.GetByteCount($score.musicxml)
    } | ConvertTo-Json
} finally {
    Remove-Item -LiteralPath $audioPath -Force -ErrorAction SilentlyContinue
}

$ErrorActionPreference = 'Stop'
$sourceRoot = 'C:\codex_pen_test1'
$evidenceRoot = Join-Path $sourceRoot '4차_증적_20261101_142151'
$outputRoot = Join-Path 'C:\codex_pen_test\audit' ('handoff-reconciliation-' + (Get-Date -Format 'yyyyMMddTHHmmssfff'))
$null = New-Item -ItemType Directory -Path $outputRoot
function HashRecord($file) {
    $item = Get-Item -LiteralPath $file
    [pscustomobject]@{path=$item.FullName; bytes=$item.Length; created=$item.CreationTime.ToString('o'); modified=$item.LastWriteTime.ToString('o'); sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}
}
$before = @(Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | ForEach-Object { HashRecord $_.FullName })
$protected = Get-Content -LiteralPath (Join-Path $evidenceRoot '기존파일_SHA256_시작.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$checks = @($protected | ForEach-Object {
    $resolved = [IO.Path]::GetFullPath($_.Path)
    if (-not $resolved.StartsWith($sourceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Manifest path outside authorized project' }
    $exists = Test-Path -LiteralPath $resolved -PathType Leaf
    $actual = if ($exists) { (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash } else { $null }
    [pscustomobject]@{path=$resolved; expected=$_.Hash; actual=$actual; state=$(if(-not $exists){'MISSING'}elseif($actual -eq $_.Hash){'MATCH'}else{'CHANGED'})}
})
$artifactList = Get-Content -LiteralPath (Join-Path $evidenceRoot '신규증적및산출물_SHA256.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$artifactChecks = @($artifactList | ForEach-Object {
    $resolved=[IO.Path]::GetFullPath($_.Path)
    if(-not $resolved.StartsWith($sourceRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Artifact path outside authorized project'}
    $exists=Test-Path -LiteralPath $resolved -PathType Leaf
    $actual=if($exists){(Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash}else{$null}
    [pscustomobject]@{path=$resolved; expected=$_.Hash; actual=$actual; state=$(if(-not $exists){'MISSING'}elseif($actual -eq $_.Hash){'MATCH'}else{'CHANGED'})}
})
$matrix = @(Import-Csv -LiteralPath (Join-Path $sourceRoot '라이나생명_4차_검증매트릭스.csv') -Encoding UTF8)
$originalCounts = @($matrix | Group-Object 상태 | ForEach-Object { [pscustomobject]@{state=$_.Name; count=$_.Count} })
$links = @($matrix | ForEach-Object {
    $ref=$_.근거
    if($ref -match '^(.*?\.(?:json|md))(?::|;|$)'){
        $file=Join-Path $sourceRoot $Matches[1]
        [pscustomobject]@{id=$_.시험ID; reference=$ref; exists=(Test-Path -LiteralPath $file -PathType Leaf)}
    }
})
$historicalFinal=Get-Content -LiteralPath (Join-Path $evidenceRoot '기존파일_SHA256_최종검증.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$historicalPairs=@($protected | ForEach-Object {$r=$_;$end=@($historicalFinal|Where-Object {$_.path -eq $r.Path}); [pscustomobject]@{path=$r.Path; matchingEntries=$end.Count; startAndEndAgree=($end.Count -eq 1 -and $end[0].start_sha256 -eq $r.Hash -and $end[0].end_sha256 -eq $r.Hash -and $end[0].unchanged)}})
$after = @(Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | ForEach-Object { HashRecord $_.FullName })
$duringChanges=@($before | ForEach-Object {$r=$_;$end=@($after|Where-Object {$_.path -eq $r.path});if($end.Count -ne 1 -or $end[0].sha256 -ne $r.sha256){$r.path}})
$newDuring=@($after | Where-Object {$before.path -notcontains $_.path} | ForEach-Object {$_.path})
$result=[ordered]@{
    checkedAt=(Get-Date).ToString('o'); sourceRoot=$sourceRoot; sourceReadOnly=$true; serviceTests=0; requests=0; testReruns=0
    matrixRows=$matrix.Count; uniqueIds=@($matrix.시험ID|Select-Object -Unique).Count; originalStatusCounts=$originalCounts
    originalIdsAndConditions=@($matrix|Select-Object 시험ID,상태,검증항목,수행조건,기대결과,재개필요자료)
    protected26=$checks; historicalStartEndAgreement=$historicalPairs; listedArtifacts=$artifactChecks; matrixFileReferences=$links
    originalSnapshotBefore=$before; originalSnapshotAfter=$after; changedDuring=$duringChanges; addedDuring=$newDuring
    extraComparedTo26=@($before|Where-Object {$checks.path -notcontains $_.path}|ForEach-Object {$_.path})
    statusChanges=@(); note='No original CSV updated. O-10 is linked to separate workspace evidence; historical execution metadata limits remain. N-01/N-02 classification correction is documented separately, not rewritten.'
}
$path=Join-Path $outputRoot 'reconciliation.json'
$result|ConvertTo-Json -Depth 9|Set-Content -LiteralPath $path -Encoding UTF8
[pscustomobject]@{file='reconciliation.json';sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $outputRoot 'sha256.json') -Encoding UTF8
[pscustomobject]@{folder=$outputRoot;matrixRows=$matrix.Count;uniqueIds=@($matrix.시험ID|Select-Object -Unique).Count;counts=$originalCounts;protectedMatches=@($checks|Where-Object {$_.state -eq 'MATCH'}).Count;artifactMatches=@($artifactChecks|Where-Object {$_.state -eq 'MATCH'}).Count;historicalPairMatches=@($historicalPairs|Where-Object {$_.startAndEndAgree}).Count;sourceFiles=$before.Count;extraFiles=@($before|Where-Object {$checks.path -notcontains $_.path}).Count;changedDuring=$duringChanges;addedDuring=$newDuring;brokenMatrixFileLinks=@($links|Where-Object {-not $_.exists})}|ConvertTo-Json -Depth 5

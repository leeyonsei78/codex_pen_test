$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$reportWord = New-Object -ComObject Word.Application
$reportWord.Visible = $false
$reportWord.DisplayAlerts = 0
try {
 $reportDoc = $reportWord.Documents.Open('C:\codex_pen_test\deliverables\라이나생명_보안점검_통합보고서.docx', $false, $true)
 $reportDoc.ActiveWindow.View.Type = 3
 $reportDoc.Repaginate()
 $reportPages = $reportDoc.ActiveWindow.Panes.Item(1).Pages
 Write-Output ('Pages: ' + $reportPages.Count)
 for ($reportIndex = 1; $reportIndex -le $reportPages.Count; $reportIndex++) {
  $reportBytes = [byte[]]$reportPages.Item($reportIndex).EnhMetaFileBits
  $reportStream = New-Object System.IO.MemoryStream(,$reportBytes)
  $reportImage = [System.Drawing.Image]::FromStream($reportStream)
  $reportBitmap = New-Object System.Drawing.Bitmap(1240,1754)
  $reportGraphics = [System.Drawing.Graphics]::FromImage($reportBitmap)
  $reportGraphics.Clear([System.Drawing.Color]::White)
  $reportGraphics.DrawImage($reportImage,0,0,1240,1754)
  $reportBitmap.Save(('C:\codex_pen_test\report_qa\page-' + $reportIndex + '.png'),[System.Drawing.Imaging.ImageFormat]::Png)
  $reportGraphics.Dispose(); $reportBitmap.Dispose(); $reportImage.Dispose(); $reportStream.Dispose()
 }
 $reportDoc.Close(0)
} finally { $reportWord.Quit() }

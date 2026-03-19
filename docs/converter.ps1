Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = "JSON files (*.json)|*.json"
$dialog.Title = "Selecione o backup .json para converter"
if ($dialog.ShowDialog() -eq 'OK') {
    $path = $dialog.FileName
    $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($raw)
    $encoded = [Convert]::ToBase64String($bytes)
    $newPath = [System.IO.Path]::ChangeExtension($path, '.dpbak')
    [System.IO.File]::WriteAllText($newPath, $encoded, [System.Text.Encoding]::UTF8)
    [System.Windows.Forms.MessageBox]::Show("Convertido com sucesso!`n`nArquivo salvo em:`n$newPath`n`nAgora importe este .dpbak no site.", "Conversor DailyPlan", 'OK', 'Information')
} else {
    [System.Windows.Forms.MessageBox]::Show("Nenhum arquivo selecionado.", "Conversor DailyPlan", 'OK', 'Warning')
}

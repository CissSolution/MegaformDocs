$src='E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um/Assets'
$dst='E:/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0/wwwroot/Modules/MegaForm'
$files=@(
  'js\bundles\megaform-builder.js',
  'js\bundles\megaform-builder.js.map',
  'js\megaform-builder-loader.js',
  'js\megaform-builder-loader.js.map',
  'js\megaform-renderer.js',
  'js\megaform-renderer.js.map',
  'css\megaform-builder-ts.css',
  'css\megaform-builder.css'
)
foreach($f in $files){
  $srcPath = Join-Path $src $f
  $dstPath = Join-Path $dst $f
  if (Test-Path $srcPath) {
    Copy-Item -LiteralPath $srcPath -Destination $dstPath -Force
    Write-Host "Copied $f"
  } else {
    Write-Host "MISSING $srcPath"
  }
}

# ============================================================
#  Generate a professional 1-page PDF for the MegaForm
#  PdfForm widget demo (no external library needed).
#
#  Output: sample-registration-form.pdf  (A4, single page)
#          sample-registration-form.b64   (base64 of the bytes)
#
#  Coordinates use the PDF coordinate system (origin = bottom-left).
#  Widget positions in the form template use top-left HTML coords;
#  conversion is documented below where the layout is drawn.
# ============================================================

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# A4 in points: 595 x 842
$pageWidth  = 595
$pageHeight = 842

# Build content stream (PDF graphics + text operators)
$cs = [System.Text.StringBuilder]::new()
[void]$cs.AppendLine('q')

# Top-of-page navy band (header)
[void]$cs.AppendLine('0.117 0.227 0.435 rg')
[void]$cs.AppendLine("0 760 $pageWidth 82 re f")

# Title (white) — "EVENT REGISTRATION FORM"
[void]$cs.AppendLine('1 1 1 rg')
[void]$cs.AppendLine('BT')
[void]$cs.AppendLine('/F2 22 Tf')
[void]$cs.AppendLine('48 810 Td')
[void]$cs.AppendLine('(EVENT REGISTRATION FORM) Tj')
[void]$cs.AppendLine('ET')

# Subtitle (white, smaller)
[void]$cs.AppendLine('BT')
[void]$cs.AppendLine('/F1 11 Tf')
[void]$cs.AppendLine('48 786 Td')
[void]$cs.AppendLine('(Annual Tech Summit  -  please complete every section below) Tj')
[void]$cs.AppendLine('ET')

# Right-side "Form 01.06.17" badge (white)
[void]$cs.AppendLine('BT')
[void]$cs.AppendLine('/F1 10 Tf')
[void]$cs.AppendLine('470 810 Td')
[void]$cs.AppendLine('(MegaForm 01.06.17) Tj')
[void]$cs.AppendLine('0 -14 Td')
[void]$cs.AppendLine('(PdfForm Demo) Tj')
[void]$cs.AppendLine('ET')

# Reset stroke + body text colours
[void]$cs.AppendLine('0.117 0.227 0.435 RG')
[void]$cs.AppendLine('0.7 w')
[void]$cs.AppendLine('0.07 0.09 0.15 rg')

# --- Section 1: Personal information ---
[void]$cs.AppendLine('BT')
[void]$cs.AppendLine('/F2 13 Tf')
[void]$cs.AppendLine('48 720 Td')
[void]$cs.AppendLine('(1. PERSONAL INFORMATION) Tj')
[void]$cs.AppendLine('ET')
# horizontal rule below the section
[void]$cs.AppendLine('48 716 m 547 716 l S')

# Labels
function Add-Label([Text.StringBuilder]$sb, [int]$x, [int]$y, [string]$text) {
    [void]$sb.AppendLine('BT')
    [void]$sb.AppendLine('/F1 10 Tf')
    [void]$sb.AppendLine("$x $y Td")
    [void]$sb.AppendLine("($text) Tj")
    [void]$sb.AppendLine('ET')
}
function Add-Box([Text.StringBuilder]$sb, [int]$x, [int]$y, [int]$w, [int]$h) {
    # Light-grey filled box with darker border
    [void]$sb.AppendLine('q')
    [void]$sb.AppendLine('0.94 0.96 0.99 rg')
    [void]$sb.AppendLine("$x $y $w $h re f")
    [void]$sb.AppendLine('0.78 0.84 0.92 RG')
    [void]$sb.AppendLine('0.6 w')
    [void]$sb.AppendLine("$x $y $w $h re S")
    [void]$sb.AppendLine('Q')
}

# Row 1: Full Name (wide) + Date of Birth (narrow)
Add-Label $cs 48  694 'Full Name *'
Add-Box   $cs 48  670 320 22
Add-Label $cs 380 694 'Date of Birth'
Add-Box   $cs 380 670 165 22

# Row 2: Email + Phone
Add-Label $cs 48  640 'Email Address *'
Add-Box   $cs 48  616 320 22
Add-Label $cs 380 640 'Phone'
Add-Box   $cs 380 616 165 22

# Row 3: Address (full width)
Add-Label $cs 48  586 'Mailing Address'
Add-Box   $cs 48  562 497 22

# --- Section 2: Event Selection ---
[void]$cs.AppendLine('BT')
[void]$cs.AppendLine('/F2 13 Tf')
[void]$cs.AppendLine('48 522 Td')
[void]$cs.AppendLine('(2. EVENT SELECTION) Tj')
[void]$cs.AppendLine('ET')
[void]$cs.AppendLine('48 518 m 547 518 l S')

Add-Label $cs 48  494 'Event Year *'
Add-Box   $cs 48  470 160 22
Add-Label $cs 220 494 'Event *'
Add-Box   $cs 220 470 325 22

Add-Label $cs 48  440 'Ticket Type *'
Add-Box   $cs 48  416 200 22
Add-Label $cs 260 440 'Number of Attendees'
Add-Box   $cs 260 416 80 22
Add-Label $cs 352 440 'Dietary Notes'
Add-Box   $cs 352 416 193 22

# --- Section 3: Additional Information ---
[void]$cs.AppendLine('BT')
[void]$cs.AppendLine('/F2 13 Tf')
[void]$cs.AppendLine('48 376 Td')
[void]$cs.AppendLine('(3. ADDITIONAL INFORMATION) Tj')
[void]$cs.AppendLine('ET')
[void]$cs.AppendLine('48 372 m 547 372 l S')

Add-Label $cs 48 348 'Comments / Special Requests'
# Larger text-area box
[void]$cs.AppendLine('q')
[void]$cs.AppendLine('0.94 0.96 0.99 rg')
[void]$cs.AppendLine('48 250 497 88 re f')
[void]$cs.AppendLine('0.78 0.84 0.92 RG')
[void]$cs.AppendLine('0.6 w')
[void]$cs.AppendLine('48 250 497 88 re S')
[void]$cs.AppendLine('Q')

Add-Label $cs 48 220 'I consent to receive event-related communications (please tick)'
# Small checkbox
[void]$cs.AppendLine('q')
[void]$cs.AppendLine('1 1 1 rg')
[void]$cs.AppendLine('330 218 16 16 re f')
[void]$cs.AppendLine('0.4 0.45 0.55 RG')
[void]$cs.AppendLine('0.7 w')
[void]$cs.AppendLine('330 218 16 16 re S')
[void]$cs.AppendLine('Q')

# --- Signature line ---
Add-Label $cs 48 170 'Signature'
[void]$cs.AppendLine('48 152 m 320 152 l S')
Add-Label $cs 360 170 'Date'
[void]$cs.AppendLine('360 152 m 545 152 l S')

# Footer band
[void]$cs.AppendLine('0.92 0.95 0.99 rg')
[void]$cs.AppendLine('0 0 ' + $pageWidth + ' 60 re f')
[void]$cs.AppendLine('0.35 0.40 0.50 rg')
[void]$cs.AppendLine('BT')
[void]$cs.AppendLine('/F1 9 Tf')
[void]$cs.AppendLine('48 32 Td')
[void]$cs.AppendLine('(This PDF is rendered by MegaForm PdfForm widget. The HTML inputs above are positioned over each box.) Tj')
[void]$cs.AppendLine('0 -12 Td')
[void]$cs.AppendLine('(On submit, MegaForm flattens your answers onto the PDF and stores the result as an attachment.) Tj')
[void]$cs.AppendLine('ET')

[void]$cs.AppendLine('Q')

$content = $cs.ToString()
$contentBytes = [Text.Encoding]::ASCII.GetBytes($content)

# Build PDF objects
$objects = New-Object 'System.Collections.Generic.List[string]'
$objects.Add('<< /Type /Catalog /Pages 2 0 R >>')                                  # 1
$objects.Add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')                          # 2
$objects.Add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $pageWidth $pageHeight] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>") # 3
$objects.Add("<< /Length $($contentBytes.Length) >>`nstream`n$content`nendstream") # 4
$objects.Add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>') # 5
$objects.Add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>') # 6

# Assemble PDF bytes — compute xref offsets as we go
$out = [System.IO.MemoryStream]::new()
$ascii = [System.Text.Encoding]::ASCII
function Write-Ascii([System.IO.Stream]$s, [string]$text) {
    $b = $ascii.GetBytes($text); $s.Write($b, 0, $b.Length)
}

Write-Ascii $out "%PDF-1.4`n%`xE2`xE3`xCF`xD3`n"
$offsets = New-Object 'System.Collections.Generic.List[int]'
for ($i = 0; $i -lt $objects.Count; $i++) {
    $objects[$i] = $objects[$i]  # ensure string
    $num = $i + 1
    $offsets.Add([int]$out.Position)
    Write-Ascii $out "$num 0 obj`n"
    Write-Ascii $out $objects[$i]
    Write-Ascii $out "`nendobj`n"
}
$xrefPos = [int]$out.Position
$count = $objects.Count + 1
Write-Ascii $out "xref`n0 $count`n0000000000 65535 f `n"
foreach ($off in $offsets) {
    Write-Ascii $out ("{0:D10} 00000 n `n" -f $off)
}
Write-Ascii $out "trailer`n<< /Size $count /Root 1 0 R >>`nstartxref`n$xrefPos`n%%EOF"

$bytes = $out.ToArray()
$out.Dispose()

$pdfPath = Join-Path $here 'sample-registration-form.pdf'
[System.IO.File]::WriteAllBytes($pdfPath, $bytes)

$b64 = [Convert]::ToBase64String($bytes)
$b64Path = Join-Path $here 'sample-registration-form.b64'
[System.IO.File]::WriteAllText($b64Path, $b64, [Text.Encoding]::ASCII)

"PDF: $pdfPath  ({0:N0} bytes, {1:N1} KB)" -f $bytes.Length, ($bytes.Length / 1KB)
"B64: $b64Path  ({0:N0} chars)" -f $b64.Length

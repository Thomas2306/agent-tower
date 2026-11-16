# Fotografa lo schermo (per le prove di AGENT TOWER), finestre trasparenti comprese.
# Uso:
#   powershell -File scripts/screenshot-desktop.ps1 -Uscita docs\prove\foto.png                 # solo la finestra AGENT TOWER (+ un bordo)
#   powershell -File scripts/screenshot-desktop.ps1 -Uscita foto.png -Margine 200                # finestra + 200 px di contesto intorno
#   powershell -File scripts/screenshot-desktop.ps1 -Uscita foto.png -Tutto                      # tutto lo schermo principale
param([string]$Uscita = "schermo.png", [int]$Margine = 16, [switch]$Tutto)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Gdi {
  public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr d, int x, int y, int w, int h, IntPtr s, int sx, int sy, int op);
}
"@
[Gdi]::SetProcessDPIAware() | Out-Null
$schermoL = [Gdi]::GetSystemMetrics(0); $schermoA = [Gdi]::GetSystemMetrics(1)
$x0 = 0; $y0 = 0; $larg = $schermoL; $alt = $schermoA
if (-not $Tutto) {
  $hwnd = [Gdi]::FindWindow([NullString]::Value, "AGENT TOWER")
  if ($hwnd -eq [IntPtr]::Zero) { throw "finestra AGENT TOWER non trovata" }
  $r = New-Object Gdi+RECT; [Gdi]::GetWindowRect($hwnd, [ref]$r) | Out-Null
  $x0 = [Math]::Max(0, $r.L - $Margine); $y0 = [Math]::Max(0, $r.T - $Margine)
  $larg = [Math]::Min($schermoL, $r.R + $Margine) - $x0; $alt = [Math]::Min($schermoA, $r.B + $Margine) - $y0
}
$bmp = New-Object System.Drawing.Bitmap $larg, $alt
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dst = $g.GetHdc(); $src = [Gdi]::GetDC([IntPtr]::Zero)
# SRCCOPY (0x00CC0020) | CAPTUREBLT (0x40000000): include le finestre trasparenti
[Gdi]::BitBlt($dst, 0, 0, $larg, $alt, $src, $x0, $y0, 0x40CC0020) | Out-Null
[Gdi]::ReleaseDC([IntPtr]::Zero, $src) | Out-Null; $g.ReleaseHdc($dst)
$dir = (Resolve-Path -LiteralPath (Split-Path -Parent $Uscita)).Path
$bmp.Save((Join-Path $dir (Split-Path -Leaf $Uscita)), [System.Drawing.Imaging.ImageFormat]::Png)
"schermo ${schermoL}x${schermoA}, foto ${larg}x${alt} da (${x0},${y0}) in $Uscita"
